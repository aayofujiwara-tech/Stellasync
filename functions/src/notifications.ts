import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'

interface MemberDoc {
  role: string
  store_ids?: string[]
  fcm_token?: string
}

interface NotifyTokenRevokedParams {
  orgId: string
  storeId: string
  targetUserId: string
  displayName: string
}

/**
 * トークン失効を検知したとき、担当店舗のマネージャー・エリアMGR に
 * Firestore 通知レコードと FCM プッシュ通知を送る。
 */
export async function notifyTokenRevoked({
  orgId,
  storeId,
  targetUserId,
  displayName,
}: NotifyTokenRevokedParams): Promise<void> {
  const db = getFirestore()
  const message = `${displayName} のXアカウント連携が失効しました。再連携してください。`

  const managersSnap = await db
    .collection('organizations')
    .doc(orgId)
    .collection('members')
    .where('role', 'in', ['manager', 'area_manager'])
    .get()

  const notifBatch = db.batch()
  const fcmTokens: string[] = []
  let notifiedCount = 0

  for (const managerDoc of managersSnap.docs) {
    const member = managerDoc.data() as MemberDoc

    // 店長は自分の担当店舗のみ。エリアMGRは全店舗。
    if (member.role === 'manager' && !(member.store_ids ?? []).includes(storeId)) continue

    notifiedCount++
    const notifRef = db.collection('notifications').doc()
    notifBatch.set(notifRef, {
      org_id: orgId,
      store_id: storeId,
      recipient_id: managerDoc.id,
      type: 'token_revoked',
      target_user_id: targetUserId,
      message,
      is_read: false,
      created_at: FieldValue.serverTimestamp(),
    })

    if (member.fcm_token) {
      fcmTokens.push(member.fcm_token)
    }
  }

  await notifBatch.commit()

  if (notifiedCount === 0) {
    console.warn(`[notifyTokenRevoked] no members to notify for org=${orgId}`)
  }

  if (fcmTokens.length === 0) return

  const response = await getMessaging().sendEachForMulticast({
    tokens: fcmTokens,
    notification: {
      title: 'アカウント連携失効',
      body: message,
    },
    data: {
      type: 'token_revoked',
      target_user_id: targetUserId,
      store_id: storeId,
    },
  })

  response.responses.forEach((r, i) => {
    if (!r.success) {
      console.warn(`[notifications] FCM delivery failed for token[${i}]:`, r.error?.code)
    }
  })
}
