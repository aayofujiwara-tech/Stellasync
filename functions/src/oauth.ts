import { onRequest } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import { encrypt, decrypt } from './crypto'
import type { OAuthSession, AccountTokens, TokenResponse } from './types'

if (getApps().length === 0) {
  initializeApp()
}

const X_CLIENT_ID = defineSecret('X_CLIENT_ID')
const X_CLIENT_SECRET = defineSecret('X_CLIENT_SECRET')
const X_REDIRECT_URI = defineSecret('X_REDIRECT_URI')
const ENCRYPTION_KEY = defineSecret('ENCRYPTION_KEY')

const CORS_ORIGINS = [
  'https://stellasync.uminobozu.com',
  'http://localhost:5173',
  /^https:\/\/[a-z0-9-]+\.stellasync\.pages\.dev$/,  // Cloudflare Pages プレビュー URL
]
const X_AUTH_URL = 'https://x.com/i/oauth2/authorize'
const X_TOKEN_URL = 'https://api.twitter.com/2/oauth2/token'
const X_USER_ME_URL = 'https://api.twitter.com/2/users/me'
const SESSION_TTL_MS = 10 * 60 * 1000 // 10分

/** PKCE S256 code_challenge を生成する */
function buildCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest().toString('base64url')
}

/**
 * POST /auth/x/redirect
 *
 * X OAuth 2.0 PKCE フローを開始する。
 * 未サインイン状態で呼び出し可能（認証不要）。
 * uid は authXCallback で X user_id から確定するため、ここでは保存しない。
 *
 * レスポンス: { redirectUrl: string, sessionSecret: string }
 *   sessionSecret はフロントエンドが localStorage に保存し、callback で送り返す（Login CSRF 対策）
 * Firestore: oauth_sessions/{state} に以下を保存（TTL: 10分）
 *   code_verifier  : string    – PKCE verifier（callback で使用）
 *   session_secret : string    – ブラウザバインド用トークン（hex 64文字）
 *   expires_at     : Timestamp – 現在時刻 + 10分
 *   created_at     : Timestamp – serverTimestamp
 */
export const authXRedirect = onRequest(
  { cors: CORS_ORIGINS, secrets: [X_CLIENT_ID, X_REDIRECT_URI], region: 'asia-northeast2' },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' })
      return
    }

    // PKCE: code_verifier（43〜128文字の base64url ランダム文字列）
    const codeVerifier = randomBytes(32).toString('base64url')
    const codeChallenge = buildCodeChallenge(codeVerifier)
    const state = randomBytes(32).toString('hex')
    // Login CSRF 対策: フローを開始したブラウザだけが知るシークレット
    const sessionSecret = randomBytes(32).toString('hex')

    const db = getFirestore()
    await db.collection('oauth_sessions').doc(state).set({
      code_verifier: codeVerifier,
      session_secret: sessionSecret,
      expires_at: new Date(Date.now() + SESSION_TTL_MS),
      created_at: FieldValue.serverTimestamp(),
    })

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: X_CLIENT_ID.value(),
      redirect_uri: X_REDIRECT_URI.value(),
      scope: 'tweet.read users.read offline.access',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    })

    res.json({ redirectUrl: `${X_AUTH_URL}?${params.toString()}`, sessionSecret })
  }
)

/**
 * POST /auth/x/callback
 *
 * X から受け取った認可コードをアクセストークンに交換して Firestore に保存する。
 * フロントエンドが ?code=<auth_code>&state=<state> をクエリパラメータとして POST する。
 *
 * 処理フロー:
 *   1. oauth_sessions/{state} から code_verifier と uid を取得
 *   2. expires_at を検証
 *   3. X トークンエンドポイントでコード交換
 *   4. GET /2/users/me で X ユーザー情報取得
 *   5. トークンを AES-256-GCM で暗号化
 *   6. accounts/{uid} に保存（merge）
 *   7. oauth_sessions/{state} を削除
 */
export const authXCallback = onRequest(
  {
    cors: CORS_ORIGINS,
    secrets: [X_CLIENT_ID, X_CLIENT_SECRET, X_REDIRECT_URI, ENCRYPTION_KEY],
    region: 'asia-northeast2',
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' })
      return
    }

    // フロントエンドは JSON body で送る
    const code          = req.body?.code           as string | undefined
    const state         = req.body?.state          as string | undefined
    const sessionSecret = req.body?.session_secret as string | undefined

    console.log('[authXCallback] code present:', !!code, 'state present:', !!state, 'secret present:', !!sessionSecret)

    if (!code || !state || !sessionSecret) {
      console.error('[authXCallback] Missing required fields. body keys:', Object.keys(req.body ?? {}))
      res.status(400).json({ error: 'code, state and session_secret are required' })
      return
    }

    const db = getFirestore()
    const sessionRef = db.collection('oauth_sessions').doc(state)
    const sessionDoc = await sessionRef.get()

    if (!sessionDoc.exists) {
      console.error('[authXCallback] Session not found for state:', state)
      res.status(400).json({ error: 'Invalid or expired session' })
      return
    }

    const session = sessionDoc.data() as OAuthSession

    if (new Date() > session.expires_at.toDate()) {
      await sessionRef.delete()
      res.status(400).json({ error: 'Session expired' })
      return
    }

    // Login CSRF 対策: フローを開始したブラウザだけが sessionSecret を知っている
    const providedBuf = Buffer.from(sessionSecret, 'hex')
    const storedBuf   = Buffer.from(session.session_secret, 'hex')
    if (
      providedBuf.length === 0 ||
      providedBuf.length !== storedBuf.length ||
      !timingSafeEqual(providedBuf, storedBuf)
    ) {
      console.error('[authXCallback] session_secret mismatch — possible CSRF attempt')
      res.status(400).json({ error: 'Invalid session' })
      return
    }

    // X トークンエンドポイントへ code を送信
    const credentials = Buffer.from(
      `${X_CLIENT_ID.value()}:${X_CLIENT_SECRET.value()}`
    ).toString('base64')

    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: X_REDIRECT_URI.value(),
      code_verifier: session.code_verifier,
    })

    const tokenRes = await fetch(X_TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenParams.toString(),
    })

    if (!tokenRes.ok) {
      const detail = await tokenRes.text()
      console.error('[authXCallback] Token exchange failed:', tokenRes.status, detail)
      res.status(502).json({ error: 'Failed to obtain tokens from X' })
      return
    }

    const tokenData = (await tokenRes.json()) as TokenResponse

    // X ユーザー情報を取得
    const userRes = await fetch(`${X_USER_ME_URL}?user.fields=name,username`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })

    if (!userRes.ok) {
      res.status(502).json({ error: 'Failed to fetch X user info' })
      return
    }

    const userData = (await userRes.json()) as { data: { id: string; name: string; username: string } }

    // X user_id から Firebase Auth UID を確定（例: x_2956697281）
    const uid = `x_${userData.data.id}`

    // トークンを AES-256-GCM で暗号化して Firestore に保存
    // 初回 OAuth（offline.access スコープ）では refresh_token は必ず返る
    if (!tokenData.refresh_token) {
      console.error('[authXCallback] No refresh_token in X response')
      res.status(502).json({ error: 'No refresh token returned from X' })
      return
    }
    const encryptedAccessToken = encrypt(tokenData.access_token, ENCRYPTION_KEY.value())
    const encryptedRefreshToken = encrypt(tokenData.refresh_token, ENCRYPTION_KEY.value())
    const tokenExpiresAt = Timestamp.fromDate(
      new Date(Date.now() + tokenData.expires_in * 1000)
    )

    const writeBatch = db.batch()
    // プロフィール＋トークンメタデータのみ accounts に保存
    writeBatch.set(
      db.collection('accounts').doc(uid),
      {
        x_user_id: userData.data.id,
        display_name: userData.data.name,
        username: userData.data.username,
        is_active: true,
        token_expires_at: tokenExpiresAt,
        token_status: 'valid',
        token_checked_at: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )
    // トークン実体は account_tokens に保存（クライアント不可視）
    writeBatch.set(
      db.collection('account_tokens').doc(uid),
      {
        access_token: encryptedAccessToken,
        refresh_token: encryptedRefreshToken,
      }
    )
    writeBatch.delete(sessionRef)
    await writeBatch.commit()

    // カスタムトークンを生成してクライアントに返す
    const customToken = await getAuth().createCustomToken(uid)

    res.json({ success: true, customToken, displayName: userData.data.name, username: userData.data.username })
  }
)

/**
 * X アクセストークンをリフレッシュしてアカウント情報を更新する。
 * batchFetch.ts / tokenWatcher.ts 等の Cloud Functions から呼び出される。
 *
 * @param uid           Firebase Auth UID
 * @param encryptionKey AES-256-GCM キー（hex 64文字）
 * @returns 新しいアクセストークン（平文）
 */
export async function refreshXToken(uid: string, encryptionKey: string): Promise<string> {
  const db = getFirestore()
  const tokenDoc = await db.collection('account_tokens').doc(uid).get()

  if (!tokenDoc.exists) {
    throw new Error(`Account tokens not found: ${uid}`)
  }

  const { refresh_token: storedRefreshToken } = tokenDoc.data() as AccountTokens
  const refreshToken = decrypt(storedRefreshToken, encryptionKey)

  const credentials = Buffer.from(
    `${X_CLIENT_ID.value()}:${X_CLIENT_SECRET.value()}`
  ).toString('base64')

  const tokenParams = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })

  const tokenRes = await fetch(X_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: tokenParams.toString(),
  })

  if (!tokenRes.ok) {
    const detail = await tokenRes.text()
    throw new Error(`Failed to refresh X token: ${detail}`)
  }

  const tokenData = (await tokenRes.json()) as TokenResponse

  const encryptedAccessToken = encrypt(tokenData.access_token, encryptionKey)
  // X が新 refresh_token を返さないことがある。返らなければ旧 token を維持（保存破損防止）
  const newRefreshToken = tokenData.refresh_token ?? refreshToken
  const encryptedRefreshToken = encrypt(newRefreshToken, encryptionKey)
  const tokenExpiresAt = Timestamp.fromDate(
    new Date(Date.now() + tokenData.expires_in * 1000)
  )

  const refreshBatch = db.batch()
  // トークン実体は account_tokens に更新
  refreshBatch.update(db.collection('account_tokens').doc(uid), {
    access_token: encryptedAccessToken,
    refresh_token: encryptedRefreshToken,
  })
  // ステータスメタデータは accounts に更新。復活したので失効通知ラッチを解除。
  refreshBatch.update(db.collection('accounts').doc(uid), {
    token_expires_at: tokenExpiresAt,
    token_status: 'valid',
    token_checked_at: FieldValue.serverTimestamp(),
    notification_sent_at: FieldValue.delete(),
  })
  await refreshBatch.commit()

  return tokenData.access_token
}
