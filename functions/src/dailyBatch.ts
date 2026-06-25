import { onSchedule } from 'firebase-functions/v2/scheduler'
import { defineSecret } from 'firebase-functions/params'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore'
import { decrypt } from './crypto'
import { fetchAndStoreMetrics } from './batchFetch'
import type { Account, PostHourlyMetrics } from './types'

if (getApps().length === 0) {
  initializeApp()
}

const ENCRYPTION_KEY = defineSecret('ENCRYPTION_KEY')

const X_USERS_URL = 'https://api.twitter.com/2/users'

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
 * X API からフォロワー数・フォロー数・ツイート数を取得して
 * daily_metrics/{cast_id}_{YYYY-MM-DD} に保存する。
 */
async function fetchFollowerMetrics(
  accountId: string,
  accountData: Account
): Promise<void> {
  if (!accountData.access_token) {
    console.warn(`[dailyBatch] skipping ${accountId}: no access_token stored`)
    return
  }
  const accessToken = decrypt(accountData.access_token, ENCRYPTION_KEY.value())
  const url = `${X_USERS_URL}/${accountData.x_user_id}?user.fields=public_metrics`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    if (res.status === 401) {
      await getFirestore().collection('accounts').doc(accountId).update({
        token_status: 'revoked',
        token_checked_at: FieldValue.serverTimestamp(),
      })
    }
    console.error(`[dailyBatch] X API ${res.status} for account ${accountId}`)
    return
  }

  const body = (await res.json()) as XUserResponse
  if (!body.data) return

  const { followers_count, following_count, tweet_count } = body.data.public_metrics

  await getFirestore()
    .collection('daily_metrics')
    .doc(`${accountId}_${todayJstStr()}`)
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
 * 毎朝 05:00（Asia/Tokyo）に実行される日次バッチ。
 *   1. 全アクティブアカウントのフォロワー数を daily_metrics に保存
 *   2. 直近投稿のメトリクスを 'daily' フェーズで確定取得
 *   3. ベストタイムを再計算して accounts に保存
 */
export const dailyBatch = onSchedule(
  {
    schedule: 'every day 05:00',
    timeZone: 'Asia/Tokyo',
    region: 'asia-northeast2',
    secrets: [ENCRYPTION_KEY],
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
        await calculateBestTimes(doc.id)
      } catch (err) {
        console.error(`[dailyBatch] calculateBestTimes failed for ${doc.id}:`, err)
      }
    }
  }
)
