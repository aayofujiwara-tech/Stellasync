/**
 * デモ用データを全削除する。本番の実キャストデータには絶対に触れない。
 * 対象: org_demo / store_demo_* / demo_cast_* / roles/demo_manager_A
 *
 * 実行:
 *   npm run teardown:demo
 */

import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

initializeApp({ projectId: 'stellasync-app' })

const db = getFirestore()

const DEMO_CAST_IDS = ['demo_cast_a1', 'demo_cast_a2', 'demo_cast_b1', 'demo_cast_b2']
const DEMO_STORE_IDS = ['store_demo_A', 'store_demo_B']

async function deleteInBatches(
  q: FirebaseFirestore.Query,
  label: string,
): Promise<void> {
  let deleted = 0
  while (true) {
    const snap = await q.limit(500).get()
    if (snap.empty) break
    const batch = db.batch()
    snap.docs.forEach((d) => batch.delete(d.ref))
    await batch.commit()
    deleted += snap.docs.length
  }
  if (deleted > 0) console.log(`${label}: ${deleted} 件削除`)
}

async function teardown(): Promise<void> {
  // 1. daily_metrics (demo_cast_* のみ)
  for (const uid of DEMO_CAST_IDS) {
    await deleteInBatches(
      db.collection('daily_metrics').where('cast_id', '==', uid),
      `daily_metrics(${uid})`,
    )
  }

  // 2. accounts (demo_cast_*)
  for (const uid of DEMO_CAST_IDS) {
    await db.collection('accounts').doc(uid).delete()
    console.log(`accounts/${uid} 削除`)
  }

  // 3. stores (store_demo_*)
  for (const sid of DEMO_STORE_IDS) {
    await db.collection('stores').doc(sid).delete()
    console.log(`stores/${sid} 削除`)
  }

  // 4. organizations/org_demo
  await db.collection('organizations').doc('org_demo').delete()
  console.log('organizations/org_demo 削除')

  // 5. roles/demo_manager_A
  await db.collection('roles').doc('demo_manager_A').delete()
  console.log('roles/demo_manager_A 削除')

  console.log('\nteardown:demo 完了')
  process.exit(0)
}

teardown().catch((err) => {
  console.error('teardown:demo failed:', err)
  process.exit(1)
})
