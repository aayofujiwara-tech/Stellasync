/**
 * M-1 移行スクリプト: accounts/{uid} のトークン実体を account_tokens/{uid} へ移動する
 *
 * =========================================================================
 * 【実行前に必ず行うこと】
 * =========================================================================
 * 1. Firestore エクスポート（バックアップ）
 *    gcloud firestore export gs://<YOUR_BUCKET>/backup-pre-m1-$(date +%Y%m%d) \
 *      --collection-ids=accounts
 *
 * 2. 認証情報を設定
 *    set GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\stellasync-app-adminsdk-*.json
 *    (または `firebase login` 後に ADC が使える環境であること)
 *
 * 3. Cloud Functions をデプロイ済みであること
 *    (新コードは account_tokens を読む。移行前にデプロイするとトークンを見失う点に注意)
 *
 * =========================================================================
 * 【推奨デプロイ順序】
 * =========================================================================
 *   Step A: firestore.rules をデプロイ（account_tokens の deny ルールを追加）
 *   Step B: 本スクリプトを実行（tokens を account_tokens にコピー、accounts から削除）
 *   Step C: Cloud Functions をデプロイ（新コードが account_tokens を読む）
 *
 * =========================================================================
 * 【実行方法】
 * =========================================================================
 *   npx ts-node --project tsconfig.scripts.json scripts/migrateTokensToAccountTokens.ts
 *
 * =========================================================================
 * 【ロールバック手順】（もし問題が起きた場合）
 * =========================================================================
 *   1. Cloud Functions を旧バージョンにロールバック（Artifact Registry から旧リビジョンを指定）
 *   2. 下記ロールバックスクリプトを実行して accounts にトークンを書き戻す:
 *
 *   const snap = await db.collection('account_tokens').get()
 *   for (const doc of snap.docs) {
 *     const { access_token, refresh_token } = doc.data()
 *     await db.collection('accounts').doc(doc.id).update({ access_token, refresh_token })
 *   }
 *
 *   3. account_tokens コレクションのドキュメントを削除
 *
 * =========================================================================
 */

import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

initializeApp({ projectId: 'stellasync-app' })

const db = getFirestore()

async function migrate(): Promise<void> {
  console.log('=== M-1 token migration: accounts → account_tokens ===')
  const accountsSnap = await db.collection('accounts').get()

  let migrated = 0
  let skipped = 0
  let errors = 0

  for (const doc of accountsSnap.docs) {
    const data = doc.data()

    if (!data['access_token'] && !data['refresh_token']) {
      console.log(`[skip] ${doc.id}: no tokens to migrate`)
      skipped++
      continue
    }

    try {
      const batch = db.batch()

      // account_tokens/{uid} にトークン実体をコピー
      batch.set(db.collection('account_tokens').doc(doc.id), {
        access_token: data['access_token'] ?? '',
        refresh_token: data['refresh_token'] ?? '',
      })

      // accounts/{uid} からトークンフィールドを削除
      batch.update(db.collection('accounts').doc(doc.id), {
        access_token: FieldValue.delete(),
        refresh_token: FieldValue.delete(),
      })

      await batch.commit()
      console.log(`[migrated] ${doc.id}`)
      migrated++
    } catch (err) {
      console.error(`[error] ${doc.id}:`, err)
      errors++
    }
  }

  console.log(`\nDone: ${migrated} migrated, ${skipped} skipped, ${errors} errors`)
  if (errors > 0) {
    console.error('エラーが発生したアカウントがあります。手動で確認してください。')
    process.exit(1)
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
