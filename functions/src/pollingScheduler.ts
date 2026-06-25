import { onSchedule } from 'firebase-functions/v2/scheduler'
import { defineSecret } from 'firebase-functions/params'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { fetchAndStoreMetrics } from './batchFetch'
import type { Account, StoreData } from './types'

if (getApps().length === 0) {
  initializeApp()
}

const ENCRYPTION_KEY = defineSecret('ENCRYPTION_KEY')

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + (m ?? 0)
}

function getMinutesInTimezone(date: Date, tz: string): number {
  const str = date.toLocaleTimeString('ja-JP', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  return timeToMinutes(str)
}

function isInWindow(now: number, start: number, end: number): boolean {
  if (end < start) {
    // 深夜またぎ（例: 19:00〜06:00）
    return now >= start || now <= end
  }
  return now >= start && now <= end
}

/** 現在時刻と店舗設定からポーリングフェーズを判定する */
export function getPollingPhase(
  now: Date,
  store: StoreData
): 'high' | 'low' | 'daily' | 'skip' {
  const nowMinutes = getMinutesInTimezone(now, store.business_hours.timezone)
  const openMinutes = timeToMinutes(store.business_hours.open)
  const closeMinutes = timeToMinutes(store.business_hours.close)
  const highStart = openMinutes + store.polling_config.high_freq_start_offset
  const highEnd = closeMinutes + store.polling_config.high_freq_end_offset

  // daily: 毎朝05:00 ±14分
  if (Math.abs(nowMinutes - 300) <= 14) return 'daily'

  // high: 高頻度ウィンドウ内（深夜またぎ対応）
  if (isInWindow(nowMinutes, highStart, highEnd)) return 'high'

  // low: low_freq_interval の倍数分に一致（±1分）
  if (nowMinutes % store.polling_config.low_freq_interval <= 1) return 'low'

  return 'skip'
}

async function processStore(
  storeId: string,
  store: StoreData,
  phase: 'high' | 'low' | 'daily',
  now: Date
): Promise<void> {
  const db = getFirestore()

  const accounts = await db
    .collection('accounts')
    .where('store_id', '==', storeId)
    .where('is_active', '==', true)
    .where('token_status', '==', 'valid')
    .get()

  for (const accountDoc of accounts.docs) {
    const data = accountDoc.data() as Account

    const lastFetch = data.last_fetched_at?.toDate() ?? new Date(0)
    const minutesSince = (now.getTime() - lastFetch.getTime()) / 60000

    const interval =
      phase === 'high'
        ? store.polling_config.high_freq_interval
        : phase === 'low'
        ? store.polling_config.low_freq_interval
        : 1440

    // インターバル未満（1分の余裕込み）はスキップ
    if (minutesSince < interval - 1) continue

    try {
      await fetchAndStoreMetrics(accountDoc.id, data, phase)
    } catch (err) {
      // 1アカウントのエラーで全体を止めない
      console.error(`fetchAndStoreMetrics failed for ${accountDoc.id}:`, err)
    }
  }
}

/**
 * 15分ごとに全アクティブ店舗のポーリングフェーズを判定して
 * 各アカウントのメトリクスを取得する。
 * Cloud Scheduler: every 15 minutes / asia-northeast2
 */
export const pollingMaster = onSchedule(
  { schedule: 'every 15 minutes', region: 'asia-northeast2', secrets: [ENCRYPTION_KEY] },
  async () => {
    const now = new Date()
    const db = getFirestore()

    const stores = await db
      .collection('stores')
      .where('is_active', '==', true)
      .get()

    const tasks = stores.docs.map((doc) => {
      const store = doc.data() as StoreData
      const phase = getPollingPhase(now, store)
      if (phase === 'skip') return Promise.resolve()
      return processStore(doc.id, store, phase, now)
    })

    await Promise.allSettled(tasks)
  }
)
