import { onSchedule } from 'firebase-functions/v2/scheduler'
import { defineSecret } from 'firebase-functions/params'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { decrypt } from './crypto'
import { notifyTokenRevoked } from './notifications'
import type { Account } from './types'

if (getApps().length === 0) {
  initializeApp()
}

const ENCRYPTION_KEY = defineSecret('ENCRYPTION_KEY')

/**
 * X API を叩いてトークンの有効性を確認する。
 *   200 → token_checked_at を更新して終了
 *   401 → token_status を 'revoked' に更新し、担当マネージャーに通知
 *   その他 → ログ出力のみ（レート制限・一時障害等は次回の実行で再試行）
 */
async function checkAccountToken(
  accountId: string,
  accountData: Account
): Promise<void> {
  if (!accountData.access_token) {
    console.warn(`[tokenWatcher] skipping ${accountId}: no access_token stored`)
    return
  }
  const accessToken = decrypt(accountData.access_token, ENCRYPTION_KEY.value())
  const url = `https://api.twitter.com/2/users/${accountData.x_user_id}`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  const db = getFirestore()

  if (res.ok) {
    await db.collection('accounts').doc(accountId).update({
      token_checked_at: FieldValue.serverTimestamp(),
    })
    return
  }

  if (res.status !== 401) {
    console.warn(`[tokenWatcher] X API ${res.status} for account ${accountId}`)
    return
  }

  // 401: トークン失効確定 → status 更新 → 通知送信
  await db.collection('accounts').doc(accountId).update({
    token_status: 'revoked',
    token_checked_at: FieldValue.serverTimestamp(),
    notification_sent_at: FieldValue.serverTimestamp(),
  })
  console.warn(`[tokenWatcher] token revoked for account ${accountId}`)

  const orgId = accountData.org_id
  const storeId = accountData.store_id
  if (!orgId || !storeId) return

  await notifyTokenRevoked({
    orgId,
    storeId,
    targetUserId: accountId,
    displayName: accountData.display_name,
  })
}

/**
 * 1時間ごとに全アクティブアカウントのトークン有効性を確認する。
 * 失効を検知した場合は token_status を 'revoked' に更新して担当マネージャーに通知する。
 * 失効済みアカウントは token_status != 'valid' なので次回以降は対象外になる。
 */
export const tokenWatcher = onSchedule(
  {
    schedule: 'every 60 minutes',
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
        await checkAccountToken(doc.id, accountData)
      } catch (err) {
        console.error(`[tokenWatcher] checkAccountToken failed for ${doc.id}:`, err)
      }
    }
  }
)
