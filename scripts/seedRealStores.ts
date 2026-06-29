/**
 * 実店舗3つを本番 Firestore に作成/修正する（StoreData 型完全準拠）。
 * merge:true なので既存ドキュメントの他フィールドを壊さない。
 *
 * 実行:
 *   npm run seed:realstores
 *
 * === キャスト→店舗 マッピング（連携後に store_id を紐付ける用）===
 * MORRIGAN(store_morrigan):            @cassis_morrigan(カシス) / @RURI_MORRIGAN(るり)
 * VIPER(store_viper):                  @ill_viper(ILL) / @hinata_viper(ひなた)
 * 電脳サキュバス(store_cyber_succubus): @rokichi_so(ろきち)  ※もう1人は未定・後日追加
 *
 * getPollingPhase の計算:
 *   open='00:00' → openMinutes=0
 *   close='23:59' → closeMinutes=1439
 *   highStart = 0 + high_freq_start_offset(0) = 0
 *   highEnd   = 1439 + high_freq_end_offset(0) = 1439
 *   isInWindow(now, 0, 1439) → 0〜1439分すべてで true → 終日 'high' フェーズ
 *   （05:00±14分は 'daily' が優先されるが、high_freq も呼ばれた後 daily のみ）
 */

import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

initializeApp({ projectId: 'stellasync-app' })

const db = getFirestore()

const ORG_ID = 'org_nightlife'

const STORES: Array<{ id: string; name: string }> = [
  { id: 'store_morrigan',       name: 'MORRIGAN' },
  { id: 'store_viper',          name: 'VIPER' },
  { id: 'store_cyber_succubus', name: '電脳サキュバス' },
]

async function seed(): Promise<void> {
  // organizations/org_nightlife（変更なし、merge で安全）
  await db.collection('organizations').doc(ORG_ID).set(
    { name: 'ナイトワーク運営', created_at: FieldValue.serverTimestamp() },
    { merge: true },
  )
  console.log(`organizations/${ORG_ID} OK`)

  for (const store of STORES) {
    await db.collection('stores').doc(store.id).set(
      {
        name: store.name,
        org_id: ORG_ID,
        is_active: true,
        business_hours: {
          open:     '00:00',
          close:    '23:59',
          timezone: 'Asia/Tokyo',   // StoreData.business_hours.timezone の正しい位置
        },
        polling_config: {
          high_freq_start_offset: 0,    // openMinutes(0) + 0 = 0 → highStart=0
          high_freq_end_offset:   0,    // closeMinutes(1439) + 0 = 1439 → highEnd=1439 → 終日 high
          high_freq_interval:     15,
          low_freq_interval:      60,
        },
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
