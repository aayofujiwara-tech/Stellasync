# Stellasync — 設計仕様書

> ナイト系店舗向け X（Twitter）SNS解析・キャスト管理プラットフォーム
> 正式名：Stellasync（ステラシンク）　愛称：ステラ  
> 最終更新: 2026-06-24 v3

---

## 目次

1. [プロダクト概要](#1-プロダクト概要)
2. [競合・類似サービス調査](#2-競合類似サービス調査)
3. [機能一覧](#3-機能一覧)
4. [追加提案機能（競合調査より）](#4-追加提案機能競合調査より)
5. [技術設計](#5-技術設計)
6. [X APIポーリング設計](#6-x-apiポーリング設計)
7. [セキュリティ設計](#7-セキュリティ設計)
8. [権限・ロール設計（RBAC）](#8-権限ロール設計rbac)
9. [Firestoreデータ設計](#9-firestoreデータ設計)
10. [Cloud Functions一覧](#10-cloud-functions一覧)
11. [開発ロードマップ](#11-開発ロードマップ)
12. [費用設計](#12-費用設計)
13. [料金設計（想定）](#13-料金設計想定)

---

## 1. プロダクト概要

### 背景

ナイト系店舗（キャバクラ・ホストクラブ・ガールズバー等）においてキャストのX（Twitter）発信力は集客に直結するが、これを組織的に可視化・管理するツールは存在しない。一般のSNS分析ツールは企業マーケター向けであり、店舗×キャスト×エリアマネージャーという階層管理の概念がない。

### 解決する課題

- エリアMGRが各店舗・各キャストのSNS発信力を横断的に把握できない
- 投稿後「どの時間帯にどれだけ伸びたか」の時系列データが取れない
- キャストのXアカウント連携状況を店長が管理できない
- 月次報告用のデータ出力が手作業（スクリーンショット）になっている

### ポジショニング

```
                SNS解析あり
                    ↑
          SocialDog │ SINIS
                    │
一般業態 ───────────┼─────────── ナイト業態特化
                    │
                    │  ★ Stellasync（空白地帯）
                    │
          tasteck   │
          melty     │
                    ↓
                SNS解析なし
```

---

## 2. 競合・類似サービス調査

### 一般SNS分析ツール

| ツール | 強み | 月額 | Stellasyncとの差 |
|--------|------|------|----------------|
| SocialDog | 国産・100万ユーザー | 無料〜 | 階層管理なし・企業向け |
| SINIS for X | 無料・45日分 | 無料〜 | 個人単位のみ |
| つぶやきデスク | 複数アカウント・承認フロー | 月5万円〜 | 高価・企業PR向け |
| Hootsuite | 多SNS対応 | 月6,400円〜 | 英語圏設計 |

### ナイト業態向けツール

| ツール | 強み | 月額 | SNS解析 |
|--------|------|------|---------|
| tasteck | シフト・指名率・同伴管理 | 月5,000円〜 | なし |
| melty | キャスト個人向け顧客管理 | 不明 | なし |
| お水簿 | 来店記録・売掛管理 | 無料 | なし |

### インフルエンサー管理ツール（類似）

| ツール | 参考にできる機能 |
|--------|----------------|
| Astream | フォロワー属性（年代・男女比）分析、PR関与率スコア、50項目以上の指標 |
| REECH DATABASE | インフルエンサーリスト管理・ステータス管理・CSVエクスポート |
| ICONSQUARE | 曜日・時間帯別エンゲージメント分析、競合ベンチマーク、デイリーレポートメール配信 |
| Buffer | 診断的分析（なぜ伸びたか）・コンテンツタイプ別効果比較 |

### 競合調査から判明した差別化ポイント

1. **投稿後の時間別インプレッション追跡** — どのツールも提供していない
2. **ナイト業態の階層構造（エリアMGR→店長→キャスト）** — 存在しない
3. **店舗横断ベンチマーク** — 同業態内での比較が可能
4. **営業時間連動ポーリング** — 深夜営業に最適化した費用設計

---

## 3. 機能一覧

### 3.1 コア機能（Phase 1〜2）

#### 3.1.1 インプレッション・エンゲージメント分析

- 投稿ごとのインプレッション / いいね / リツイートの累計値表示
- **投稿後の時間別推移グラフ**（独自機能）
  - 営業時間帯：15分間隔取得
  - 閉店後〜翌営業前：2時間間隔取得
  - 投稿から24時間以降：1日1回取得
- タブ切り替えで IMP / いいね / RT を切り替え表示
- 増加ピーク時間帯 Top5 表示

#### 3.1.2 フォロワー推移管理

- 日次フォロワー数の取得・蓄積（毎朝5時の日次バッチに統合）
- フォロワー推移グラフ（日次・週次）
- 前日比・前週比の増減表示
- following数・tweet数も合わせて記録

#### 3.1.3 3階層ダッシュボード

- **エリアMGRビュー**：3店舗横断の合計指標・週次推移・店舗別比較
- **店舗ビュー**：キャスト一覧・ランキング・店舗合計指標
- **個人（キャスト）ビュー**：自分のデータのみ・週次推移・投稿一覧
- パンくずナビゲーションによるドリルダウン操作

### 3.2 運用機能（Phase 2〜3）

#### 3.2.1 アカウント管理

- エリアMGRによる招待・アカウント作成
- 論理削除（休止）・再有効化
- X連携状態の一覧表示（連携済み / 未連携 / 失効）

#### 3.2.2 営業時間・ポーリング設定

- 店舗ごとの営業時間登録（開店・閉店時刻・タイムゾーン）
- 高頻度ポーリングの開始・終了オフセット設定（分単位）
- 各ポーリング間隔のカスタム設定
- 深夜またぎ営業に対応（例：20:00〜04:00）

#### 3.2.3 通知機能

- Xアカウント連携解除・トークン失効の自動検知（1時間ごとのバッチ監視）
- FCMプッシュ通知 + アプリ内通知で店長へアラート
- 未連携キャストの一覧警告表示

#### 3.2.4 データエクスポート

- 月次レポートのCSV出力（BOM付きUTF-8・Excel対応）
- Cloud Storageに保存、署名付きURL（7日間有効）で配信
- エクスポート完了をプッシュ通知で通知

#### 3.2.5 論理削除・アカウント休止

- `is_active: false` フラグによる論理削除
- 退職キャストのデータをランキングから除外
- 再有効化機能

### 3.3 分析拡張機能（Phase 3〜4）

#### 3.3.1 ベストタイム表示

- 過去30日分の時間別初速データから投稿に最適な時間帯を自動算出
- キャストごとに「22時台の投稿が最も伸びる」などを表示
- サンプル3件以上のデータのみ表示（信頼性担保）

#### 3.3.2 店舗間ベンチマーク

- 店舗ごとの平均エンゲージメント率・週次IMP比較
- エリアMGRが全店舗のパフォーマンスを横並びで確認

---

## 4. 追加提案機能（競合調査より）

### 4.1 コンテンツタイプ別分析

投稿に画像がついているか・テキストのみかによってインプレッションが変わる傾向をデータで示す。実装メモ：X APIの `attachments` フィールドを取得してメディア有無をフラグとして保存。

### 4.2 ハッシュタグ効果分析

投稿に含まれるハッシュタグごとの平均IMP比較。実装メモ：投稿テキストから正規表現でハッシュタグを抽出してFirestoreに保存し、集計クエリで平均算出。

### 4.3 フォロワー増減と投稿の相関表示

投稿頻度・内容とフォロワー増減の関係を週単位で並べて表示。「投稿を増やした週にフォロワーが伸びた」パターンを可視化する。

### 4.4 デイリーサマリーメール配信

毎朝、前日の各キャストのIMP・いいね・RTをまとめたサマリーメールを店長に送信。Cloud Schedulerで毎朝8時に起動、Firestore集計結果をメール送信。

### 4.5 エンゲージメント品質スコア

フォロワー数ではなく「いいね率・RT率」を組み合わせたスコアを0〜100で算出。

```
quality_score = (like_rate × 0.6 + rt_rate × 0.4) × 100
like_rate  = likes / impressions
rt_rate    = retweets / impressions
```

### 4.6 初速スコア（バズ検知）

投稿後1時間のIMP増加速度をスコア化し、急拡散中の投稿をアラートで通知。

### 4.7 曜日×時間帯ヒートマップ

曜日（月〜日）×時間帯（0〜23時）のマトリクスで平均IMPをヒートマップ表示。

---

## 5. 技術設計

### スタック

| レイヤー | 技術 |
|---------|------|
| フロントエンド | React + Vite + Tailwind + shadcn/ui |
| ルーティング | React Router v6 |
| 認証 | Firebase Auth（OAuthログイン） |
| DB | Firestore |
| バックエンド | Cloud Functions（TypeScript） |
| ストレージ | Cloud Storage（エクスポートファイル） |
| スケジューラー | Cloud Scheduler（15分ごとのマスタートリガー1本） |
| シークレット管理 | Google Cloud Secret Manager |
| プッシュ通知 | Firebase Cloud Messaging（FCM） |
| ホスティング | Cloudflare Pages（独自ドメイン統一） |

### 取得エンドポイント

```
# ツイートメトリクス（non_public_metrics = OAuth必須）
GET /2/users/:id/tweets
  ?tweet.fields=non_public_metrics,organic_metrics,created_at,attachments
  &expansions=attachments.media_keys

# フォロワー数（public_metrics = OAuth不要）
GET /2/users/:id
  ?user.fields=public_metrics
```

### Cloudflare Pages × Cloud Functions の役割分担

DMMリネームWebでの開発経験から判明した問題を踏まえた構成。

```
Cloudflare Pages（静的ホスティングのみ）
  └── React + Vite の静的ビルド成果物を配置
        ↓ Firebase SDK（クライアント）で直接通信
Firebase Auth    ← 認証
Firestore        ← データ読み取り（セキュリティルールで制御）
Cloud Functions  ← 書き込み・バッチ処理・機密処理
```

**Cloudflare Pages は静的ファイルの配信のみ担当する。**
サーバーサイド処理・APIルートは一切持たない。これによりDMMリネームで発生した Next.js × Cloudflare の互換性問題（`@opennextjs/cloudflare` の `contexts` TypeError など）を回避できる。

### DMMリネームで発生した問題と対策

| 問題 | DMMリネームでの発生 | Stellasyncでの対策 |
|------|-------------------|-------------------|
| Next.js × Cloudflare 非互換 | `@cloudflare/next-on-pages`（Next.js 15非対応）・`@opennextjs/cloudflare`（`contexts` TypeError）で詰まった | Viteで静的ビルド → Cloudflare Pagesに置くだけ。Next.jsを使わない |
| 環境変数がWorkers実行時に渡らない | `wrangler secret put` した変数がGitHub Actions経由のデプロイで実行時に渡らず500エラー | バックエンドをCloud Functions（GCP）に移す。Cloudflare側に環境変数を持たせない |
| SSRの互換性 | `react-dom/server.edge` が解決できず404 | フロントは完全CSR（クライアントサイドレンダリング）で設計 |

### ⚠️ CORS設定（Phase 1で必ず対応）

フロントエンド（Cloudflare Pages）からCloud FunctionsのhttpsエンドポイントへのAPIリクエストでCORSエラーが発生する。**Phase 1の段階でCloud Functions側に必ず設定する。**

```typescript
// functions/src/index.ts（エントリーポイント）
import { onRequest } from 'firebase-functions/v2/https'

export const api = onRequest({
  cors: ['https://stellasync.uminobozu.com', 'http://localhost:5173'],
}, async (req, res) => {
  // ...
})
```

ローカル開発時（`localhost:5173`）と本番（`stellasync.uminobozu.com`）の両方を許可リストに入れておく。

---

## 6. X APIポーリング設計

### 設計方針：ハイブリッド方式（営業時間カスタム対応）

投稿をトリガーにするのは技術的に困難（X APIにWebhookなし・常時監視は高コスト）なため、時間帯別の定時バッチ方式を採用する。ナイト系店舗の投稿は深夜に集中するため、営業時間帯のみ高頻度にすることでコストを最適化する。

### ポーリングフェーズ

| フェーズ | タイミング | 間隔 | 用途 |
|---------|-----------|------|------|
| 高頻度 | 開店offset〜閉店offset | 15分 | バズ検知・時間別グラフ精度 |
| 低頻度 | それ以外の時間帯 | 2時間 | フォロワー推移・前日投稿追跡 |
| 日次 | 毎朝5時（固定） | 1日1回 | 過去データ確定・ベストタイム計算・フォロワー数取得 |

### 店舗別設定（Firestoreに保存・エリアMGRが変更可）

```typescript
// stores/{storeId} に追加
business_hours: {
  open:     '20:00',
  close:    '04:00',       // 深夜またぎ対応
  timezone: 'Asia/Tokyo',
}

polling_config: {
  high_freq_start_offset: -60,   // 開店60分前から高頻度開始
  high_freq_end_offset:   120,   // 閉店120分後まで高頻度継続
  high_freq_interval:     15,    // 高頻度間隔（分）
  low_freq_interval:      120,   // 低頻度間隔（分）
}
```

### 設定例

```
店舗設定例（20:00〜04:00営業）

高頻度ウィンドウ: 19:00〜06:00（開店-60分〜閉店+120分）
低頻度ウィンドウ: 06:00〜19:00
日次バッチ:       毎朝05:00（フォロワー数 + 過去データ確定）
```

### スケジューラー構成

Cloud Scheduler は15分ごとの単一トリガー1本のみ。Function内でフェーズ判定を行い、各店舗・アカウントの処理を振り分ける。

```
Cloud Scheduler（every 15 minutes）
        ↓
pollingMaster（Cloud Function）
        ↓
  店舗ごとに getPollingPhase() でフェーズ判定
        ├── 'high'  → 15分以上経過したアカウントを高頻度取得
        ├── 'low'   → 2時間以上経過したアカウントを低頻度取得
        ├── 'daily' → フォロワー数 + 過去投稿の確定取得
        └── 'skip'  → 何もしない
```

### コスト削減のポイント

- **last_fetched_at** をアカウントごとに記録し、interval未満ならスキップ
- **アクティブアカウントのみ対象**（7日間投稿なしは日次のみ）
- **X APIの24時間重複排除ルール**を活用（同一投稿IDの再取得はカウントされない）

### フォロワー数の取得

フォロワー数はツイートメトリクスとは別で取得。日次バッチ（毎朝5時）に統合することでリクエスト増加を最小限に抑える。

```
GET /2/users/:id?user.fields=public_metrics
→ followers_count / following_count / tweet_count を daily_metrics に保存
```

---

## 7. セキュリティ設計

### 7.1 トークン暗号化（AES-256-GCM）

Firestoreに保存するXのアクセストークン・リフレッシュトークンは AES-256-GCM で暗号化。暗号化キーは Cloud Secret Manager に保管し、Firestoreには絶対に入れない。

```typescript
// 保存時：encrypt(token, ENCRYPTION_KEY) → Firestoreに暗号文のみ保存
// 取得時：decrypt(encrypted_token, ENCRYPTION_KEY) → Cloud Functions内でのみ復号
```

### 7.2 Firestoreセキュリティルール

- キャストは自分のドキュメントのみ読取可
- `access_token` / `refresh_token` はクライアントから直接読取不可
- 書き込みは Cloud Functions 経由のみ

### 7.3 多層防御

| レイヤー | 対策 |
|---------|------|
| DBの中身 | AES-256-GCM暗号化 |
| 暗号化キー | Secret Manager（DBに入れない・コードに書かない） |
| DB行アクセス | Firestoreセキュリティルール |
| 列アクセス | Cloud Functionsのみアクセス可能 |
| API呼び出し | Cloud Functions内での権限チェック（二重防御） |

---

## 8. 権限・ロール設計（RBAC）

### 役職とデフォルト権限

```typescript
const ROLE_DEFAULTS = {
  area_manager: [
    'view:all_stores',
    'view:metrics',
    'manage:accounts',
    'manage:stores',
    'manage:roles',
    'export:data',
  ],
  manager: [
    'view:store',
    'view:metrics',
    'export:data',
  ],
  cast: [
    'view:own',
    'view:metrics',
  ],
  // 将来の拡張用
  // sub_manager: [...],
  // auditor: [...],
}
```

### 個別権限付与の仕組み

- ロールはあくまで「デフォルト権限セット」
- エリアMGRが特定の店長に `view:all_stores` を追加付与可能
- 「店長だが全体も見られる」を自然に表現できる
- 将来的に役職が増えても `ROLE_DEFAULTS` に1行追加するだけ

### 権限チェックフロー

```
クライアント → Cloud Function呼び出し
                ↓
            Firebase Auth でUID確認
                ↓
            Firestore の members/{uid} から permissions 取得
                ↓
            必要パーミッションと照合
                ↓
            OK → 処理実行 / NG → permission-denied エラー
```

---

## 9. Firestoreデータ設計

### コレクション構造

```
organizations/{orgId}
  └── members/{userId}
        role: string
        permissions: string[]
        store_ids: string[]
        email: string
        fcm_token: string
        created_by: string
        created_at: timestamp
        is_active: boolean

stores/{storeId}
  name: string
  org_id: string
  is_active: boolean
  business_hours: {
    open: string               # 例: '20:00'
    close: string              # 例: '04:00'（深夜またぎ対応）
    timezone: string           # 例: 'Asia/Tokyo'
  }
  polling_config: {
    high_freq_start_offset: number   # 開店の何分前から（分）
    high_freq_end_offset: number     # 閉店の何分後まで（分）
    high_freq_interval: number       # 高頻度間隔（分）
    low_freq_interval: number        # 低頻度間隔（分）
  }

accounts/{userId}
  x_user_id: string
  display_name: string
  store_id: string
  org_id: string
  access_token: string               # AES-256-GCM暗号化済み
  refresh_token: string              # AES-256-GCM暗号化済み
  token_expires_at: timestamp
  token_status: 'valid'|'expired'|'revoked'
  token_checked_at: timestamp
  notification_sent_at: timestamp|null
  last_fetched_at: timestamp         # 最終ポーリング時刻（スキップ判定用）
  is_active: boolean
  deactivated_at: timestamp|null
  deactivated_by: string|null
  best_times: Array<{hour, avg_imp, sample_count}>
  best_times_updated_at: timestamp

daily_metrics/{cast_id}_{date}
  cast_id: string
  store_id: string
  org_id: string
  date: timestamp
  impressions: number
  likes: number
  retweets: number
  followers: number                  # 日次バッチで取得
  following: number                  # 日次バッチで取得
  tweet_count: number                # 累計ツイート数
  posts_count: number                # 当日の投稿数

post_hourly_metrics/{post_id}_{hour_offset}
  post_id: string
  cast_id: string
  store_id: string
  posted_at: timestamp
  posted_hour: number                # 0〜23
  posted_dow: number                 # 0〜6（曜日）
  hour_offset: number                # 投稿からの経過時間（h）
  imp_delta: number
  like_delta: number
  rt_delta: number
  imp_cumulative: number
  like_cumulative: number
  rt_cumulative: number
  fetch_phase: 'high'|'low'|'daily'
  has_media: boolean                 # 画像・動画の有無
  hashtags: string[]

notifications/{notifId}
  org_id: string
  store_id: string
  recipient_id: string
  type: 'token_expired'|'token_revoked'|'account_deactivated'|'export_ready'
  target_user_id: string
  message: string
  is_read: boolean
  created_at: timestamp

exports/{exportId}
  org_id: string
  requested_by: string
  store_ids: string[]
  period_start: timestamp
  period_end: timestamp
  format: 'csv'|'pdf'
  status: 'pending'|'processing'|'done'|'error'
  download_url: string|null
  expires_at: timestamp|null
  created_at: timestamp
```

---

## 10. Cloud Functions一覧

| ファイル | トリガー | 内容 |
|---------|---------|------|
| `auth.ts` | — | 権限チェックユーティリティ |
| `permissions.ts` | — | RBAC定義・ROLE_DEFAULTS |
| `crypto.ts` | — | AES-256-GCM暗号化・復号 |
| `members.ts` | onCall | アカウント招待・論理削除・権限更新 |
| `pollingScheduler.ts` | Scheduler（every 15 minutes） | フェーズ判定・店舗別ポーリング振り分け |
| `batchFetch.ts` | pollingSchedulerから呼び出し | X APIからIMP/いいね/RTを取得・保存 |
| `dailyBatch.ts` | Scheduler（毎日05:00） | フォロワー数取得・過去データ確定・ベストタイム計算 |
| `tokenWatcher.ts` | Scheduler（1時間ごと） | トークン有効性チェック・失効検知 |
| `notifications.ts` | — | FCM通知・Firestoreへの通知記録 |
| `exports.ts` | onCall | CSV生成・Cloud Storage保存・URL配布 |

---



---

## 11. プロジェクト構成

### Firebaseプロジェクト方針

Stellasync は BlindUp・hotel-qms とは**独立した新規 Firebase プロジェクト**として作成する。既存プロジェクトと同居しない理由は以下のとおり。

- Firestore セキュリティルール・Cloud Functions が混在すると管理が複雑になる
- X API クレデンシャルや暗号化キーをプロジェクト単位で完全分離できる
- 将来的に別チームや外部パートナーへ移管しやすい
- Blaze プランへの課金をプロダクト単位で明確にできる

### プロジェクト名（案）

```
Firebase プロジェクトID: stellasync-app
Cloudflare Pages:        stellasync.uminobozu.com（独自ドメイン）
```

### ディレクトリ構成（案）

```
stellasync/
  ├── functions/                  # Cloud Functions（TypeScript）
  │     ├── src/
  │     │     ├── crypto.ts       # AES-256-GCM 暗号化・復号
  │     │     ├── auth.ts         # 権限チェックユーティリティ
  │     │     ├── permissions.ts  # RBAC 定義
  │     │     ├── members.ts      # アカウント管理
  │     │     ├── pollingScheduler.ts  # 15分マスタートリガー
  │     │     ├── batchFetch.ts   # X API ポーリング
  │     │     ├── dailyBatch.ts   # フォロワー取得・ベストタイム集計
  │     │     ├── tokenWatcher.ts # トークン失効監視
  │     │     ├── notifications.ts # FCM通知
  │     │     └── exports.ts      # CSVエクスポート
  │     ├── package.json
  │     └── tsconfig.json
  ├── src/                        # フロントエンド（React + Vite）
  │     ├── components/
  │     ├── pages/
  │     ├── hooks/
  │     └── lib/
  │           └── firebase.ts     # Firebase SDK 初期化
  ├── .dev.vars                   # ローカル開発用シークレット（.gitignore）
  ├── .env.local                  # フロント用環境変数（.gitignore）
  ├── firebase.json
  ├── firestore.rules
  └── vite.config.ts
```

### 環境変数管理

```bash
# .env.local（フロントエンド・Cloudflare Pages環境変数）
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_PROJECT_ID=stellasync-app
VITE_FIREBASE_APP_ID=...

# Cloud Functions シークレット（Secret Manager）
ENCRYPTION_KEY=（32バイトhex文字列）

# ローカル開発用（.dev.vars）
ENCRYPTION_KEY=（同上・本番と同じキーか開発用キー）
```

---

## 12. 開発ロードマップ（改訂版）

### 前提：自分のアカウントで先に動作確認する

βテスト（キャストへの展開）の前に、よう さん自身のXアカウント（@uminobozu125）を使って全機能の動作を確認する。これにより「キャストに使ってもらう前に問題を発見できる」「API費用の実態を把握できる」「デモとして見せられるものが先にできる」という三つのメリットがある。

### Phase 0（1〜2週間）：準備

- [ ] 新規 Firebase プロジェクト作成（stellasync-app）
- [ ] Firebase Blaze プランへ移行（クレジットカード登録）
- [ ] X API Developer Portal 登録・$5チャージ・クレデンシャル取得
- [ ] Secret Manager に `ENCRYPTION_KEY` 登録
- [ ] Firestore スキーマ作成（stores / accounts / daily_metrics / post_hourly_metrics）
- [ ] Cloudflare Pages プロジェクト作成・独自ドメイン設定
- [ ] テスター確保（1店舗3〜5名・ヒアリング後）

**マイルストーン：環境が整い、いつでも実装を始められる状態**

### Phase 1（4〜5週間）：バックエンド基盤

最難関フェーズ。UIを作る前にデータが取れることを確認する。

- [ ] `crypto.ts` 実装・単体テスト
- [ ] X Developer Portal でアプリ登録・コールバックURL設定
- [ ] OAuth 2.0 フロー実装（@uminobozu125 の1アカウントで疎通）
- [ ] トークン暗号化・Firestoreへの保存確認
- [ ] `batchFetch.ts` 実装（IMP/いいね/RT が Firestore に入ることを確認）
- [ ] `pollingScheduler.ts` 実装（15分マスタートリガー・フェーズ判定）
- [ ] `dailyBatch.ts` 実装（フォロワー数取得・daily_metrics 保存）
- [ ] `tokenWatcher.ts` 実装（失効検知・FCM通知）

**マイルストーン：@uminobozu125 のIMP/いいね/RT/フォロワーが Firestore に自動蓄積される**

### Phase 2（3〜4週間）：フロントエンド基盤 + 個人ビュー

- [ ] React + Vite + Tailwind + shadcn/ui 初期設定
- [ ] Firebase Auth 連携（X でサインイン UI）
- [ ] キャスト個人ダッシュボード（IMP/いいね/RT 週次グラフ・タブ切り替え）
- [ ] フォロワー推移グラフ（日次・週次・前日比）
- [ ] 投稿一覧（フェーズバッジ・指標サマリー）
- [ ] 時間別推移グラフ（投稿別 IMP/いいね/RT 時系列）
- [ ] Firestore セキュリティルール設定

**マイルストーン：@uminobozu125 が自分でサインインして全データを確認できる → βテスト開始の最低ライン**

### Phase 3（3〜4週間）：クローズドβ（1店舗・5アカウント）

- [ ] 店舗ビュー（キャスト一覧・ランキング・合計指標）
- [ ] RBAC 権限管理（エリアMGR招待・役職別表示制御）
- [ ] 営業時間・ポーリング設定 UI
- [ ] 未連携アラート UI
- [ ] アカウント休止・再有効化機能
- [ ] フィードバック収集導線設置

**マイルストーン：1店舗5名が2週間継続利用・改善点リスト化完了**

### Phase 4（3〜4週間）：3店舗展開・収益化判断

- [ ] エリアMGR ビュー（3店舗横断ダッシュボード・ドリルダウン）
- [ ] CSV エクスポート（Cloud Storage 配信・署名付きURL）
- [ ] ベストタイム表示
- [ ] 店舗間ベンチマーク
- [ ] Phase 3 フィードバック反映
- [ ] 料金モデル確定・請求フロー検討

**マイルストーン：3店舗30名稼働・継続利用意向確認・有料化判断**

### Phase 5（以降）：外部展開

- [ ] 他ナイト系グループへの展開
- [ ] デイリーサマリーメール配信
- [ ] エンゲージメント品質スコア
- [ ] Instagram 対応（盛れカルテとの連携視野）

**総工期目安：Phase 0〜4 で約 14〜19 週間（週末・隙間時間開発想定）**

---

## 13. Phase 1 実装着手順序

自分のアカウント（@uminobozu125）で動作確認しながら進める。

```
Step 1  crypto.ts を実装して単体テスト
        └── encrypt/decrypt が正しく動くことを確認

Step 2  X Developer Portal でアプリ登録
        └── Client ID / Client Secret / Callback URL を .env.local に保存

Step 3  OAuth 2.0 フローを最小実装
        └── @uminobozu125 でサインインしてトークンが
            暗号化されて Firestore に保存されることを確認

Step 4  batchFetch.ts で手動実行テスト
        └── 直近10件の投稿の IMP/いいね/RT が
            post_hourly_metrics に入ることを確認

Step 5  pollingScheduler.ts を実装
        └── Cloud Scheduler（every 15 minutes）でトリガー
            → フェーズ判定 → batchFetch の流れを確認

Step 6  dailyBatch.ts を実装
        └── 毎朝5時にフォロワー数が daily_metrics に保存されることを確認

Step 7  tokenWatcher.ts を実装
        └── 意図的にトークンを失効させてアラートが飛ぶことを確認

Step 8  1〜2週間のデータ蓄積を確認してから Phase 2 へ
```

### Claude Code への最初の指示文（テンプレ）

```
stellasync という新しい Firebase プロジェクト向けの
Cloud Functions（TypeScript）を実装してほしい。

まず最初に functions/src/crypto.ts を作成して。
仕様：
- Node.js の crypto モジュールを使った AES-256-GCM 暗号化・復号
- 鍵は Firebase Secret Manager の ENCRYPTION_KEY（hex文字列）から取得
- encrypt(plaintext, keyHex): string
- decrypt(encoded, keyHex): string
- IV は毎回ランダム生成（12バイト）
- iv + authTag + ciphertext を base64 で返す形式

次に単体テストも書いて、暗号化→復号→元の文字列に戻ることを確認できるようにして。
```

## 14. 費用設計

### X API費用試算（30アカウント・3店舗）

ナイト系店舗の営業時間例：20:00〜04:00（高頻度ウィンドウ 19:00〜06:00）

| バッチ | 間隔 | 時間帯 | リクエスト数/月 | 単価 | 費用 |
|--------|------|--------|---------------|------|------|
| 高頻度 | 15分 | 19:00〜06:00（11h） | 44回×30×30=39,600 | $0.001 | $40 |
| 低頻度 | 2時間 | 06:00〜19:00（13h） | 7回×30×30=6,300 | $0.001 | $6 |
| 日次IMP確定 | 1日1回 | 05:00 | 1×30×30=900 | $0.001 | $1 |
| フォロワー取得 | 1日1回 | 05:00 | 1×30×30=900 | $0.010 | $9 |
| **合計** | | | | | **約$56/月** |

24時間重複排除ルール適用・非アクティブアカウント除外で実質 **$25〜35/月（約3,700〜5,200円）** の見込み。

### Firebase費用試算（30アカウント）

| サービス | 月額 |
|---------|------|
| Cloud Functions | ほぼ $0（無料枠内） |
| Firestore | $0（無料枠内） |
| Cloud Storage | $0（無料枠内） |
| Secret Manager | 約 $0.06 |
| FCM | $0 |
| **合計** | **約 $0.06/月** |

### βテスト期間費用（5アカウント・1店舗）

```
X API: 約 $5以下/月（約750円）
Firebase: ほぼ $0
合計: 実質無料
```

---

## 15. 料金設計（想定）

### 競合参考

- tasteck（ナイト系SaaS）：月5,000円/店舗
- SocialDog（SNS管理）：月3,500円〜

### Stellasync想定

| プラン | 対象 | 月額 |
|--------|------|------|
| スターター | 1店舗・キャスト最大10名 | 3,000円/店舗 |
| スタンダード | 3店舗・キャスト最大30名 | 8,000円/グループ |
| カスタム | 4店舗以上 | 要相談 |

### βテスト期間

- 協力店舗：API費用のみ負担（月1,000〜2,000円程度）
- 期間：Phase 2〜3（約2〜3ヶ月）
- 有料化の判断基準：3店舗が2ヶ月以上継続利用

---

*このドキュメントはStellasyncの開発進行に合わせて随時更新する。*

---
