/**
 * テスト用組織・店舗を削除し、accounts/x_2956697281 の紐付けを解除するスクリプト。
 * token_status / token_expires_at などトークン系フィールドには一切触らない。
 *
 * メトリクス削除は PURGE_METRICS=true の時のみ実行（既定: false）。
 *
 * 実行:
 *   npm run teardown:store
 */

import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

initializeApp({ projectId: 'stellasync-app' })

const db = getFirestore()

const ORG_ID      = 'org_test'
const STORE_ID    = 'store_test_uminobozu'
const ACCOUNT_UID = 'x_2956697281'

// ★ 本番データ削除フラグ。true にする場合は意図を確認してから。
const PURGE_METRICS = false

async function deleteInBatches(
  query: FirebaseFirestore.Query,
  label: string
): Promise<void> {
  let deleted = 0
  while (true) {
    const snap = await query.limit(500).get()
    if (snap.empty) break
    const batch = db.batch()
    snap.docs.forEach((d) => batch.delete(d.ref))
    await batch.commit()
    deleted += snap.docs.length
    console.log(`  ${label}: ${deleted} 件削除済み...`)
  }
  console.log(`  ${label}: 合計 ${deleted} 件削除完了`)
}

async function teardown(): Promise<void> {
  // 1. アカウント紐付けを解除（is_active / token_* は触らない）
  const accountRef = db.collection('accounts').doc(ACCOUNT_UID)
  const snap = await accountRef.get()
  if (snap.exists) {
    await accountRef.set(
      {
        store_id: FieldValue.delete(),
        org_id: FieldValue.delete(),
      },
      { merge: true }
    )
    console.log(`accounts/${ACCOUNT_UID} → store_id / org_id を削除`)
  } else {
    console.log(`accounts/${ACCOUNT_UID} が存在しないためスキップ`)
  }

  // 2. stores/store_test_uminobozu を削除
  await db.collection('stores').doc(STORE_ID).delete()
  console.log(`stores/${STORE_ID} 削除`)

  // 3. organizations/org_test を削除
  await db.collection('organizations').doc(ORG_ID).delete()
  console.log(`organizations/${ORG_ID} 削除`)

  // 4. メトリクス削除（PURGE_METRICS=true の時のみ）
  if (PURGE_METRICS) {
    console.warn(
      `\nPURGE_METRICS=true: cast_id=${ACCOUNT_UID} のメトリクスを削除します`
    )

    await deleteInBatches(
      db.collection('post_hourly_metrics').where('cast_id', '==', ACCOUNT_UID),
      'post_hourly_metrics'
    )

    await deleteInBatches(
      db.collection('daily_metrics').where('cast_id', '==', ACCOUNT_UID),
      'daily_metrics'
    )
  } else {
    console.log(
      '\nPURGE_METRICS=false: メトリクスは保持します（削除する場合は PURGE_METRICS=true に変更）'
    )
  }

  console.log('\nTeardown complete.')
}

teardown().catch((err) => {
  console.error('Teardown failed:', err)
  process.exit(1)
})
