import { defineSecret } from 'firebase-functions/params'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore'
import { decrypt } from './crypto'
import { refreshXToken, RefreshError } from './oauth'
import type { Account, AccountTokens, PostHourlyMetrics } from './types'

if (getApps().length === 0) {
  initializeApp()
}

const ENCRYPTION_KEY = defineSecret('ENCRYPTION_KEY')
// refreshXToken が内部で使用するシークレット（pollingMaster に mount 宣言が必要）
export const X_CLIENT_ID     = defineSecret('X_CLIENT_ID')
export const X_CLIENT_SECRET = defineSecret('X_CLIENT_SECRET')

const X_TWEETS_URL = 'https://api.twitter.com/2/users'

// X API v2 ツイートオブジェクト（内部型）
interface XTweet {
  id: string
  text?: string
  created_at?: string
  non_public_metrics?: { impression_count: number }
  organic_metrics?: {
    impression_count: number
    like_count: number
    retweet_count: number
  }
  attachments?: { media_keys?: string[] }
  referenced_tweets?: Array<{ type: 'quoted' | 'replied_to' | 'retweeted'; id: string }>
  in_reply_to_user_id?: string
}

interface XTweetsResponse {
  data?: XTweet[]
  errors?: Array<{ message: string; type: string }>
  includes?: {
    tweets?: Array<{ id: string; author_id?: string }>
    media?: Array<{ media_key: string; type: string; url?: string; preview_image_url?: string }>
  }
}

const GUEST_KEYWORDS = ['ゲスト出勤', 'ゲスト降臨', 'ゲスト出演', 'ゲスト来店']
export type PostType = 'original' | 'quote' | 'guest' | 'reply'

function classifyPostType(
  tweet: XTweet,
  includes: XTweetsResponse['includes'],
  selfUserId: string,
  text: string,
): PostType {
  // 1. ゲスト最優先
  if (GUEST_KEYWORDS.some((k) => text.includes(k))) return 'guest'
  const refs = tweet.referenced_tweets ?? []
  // 2. 他人の引用RT
  const quoted = refs.find((r) => r.type === 'quoted')
  if (quoted) {
    const qAuthor = includes?.tweets?.find((t) => t.id === quoted.id)?.author_id
    if (qAuthor && qAuthor !== selfUserId) return 'quote'
    // 自己引用は original へ
  }
  // 3. 他人宛リプライ＝ノイズ
  if (tweet.in_reply_to_user_id && tweet.in_reply_to_user_id !== selfUserId) return 'reply'
  // 自分スレ連投・通常投稿・RT・自己引用は original
  return 'original'
}

function firstMediaThumb(tweet: XTweet, includes: XTweetsResponse['includes']): string | null {
  const key = tweet.attachments?.media_keys?.[0]
  if (!key) return null
  const m = includes?.media?.find((x) => x.media_key === key)
  if (!m) return null
  return m.url ?? m.preview_image_url ?? null
}

/**
 * テキストから #ハッシュタグ を抽出して小文字化した配列を返す。
 * ASCII #・全角 ＃ の両方に対応。日本語ハッシュタグも取得する。
 */
export function extractHashtags(text: string): string[] {
  const matches = text.match(/[#＃][\w　-鿿]+/g)
  return matches ? matches.map((tag) => tag.slice(1).toLowerCase()) : []
}

/**
 * X API エラーステータスに応じてアカウント状態を更新する。
 *   401 → token_status を 'revoked' に更新（リフレッシュ試行後も失敗した場合）
 *   429 → レート制限のためログ出力のみ
 *   その他 → ログ出力のみ
 */
export async function handleTokenError(accountId: string, status: number): Promise<void> {
  if (status === 401) {
    const db = getFirestore()
    await db.collection('accounts').doc(accountId).update({
      token_status: 'revoked',
      token_checked_at: FieldValue.serverTimestamp(),
    })
    console.warn(`[batchFetch] token revoked for account ${accountId}`)
    return
  }
  if (status === 429) {
    console.warn(`[batchFetch] rate limit hit for account ${accountId}`)
    return
  }
  console.error(`[batchFetch] X API error ${status} for account ${accountId}`)
}

/**
 * X API から直近 10 件の投稿メトリクスを取得して Firestore に保存する。
 *
 * トークン管理:
 *   - 事前チェック: token_expires_at が 10 分以内または期限切れなら事前リフレッシュ
 *   - 401 時: refreshXToken でリフレッシュ後 1 回だけリトライ
 *   - リフレッシュも失敗した場合のみ token_status: 'revoked' に更新
 *
 * 保存先: post_hourly_metrics/{post_id}_{hour_offset}（merge: true）
 *   投稿から 24 時間を超えた投稿は phase !== 'daily' の場合スキップ。
 *   デルタ値は前の hour_offset ドキュメントとの差分から算出。
 * 更新: accounts/{accountId}.last_fetched_at
 */
export async function fetchAndStoreMetrics(
  accountId: string,
  accountData: Account,
  phase: 'high' | 'low' | 'daily'
): Promise<void> {
  if (!/^\d+$/.test(accountData.x_user_id)) {
    console.error(`[batchFetch] invalid x_user_id for ${accountId}: ${accountData.x_user_id}`)
    return
  }
  const db = getFirestore()
  const tokenDoc = await db.collection('account_tokens').doc(accountId).get()
  if (!tokenDoc.exists) {
    console.warn(`[batchFetch] skipping ${accountId}: no tokens stored`)
    return
  }
  let accessToken = decrypt((tokenDoc.data() as AccountTokens).access_token, ENCRYPTION_KEY.value())

  // 事前リフレッシュ: 期限まで 10 分以内または既に期限切れ
  const expiresAt = accountData.token_expires_at?.toDate()
  const refreshThreshold = new Date(Date.now() + 10 * 60 * 1000)
  if (!expiresAt || expiresAt <= refreshThreshold) {
    try {
      accessToken = await refreshXToken(accountId, ENCRYPTION_KEY.value())
      console.log(`[batchFetch] proactive token refresh succeeded for ${accountId}`)
    } catch (e) {
      console.warn(`[batchFetch] proactive refresh failed for ${accountId}, using existing token:`, e)
    }
  }

  const url =
    `${X_TWEETS_URL}/${accountData.x_user_id}/tweets` +
    '?tweet.fields=non_public_metrics,organic_metrics,created_at,attachments,text,referenced_tweets,in_reply_to_user_id' +
    '&expansions=attachments.media_keys,referenced_tweets.id' +
    '&media.fields=url,preview_image_url,type' +
    '&max_results=10'

  let tweetRes = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15000),
  })

  // 401: リフレッシュ後 1 回リトライ。それでも失敗したら revoke
  if (!tweetRes.ok && tweetRes.status === 401) {
    try {
      accessToken = await refreshXToken(accountId, ENCRYPTION_KEY.value())
      tweetRes = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15000) })
      console.log(`[batchFetch] token refreshed on 401, retry status: ${tweetRes.status} for ${accountId}`)
    } catch (e) {
      // 一時障害（5xx / HTML / ネットワーク等）→ revoked にせず次回リトライに委ねる
      const isPermanent = e instanceof RefreshError && e.kind === 'permanent'
      if (!isPermanent) {
        const label = e instanceof RefreshError ? 'transient' : 'unexpected error'
        console.warn(`[batchFetch] ${label} on refresh for ${accountId}, will retry next cycle:`, e)
        return
      }
      await handleTokenError(accountId, 401)
      return
    }
  }

  if (!tweetRes.ok) {
    await handleTokenError(accountId, tweetRes.status)
    return
  }

  const tweetData = (await tweetRes.json()) as XTweetsResponse

  if (!tweetData.data || tweetData.data.length === 0) {
    await getFirestore().collection('accounts').doc(accountId).update({
      last_fetched_at: FieldValue.serverTimestamp(),
    })
    return
  }

  const now = new Date()
  const batch = db.batch()
  let newestMs = 0

  for (const tweet of tweetData.data) {
    if (!tweet.created_at) continue

    const postedAt = new Date(tweet.created_at)
    const elapsedMs = now.getTime() - postedAt.getTime()
    const hoursSincePost = elapsedMs / (60 * 60 * 1000)
    const hourOffset = Math.floor(hoursSincePost)

    // newest_post_at 用に先に更新（24h超の投稿でも最新時刻は正しく記録）
    newestMs = Math.max(newestMs, postedAt.getTime())

    // 24時間超の投稿は daily フェーズ以外スキップ
    if (hoursSincePost > 24 && phase !== 'daily') continue

    const impCumulative =
      tweet.non_public_metrics?.impression_count ??
      tweet.organic_metrics?.impression_count ??
      0
    const likeCumulative = tweet.organic_metrics?.like_count ?? 0
    const rtCumulative = tweet.organic_metrics?.retweet_count ?? 0

    // 前の hour_offset ドキュメントを読んでデルタを算出
    let impDelta = impCumulative
    let likeDelta = likeCumulative
    let rtDelta = rtCumulative

    if (hourOffset > 0) {
      const prevDocId = `${tweet.id}_${hourOffset - 1}`
      const prevDoc = await db.collection('post_hourly_metrics').doc(prevDocId).get()
      if (prevDoc.exists) {
        const prev = prevDoc.data() as PostHourlyMetrics
        impDelta = Math.max(0, impCumulative - prev.imp_cumulative)
        likeDelta = Math.max(0, likeCumulative - prev.like_cumulative)
        rtDelta = Math.max(0, rtCumulative - prev.rt_cumulative)
      }
    }

    const docId = `${tweet.id}_${hourOffset}`
    const docRef = db.collection('post_hourly_metrics').doc(docId)
    const postType = classifyPostType(tweet, tweetData.includes, accountData.x_user_id, tweet.text ?? '')

    batch.set(
      docRef,
      {
        post_id: tweet.id,
        cast_id: accountId,
        store_id: accountData.store_id ?? '',
        org_id: accountData.org_id ?? '',
        posted_at: Timestamp.fromDate(postedAt),
        posted_hour: postedAt.getHours(),
        posted_dow: postedAt.getDay(),
        hour_offset: hourOffset,
        imp_delta: impDelta,
        like_delta: likeDelta,
        rt_delta: rtDelta,
        imp_cumulative: impCumulative,
        like_cumulative: likeCumulative,
        rt_cumulative: rtCumulative,
        fetch_phase: phase,
        has_media: (tweet.attachments?.media_keys?.length ?? 0) > 0,
        media_url: firstMediaThumb(tweet, tweetData.includes),
        post_type: postType,
        text: tweet.text ?? '',
        hashtags: extractHashtags(tweet.text ?? ''),
        fetched_at: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    // 初速サンプル（投稿後 1.05h 以内のみ）
    if (hoursSincePost <= 1.05) {
      const elapsedMin = elapsedMs / 60000
      const slot = Math.min(60, Math.floor(elapsedMin / 15) * 15)
      batch.set(
        db.collection('post_velocity').doc(tweet.id),
        {
          post_id: tweet.id,
          cast_id: accountId,
          store_id: accountData.store_id ?? '',
          org_id: accountData.org_id ?? '',
          posted_at: Timestamp.fromDate(postedAt),
          post_type: postType,
          has_media: (tweet.attachments?.media_keys?.length ?? 0) > 0,
          samples: {
            [String(slot)]: {
              imp: impCumulative,
              like: likeCumulative,
              rt: rtCumulative,
              at: Timestamp.fromDate(now),
            },
          },
        },
        { merge: true },
      )
    }
  }

  await batch.commit()

  await db.collection('accounts').doc(accountId).update({
    last_fetched_at: FieldValue.serverTimestamp(),
    ...(newestMs > 0 ? { newest_post_at: Timestamp.fromMillis(newestMs) } : {}),
  })
}
