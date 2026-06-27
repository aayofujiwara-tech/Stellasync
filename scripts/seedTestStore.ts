/**
 * テスト用組織・店舗を本番 Firestore に作成し、
 * 既存アカウント x_2956697281 を収集対象に紐付けるスクリプト。
 *
 * 実行前準備:
 *   set GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\adminsdk.json
 * 実行:
 *   npm run seed:store
 * 終了時:
 *   npm run teardown:store
 */

import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

initializeApp({ projectId: 'stellasync-app' })

const db = getFirestore()

const ORG_ID     = 'org_test'
const STORE_ID   = 'store_test_uminobozu'
const ACCOUNT_UID = 'x_2956697281'

async function seed(): Promise<void> {
  // 1. organizations/org_test
  await db.collection('organizations').doc(ORG_ID).set(
    { name: 'テスト組織(uminobozu)', created_at: FieldValue.serverTimestamp() },
    { merge: true }
  )
  console.log(`organizations/${ORG_ID} OK`)

  // 2. stores/store_test_uminobozu（常時オープン窓: open=00:00, close=23:59, offset=0）
  await db.collection('stores').doc(STORE_ID).set({
    name: 'テスト店舗(uminobozu)',
    org_id: ORG_ID,
    is_active: true,
    business_hours: {
      open: '00:00',
      close: '23:59',
      timezone: 'Asia/Tokyo',
    },
    polling_config: {
      high_freq_start_offset: 0,
      high_freq_end_offset: 0,
      high_freq_interval: 15,
      low_freq_interval: 60,
    },
  })
  console.log(`stores/${STORE_ID} OK`)

  // 3. accounts/x_2956697281 の存在確認 → merge で store_id/org_id を付与
  const accountRef = db.collection('accounts').doc(ACCOUNT_UID)
  const snap = await accountRef.get()
  if (!snap.exists) {
    throw new Error(
      `accounts/${ACCOUNT_UID} が見つかりません。先に本番で X ログインしておくこと。`
    )
  }

  const existing = snap.data() as Record<string, unknown>
  console.log(
    `accounts/${ACCOUNT_UID} 既存 store_id: ${existing['store_id'] ?? '(未設定)'}`
  )

  await accountRef.set(
    {
      store_id: STORE_ID,
      org_id: ORG_ID,
      is_active: true,
      last_fetched_at: FieldValue.delete(),
    },
    { merge: true }
  )
  console.log(
    `accounts/${ACCOUNT_UID} → store_id=${STORE_ID}, org_id=${ORG_ID}, last_fetched_at クリア済み`
  )

  console.log('\nSeed complete. 次の 15 分 tick またはボタン押下で収集が始まります。')
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
