import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { fetchAndStoreMetrics, X_CLIENT_ID, X_CLIENT_SECRET } from './batchFetch'
import { refreshXToken, RefreshError } from './oauth'
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
      } catch (e) {
        if (e instanceof RefreshError && e.kind === 'transient') {
          throw new HttpsError('internal', 'X側の一時的な問題です。しばらくしてから再度お試しください')
        }
        throw new HttpsError('failed-precondition', 'トークンが無効です。再連携してください')
      }
    }

    // サーバ側クールダウン: トランザクションで last_fetched_at を atomic に確認・更新。
    // 並行リクエストが同じ古い last_fetched_at を読んでクールダウンをバイパスするレースを防ぐ。
    const now = Date.now()
    let cooldownRetryAfterSec = 0
    const cooldownPassed = await db.runTransaction(async (tx) => {
      const freshSnap = await tx.get(ref)
      if (!freshSnap.exists) return false
      const last = (freshSnap.data() as Account).last_fetched_at?.toDate()?.getTime() ?? 0
      const wait = COOLDOWN_MS - (now - last)
      if (wait > 0) {
        cooldownRetryAfterSec = Math.ceil(wait / 1000)
        return false
      }
      tx.update(ref, { last_fetched_at: FieldValue.serverTimestamp() })
      return true
    })
    if (!cooldownPassed) {
      return { ok: false as const, reason: 'cooldown' as const, retryAfterSec: cooldownRetryAfterSec }
    }

    // 窓判定を無視して即収集。phase='high'（直近投稿の現スナップショット）。
    await fetchAndStoreMetrics(uid, account, 'high')
    return { ok: true as const }
  }
)
