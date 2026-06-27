import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { fetchAndStoreMetrics, X_CLIENT_ID, X_CLIENT_SECRET } from './batchFetch'
import { refreshXToken } from './oauth'
import type { Account } from './types'

if (getApps().length === 0) initializeApp()

const ENCRYPTION_KEY = defineSecret('ENCRYPTION_KEY')
const COOLDOWN_MS = 60_000  // 60秒。連打・レート制限・並行実行を一括で防ぐ。

export const manualFetch = onCall(
  { region: 'asia-northeast2', secrets: [ENCRYPTION_KEY, X_CLIENT_ID, X_CLIENT_SECRET] },
  async (request) => {
    const uid = request.auth?.uid
    if (!uid) throw new HttpsError('unauthenticated', 'ログインが必要です')

    // uid == accountId（= x_<x_user_id>）。よって自分のアカウントしか叩けない。
    const db = getFirestore()
    const ref = db.collection('accounts').doc(uid)
    const snap = await ref.get()
    if (!snap.exists) throw new HttpsError('not-found', 'アカウントが見つかりません')
    const account = snap.data() as Account

    if (account.token_status !== 'valid') {
      // 即拒否せず、まず1回リフレッシュを試す（成功すれば refreshXToken が status を valid に戻す）
      try {
        await refreshXToken(uid, ENCRYPTION_KEY.value())
      } catch {
        throw new HttpsError('failed-precondition', 'トークンが無効です。再連携してください')
      }
    }

    // サーバ側クールダウン（last_fetched_at は scheduled/manual 共通で更新される）
    const last = account.last_fetched_at?.toDate()?.getTime() ?? 0
    const wait = COOLDOWN_MS - (Date.now() - last)
    if (wait > 0) {
      return { ok: false as const, reason: 'cooldown' as const, retryAfterSec: Math.ceil(wait / 1000) }
    }

    // 窓判定を無視して即収集。phase='high'（直近投稿の現スナップショット）。
    await fetchAndStoreMetrics(uid, account, 'high')
    return { ok: true as const }
  }
)
