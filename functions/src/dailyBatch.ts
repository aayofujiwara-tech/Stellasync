import { onSchedule } from 'firebase-functions/v2/scheduler'
import { defineSecret } from 'firebase-functions/params'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore'
import { decrypt } from './crypto'
import { fetchAndStoreMetrics, X_CLIENT_ID, X_CLIENT_SECRET } from './batchFetch'
import { refreshXToken, RefreshError } from './oauth'
import type { Account, AccountTokens, PostHourlyMetrics } from './types'

if (getApps().length === 0) {
  initializeApp()
}

const ENCRYPTION_KEY = defineSecret('ENCRYPTION_KEY')

const X_USERS_URL = 'https://api.twitter.com/2/users'

/** 1営業日の区切り時刻（JST）。将来は stores ごとの設定値に置き換え可能。 */
const BUSINESS_DAY_START_HOUR = 10

interface XPublicMetrics {
  followers_count: number
  following_count: number
  tweet_count: number
}

interface XUserResponse {
  data?: {
    id: string
    public_metrics: XPublicMetrics
  }
}

/** 現在日時を Asia/Tokyo の YYYY-MM-DD 文字列で返す（ドキュメントIDに使用） */
function todayJstStr(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' }).slice(0, 10)
}

/**
 * 直近に完了した営業日（BUSINESS_DAY_START_HOUR 区切り）の開始日を JST YYYY-MM-DD で返す。
 * 10:30 実行前提: JST 時刻 >= BUSINESS_DAY_START_HOUR なら前日、未満なら前々日。
 */
function lastBusinessDayStr(): string {
  const jstHour = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCHours()
  const daysBack = jstHour >= BUSINESS_DAY_START_HOUR ? 1 : 2
  return new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)
    .toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' })
    .slice(0, 10)
}

/**
 * X API からフォロワー数・フォロー数・ツイート数を取得して
 * daily_metrics/{cast_id}_{YYYY-MM-DD} に保存する。
 */
async function fetchFollowerMetrics(
  accountId: string,
  accountData: Account
): Promise<void> {
  const db = getFirestore()
  const tokenDoc = await db.collection('account_tokens').doc(accountId).get()
  if (!tokenDoc.exists) {
    console.warn(`[dailyBatch] skipping ${accountId}: no tokens stored`)
    return
  }
  let accessToken = decrypt((tokenDoc.data() as AccountTokens).access_token, ENCRYPTION_KEY.value())

  // 事前リフレッシュ: 期限まで 10 分以内または既に期限切れ（batchFetch と同じロジック）
  const expiresAt = accountData.token_expires_at?.toDate()
  const refreshThreshold = new Date(Date.now() + 10 * 60 * 1000)
  if (!expiresAt || expiresAt <= refreshThreshold) {
    try {
      accessToken = await refreshXToken(accountId, ENCRYPTION_KEY.value())
      console.log(`[dailyBatch] proactive token refresh succeeded for ${accountId}`)
    } catch (e) {
      console.warn(`[dailyBatch] proactive refresh failed for ${accountId}, using existing token:`, e)
    }
  }

  const url = `${X_USERS_URL}/${accountData.x_user_id}?user.fields=public_metrics`

  let res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  // 401: リフレッシュ後 1 回リトライ。それでも失敗したら kind で分岐（batchFetch と同じ）
  if (!res.ok && res.status === 401) {
    try {
      accessToken = await refreshXToken(accountId, ENCRYPTION_KEY.value())
      res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
      console.log(`[dailyBatch] token refreshed on 401, retry status: ${res.status} for ${accountId}`)
    } catch (e) {
      const isPermanent = e instanceof RefreshError && e.kind === 'permanent'
      if (!isPermanent) {
        const label = e instanceof RefreshError ? 'transient' : 'unexpected error'
        console.warn(`[dailyBatch] ${label} on refresh for ${accountId}, will retry next cycle:`, e)
        return
      }
      await db.collection('accounts').doc(accountId).update({
        token_status: 'revoked',
        token_checked_at: FieldValue.serverTimestamp(),
      })
      console.warn(`[dailyBatch] permanent refresh failure for ${accountId}, revoked`)
      return
    }
  }

  if (!res.ok) {
    console.error(`[dailyBatch] X API ${res.status} for account ${accountId}`)
    return
  }

  const body = (await res.json()) as XUserResponse
  if (!body.data) return

  const { followers_count, following_count, tweet_count } = body.data.public_metrics

  await getFirestore()
    .collection('daily_metrics')
    .doc(`${accountId}_${lastBusinessDayStr()}`)
    .set(
      {
        cast_id: accountId,
        store_id: accountData.store_id ?? '',
        org_id: accountData.org_id ?? '',
        date: FieldValue.serverTimestamp(),
        followers: followers_count,
        following: following_count,
        tweet_count,
      },
      { merge: true }
    )
}

/**
 * 過去30日分の時間別初速データ（hour_offset=1）を集計して
 * 投稿時間ごとの平均インプレッション増加量を算出する。
 * サンプル数が3未満の時間帯は除外。結果を accounts/{accountId}.best_times に保存する。
 */
async function calculateBestTimes(accountId: string): Promise<void> {
  const db = getFirestore()
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const snap = await db
    .collection('post_hourly_metrics')
    .where('cast_id', '==', accountId)
    .where('posted_at', '>=', Timestamp.fromDate(thirtyDaysAgo))
    .where('hour_offset', '==', 1)
    .get()

  const byHour = new Map<number, number[]>()

  for (const doc of snap.docs) {
    const m = doc.data() as PostHourlyMetrics
    // ベスト投稿時間は reply（他人宛リプライ）を除外。post_type 無しの旧データは original 扱いで含める。
    if ((m.post_type ?? 'original') === 'reply') continue
    const arr = byHour.get(m.posted_hour) ?? []
    arr.push(m.imp_delta)
    byHour.set(m.posted_hour, arr)
  }

  const bestTimes: Array<{ hour: number; avg_imp: number; sample_count: number }> = []

  for (const [hour, values] of byHour.entries()) {
    if (values.length < 3) continue
    const avg_imp = Math.round(values.reduce((a, b) => a + b, 0) / values.length)
    bestTimes.push({ hour, avg_imp, sample_count: values.length })
  }

  bestTimes.sort((a, b) => b.avg_imp - a.avg_imp)

  await db.collection('accounts').doc(accountId).update({
    best_times: bestTimes,
    best_times_updated_at: FieldValue.serverTimestamp(),
  })
}

/**
 * 当日(JST)の post_hourly_metrics を集計し、
 * daily_metrics/{accountId}_{YYYY-MM-DD} に IMP/いいね/RT/投稿数を追記する。
 * 各 post_id の最新 hour_offset の累計値を採用して合算する。
 */
async function aggregatePostMetrics(accountId: string): Promise<void> {
  const db = getFirestore()
  const bizDayStr = lastBusinessDayStr()
  const padHour = String(BUSINESS_DAY_START_HOUR).padStart(2, '0')
  const windowStart = Timestamp.fromDate(new Date(`${bizDayStr}T${padHour}:00:00+09:00`))
  const windowEnd   = Timestamp.fromDate(new Date(`${todayJstStr()}T${padHour}:00:00+09:00`))

  const snap = await db
    .collection('post_hourly_metrics')
    .where('cast_id', '==', accountId)
    .where('posted_at', '>=', windowStart)
    .where('posted_at', '<', windowEnd)
    .get()

  if (snap.empty) return

  const latest = new Map<string, PostHourlyMetrics>()
  for (const d of snap.docs) {
    const m = d.data() as PostHourlyMetrics
    const existing = latest.get(m.post_id)
    if (!existing || m.hour_offset > existing.hour_offset) latest.set(m.post_id, m)
  }

  if (latest.size === 0) return

  type PostType = 'original' | 'quote' | 'guest' | 'reply'
  const bucket = () => ({ impressions: 0, likes: 0, retweets: 0, posts_count: 0 })
  const by_type: Record<PostType, ReturnType<typeof bucket>> = {
    original: bucket(), quote: bucket(), guest: bucket(), reply: bucket(),
  }

  let impressions = 0
  let likes = 0
  let retweets = 0
  let wmC = 0, wmImp = 0, wmLike = 0       // original × メディアあり
  let womC = 0, womImp = 0, womLike = 0    // original × メディアなし

  for (const m of latest.values()) {
    impressions += m.imp_cumulative
    likes += m.like_cumulative
    retweets += m.rt_cumulative

    const t = (m.post_type ?? 'original') as PostType
    const b = by_type[t] ?? by_type.original
    b.impressions += m.imp_cumulative
    b.likes += m.like_cumulative
    b.retweets += m.rt_cumulative
    b.posts_count += 1

    if (t === 'original') {
      if (m.has_media) { wmC++;  wmImp  += m.imp_cumulative; wmLike  += m.like_cumulative }
      else             { womC++; womImp += m.imp_cumulative; womLike += m.like_cumulative }
    }
  }

  const media_breakdown = {
    with_media:    { posts_count: wmC,  avg_imp: wmC  ? Math.round(wmImp / wmC)   : 0, avg_like: wmC  ? Math.round(wmLike / wmC)   : 0 },
    without_media: { posts_count: womC, avg_imp: womC ? Math.round(womImp / womC) : 0, avg_like: womC ? Math.round(womLike / womC) : 0 },
  }

  await db
    .collection('daily_metrics')
    .doc(`${accountId}_${bizDayStr}`)
    .set({ impressions, likes, retweets, posts_count: latest.size, by_type, media_breakdown }, { merge: true })
}

/**
 * 毎朝 10:30（Asia/Tokyo）に実行される日次バッチ。
 *   1. 全アクティブアカウントのフォロワー数を daily_metrics に保存
 *   2. 直近投稿のメトリクスを 'daily' フェーズで確定取得
 *   3. ベストタイムを再計算して accounts に保存
 */
export const dailyBatch = onSchedule(
  {
    schedule: 'every day 10:30',
    timeZone: 'Asia/Tokyo',
    region: 'asia-northeast2',
    secrets: [ENCRYPTION_KEY, X_CLIENT_ID, X_CLIENT_SECRET],
  },
  async () => {
    const db = getFirestore()

    const accountsSnap = await db
      .collection('accounts')
      .where('is_active', '==', true)
      .where('token_status', '==', 'valid')
      .get()

    for (const doc of accountsSnap.docs) {
      const accountData = doc.data() as Account

      try {
        await fetchFollowerMetrics(doc.id, accountData)
      } catch (err) {
        console.error(`[dailyBatch] fetchFollowerMetrics failed for ${doc.id}:`, err)
      }

      try {
        await fetchAndStoreMetrics(doc.id, accountData, 'daily')
      } catch (err) {
        console.error(`[dailyBatch] fetchAndStoreMetrics failed for ${doc.id}:`, err)
      }

      try {
        await aggregatePostMetrics(doc.id)
      } catch (err) {
        console.error(`[dailyBatch] aggregatePostMetrics failed for ${doc.id}:`, err)
      }

      try {
        await calculateBestTimes(doc.id)
      } catch (err) {
        console.error(`[dailyBatch] calculateBestTimes failed for ${doc.id}:`, err)
      }
    }
  }
)
