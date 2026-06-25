import { defineSecret } from 'firebase-functions/params'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore'
import { decrypt } from './crypto'
import type { Account, PostHourlyMetrics } from './types'

if (getApps().length === 0) {
  initializeApp()
}

const ENCRYPTION_KEY = defineSecret('ENCRYPTION_KEY')

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
}

interface XTweetsResponse {
  data?: XTweet[]
  errors?: Array<{ message: string; type: string }>
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
 *   401 → token_status を 'revoked' に更新
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
  if (!accountData.access_token) {
    console.warn(`[batchFetch] skipping ${accountId}: no access_token stored`)
    return
  }
  const accessToken = decrypt(accountData.access_token, ENCRYPTION_KEY.value())

  const url =
    `${X_TWEETS_URL}/${accountData.x_user_id}/tweets` +
    '?tweet.fields=non_public_metrics,organic_metrics,created_at,attachments,text' +
    '&expansions=attachments.media_keys' +
    '&max_results=10'

  const tweetRes = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

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

  const db = getFirestore()
  const now = new Date()
  const batch = db.batch()

  for (const tweet of tweetData.data) {
    if (!tweet.created_at) continue

    const postedAt = new Date(tweet.created_at)
    const elapsedMs = now.getTime() - postedAt.getTime()
    const hoursSincePost = elapsedMs / (60 * 60 * 1000)
    const hourOffset = Math.floor(hoursSincePost)

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
        hashtags: extractHashtags(tweet.text ?? ''),
        fetched_at: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )
  }

  await batch.commit()

  await db.collection('accounts').doc(accountId).update({
    last_fetched_at: FieldValue.serverTimestamp(),
  })
}
