# Stellasync

ナイト系店舗向け X（Twitter）SNS解析・キャスト管理プラットフォーム。
正式名：Stellasync（ステラシンク）　愛称：ステラ

## スタック
- フロントエンド: React + Vite + Tailwind + shadcn/ui + React Router v6
- 認証: Firebase Auth（X OAuth 2.0）
- DB: Firestore
- バックエンド: Cloud Functions（TypeScript）
- スケジューラー: Cloud Scheduler
- シークレット管理: Google Cloud Secret Manager
- 通知: FCM
- ホスティング: Cloudflare Pages（stellasync.uminobozu.com）

## Firebase プロジェクト
- プロジェクトID: stellasync-app
- Blaze プラン

## 設計方針
- XトークンはAES-256-GCMで暗号化してFirestoreに保存
- 暗号化キーはSecret Managerの ENCRYPTION_KEY のみ
- Cloud Functions経由でのみトークンを復号・使用
- ポーリングは15分マスタートリガー1本で全店舗を制御
- TypeScriptのanyは使わない・型は必ず付ける
- 指示された機能以外は実装しない

## 詳細仕様
`cat stellasync.md` で全仕様を確認すること。

## 実装順序
Step 1: crypto.ts + テスト ← 現在のフェーズ
Step 2: X OAuth 2.0フロー
Step 3: batchFetch.ts
Step 4: pollingScheduler.ts
Step 5: dailyBatch.ts
Step 6: tokenWatcher.ts
