/**
 * 実店舗3つを本番 Firestore に作成する。
 * merge:true なので既存ドキュメントがあっても上書きしない（安全）。
 *
 * 実行:
 *   npm run seed:realstores
 *
 * === キャスト→店舗 マッピング（連携後に store_id を紐付ける用）===
 * MORRIGAN(store_morrigan):            @cassis_morrigan(カシス) / @RURI_MORRIGAN(るり)
 * VIPER(store_viper):                  @ill_viper(ILL) / @hinata_viper(ひなた)
 * 電脳サキュバス(store_cyber_succubus): @rokichi_so(ろきち)  ※もう1人は未定・後日追加
 */

import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

initializeApp({ projectId: 'stellasync-app' })

const db = getFirestore()

const ORG_ID = 'org_nightlife'

const STORES = [
  { id: 'store_morrigan',      name: 'MORRIGAN' },
  { id: 'store_viper',         name: 'VIPER' },
  { id: 'store_cyber_succubus', name: '電脳サキュバス' },
] as const

async function seed(): Promise<void> {
  // 1. organizations/org_nightlife
  await db.collection('organizations').doc(ORG_ID).set(
    { name: 'ナイトワーク運営', created_at: FieldValue.serverTimestamp() },
    { merge: true },
  )
  console.log(`organizations/${ORG_ID} OK`)

  // 2. stores
  for (const store of STORES) {
    await db.collection('stores').doc(store.id).set(
      {
        name: store.name,
        org_id: ORG_ID,
        timezone: 'Asia/Tokyo',
        business_hours: { open: '00:00', close: '23:59' },
        polling_config: { high_freq_interval: 15, low_freq_interval: 60 },
        created_at: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
    console.log(`stores/${store.id} (${store.name}) OK`)
  }

  console.log('\nseed:realstores 完了')
  process.exit(0)
}

seed().catch((err) => {
  console.error('seed:realstores failed:', err)
  process.exit(1)
})
