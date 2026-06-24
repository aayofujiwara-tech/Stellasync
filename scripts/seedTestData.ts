/**
 * Firestore テストデータ投入スクリプト
 *
 * 実行前準備（ADC認証が必要）:
 *   1. Firebase Console → プロジェクト設定 → サービスアカウント
 *      → 「新しい秘密鍵の生成」で JSON をダウンロード
 *   2. 環境変数を設定:
 *      set GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\key.json  (Windows)
 *      export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json (Mac/Linux)
 *   3. 実行:
 *      npx ts-node scripts/seedTestData.ts
 */

import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

initializeApp({ projectId: 'stellasync-app' })

const db = getFirestore()

async function seed(): Promise<void> {
  // stores/test-store-001
  await db.collection('stores').doc('test-store-001').set({
    name: 'テスト店舗',
    org_id: 'test-org-001',
    is_active: true,
    business_hours: {
      open: '20:00',
      close: '04:00',
      timezone: 'Asia/Tokyo',
    },
    polling_config: {
      high_freq_start_offset: -60,
      high_freq_end_offset: 120,
      high_freq_interval: 15,
      low_freq_interval: 120,
    },
  })
  console.log('stores/test-store-001 OK')

  // accounts/test-account-001
  await db.collection('accounts').doc('test-account-001').set({
    x_user_id: '33109285',
    display_name: '海野坊頭',
    store_id: 'test-store-001',
    org_id: 'test-org-001',
    access_token: '',
    refresh_token: '',
    token_status: 'valid',
    is_active: true,
    last_fetched_at: null,
    token_checked_at: null,
    notification_sent_at: null,
  })
  console.log('accounts/test-account-001 OK')

  console.log('\nSeed complete.')
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
