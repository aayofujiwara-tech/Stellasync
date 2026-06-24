import { onRequest } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore'
import { createHash, randomBytes } from 'crypto'
import { encrypt, decrypt } from './crypto'
import type { OAuthSession, Account, TokenResponse } from './types'

if (getApps().length === 0) {
  initializeApp()
}

const X_CLIENT_ID = defineSecret('X_CLIENT_ID')
const X_CLIENT_SECRET = defineSecret('X_CLIENT_SECRET')
const X_REDIRECT_URI = defineSecret('X_REDIRECT_URI')
const ENCRYPTION_KEY = defineSecret('ENCRYPTION_KEY')

const CORS_ORIGINS = ['https://stellasync.uminobozu.com', 'http://localhost:5173']
const X_AUTH_URL = 'https://twitter.com/i/oauth2/authorize'
const X_TOKEN_URL = 'https://api.twitter.com/2/oauth2/token'
const X_USER_ME_URL = 'https://api.twitter.com/2/users/me'
const SESSION_TTL_MS = 10 * 60 * 1000 // 10分

/** PKCE S256 code_challenge を生成する */
function buildCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest().toString('base64url')
}

/**
 * GET /auth/x/redirect
 *
 * X OAuth 2.0 PKCE フローを開始する。
 * クエリパラメータ ?uid=<firebase-uid> が必要。
 *
 * Firestore: oauth_sessions/{state} に以下を保存（TTL: 10分）
 *   code_verifier : string    – PKCE verifier（callback で使用）
 *   uid           : string    – Firebase Auth UID
 *   expires_at    : Timestamp – 現在時刻 + 10分
 *   created_at    : Timestamp – serverTimestamp
 */
export const authXRedirect = onRequest(
  { cors: CORS_ORIGINS, secrets: [X_CLIENT_ID, X_REDIRECT_URI], region: 'asia-northeast2' },
  async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' })
      return
    }

    const uid = req.query['uid'] as string | undefined
    if (!uid) {
      res.status(400).json({ error: 'uid is required' })
      return
    }

    // PKCE: code_verifier（43〜128文字の base64url ランダム文字列）
    const codeVerifier = randomBytes(32).toString('base64url')
    const codeChallenge = buildCodeChallenge(codeVerifier)
    const state = randomBytes(32).toString('hex')

    const db = getFirestore()
    await db.collection('oauth_sessions').doc(state).set({
      code_verifier: codeVerifier,
      uid,
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

    res.redirect(`${X_AUTH_URL}?${params.toString()}`)
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

    const code = req.query['code'] as string | undefined
    const state = req.query['state'] as string | undefined

    if (!code || !state) {
      res.status(400).json({ error: 'code and state are required' })
      return
    }

    const db = getFirestore()
    const sessionRef = db.collection('oauth_sessions').doc(state)
    const sessionDoc = await sessionRef.get()

    if (!sessionDoc.exists) {
      res.status(400).json({ error: 'Invalid or expired session' })
      return
    }

    const session = sessionDoc.data() as OAuthSession

    if (new Date() > session.expires_at.toDate()) {
      await sessionRef.delete()
      res.status(400).json({ error: 'Session expired' })
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
      res.status(502).json({ error: 'Failed to obtain tokens from X', detail })
      return
    }

    const tokenData = (await tokenRes.json()) as TokenResponse

    // X ユーザー情報を取得
    const userRes = await fetch(`${X_USER_ME_URL}?user.fields=name`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })

    if (!userRes.ok) {
      res.status(502).json({ error: 'Failed to fetch X user info' })
      return
    }

    const userData = (await userRes.json()) as { data: { id: string; name: string } }

    // トークンを AES-256-GCM で暗号化して Firestore に保存
    const encryptedAccessToken = encrypt(tokenData.access_token, ENCRYPTION_KEY.value())
    const encryptedRefreshToken = encrypt(tokenData.refresh_token, ENCRYPTION_KEY.value())
    const tokenExpiresAt = Timestamp.fromDate(
      new Date(Date.now() + tokenData.expires_in * 1000)
    )

    await db.collection('accounts').doc(session.uid).set(
      {
        access_token: encryptedAccessToken,
        refresh_token: encryptedRefreshToken,
        token_expires_at: tokenExpiresAt,
        token_status: 'valid',
        token_checked_at: FieldValue.serverTimestamp(),
        x_user_id: userData.data.id,
        display_name: userData.data.name,
      },
      { merge: true }
    )

    // セッションを削除
    await sessionRef.delete()

    res.json({ success: true })
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
  const accountDoc = await db.collection('accounts').doc(uid).get()

  if (!accountDoc.exists) {
    throw new Error(`Account not found: ${uid}`)
  }

  const account = accountDoc.data() as Account
  const refreshToken = decrypt(account.refresh_token, encryptionKey)

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
  const encryptedRefreshToken = encrypt(tokenData.refresh_token, encryptionKey)
  const tokenExpiresAt = Timestamp.fromDate(
    new Date(Date.now() + tokenData.expires_in * 1000)
  )

  await db.collection('accounts').doc(uid).update({
    access_token: encryptedAccessToken,
    refresh_token: encryptedRefreshToken,
    token_expires_at: tokenExpiresAt,
    token_status: 'valid',
    token_checked_at: FieldValue.serverTimestamp(),
  })

  return tokenData.access_token
}
