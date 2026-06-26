# Stellasync 実装計画：投稿タイプ判定・ゲスト別カウント・店舗タグ振り分け・所属履歴

このドキュメントは、プレゼン準備の議論で確定した機能を Stellasync 本体に実装するための設計と、
Claude Code に渡す実装プロンプトをまとめたもの。

---

## 確定した設計（議論で決まったこと）

### A. 投稿タイプ判定
各投稿を3種別に分類して `post_hourly_metrics` に保存する。
- `original`（通常）：本人の発信。ただし「本人が自分の過去投稿を引用」した場合も original 扱い
- `quote`（引用）：他人・店アカウントの投稿を引用RTしたもの
- `guest`（ゲスト出勤）：ゲスト出勤の告知・関連投稿

判定ロジック：
1. X API の `referenced_tweets` を見る（要 tweet.fields に referenced_tweets 追加）
   - `referenced_tweets[].type === 'quoted'` かつ 引用先の author が本人でない → `quote`
   - 引用先の author が本人自身 → `original`
   - `replied_to` / `retweeted` のみ → リプライ/RTは今回は original 扱い（必要なら別途）
2. 本文にゲスト出勤キーワードが含まれる → `guest`（タイプ判定より優先）
   - キーワード例（定数で管理）：「ゲスト出勤」「ゲスト降臨」「ゲスト出演」「ゲスト」＋「出勤/降臨」
   - キーワードは将来編集できるよう定数配列にまとめる

### B. メディア有無の正確な判定
- 本人が直接添付したメディアのみ `has_media = true`
- 引用先のメディアはカウントしない（`attachments.media_keys` が本人投稿に存在するかで判定）

### C. 集計のタイプ別分離
`daily_metrics` に種別ごとの集計を持たせる。
- 通常/引用/ゲストそれぞれの impressions / likes / retweets / posts_count
- メディア有無比較は「通常投稿のみ」で算出できるようにする（通常×メディアあり/なしの平均IMP・いいね）

### D. 店舗タグ振り分け（前回設計）
- `stores/{store_id}.store_tags`：その店のハッシュタグ別名リスト（略語含む、正規化して保存）
- 投稿のハッシュタグを順に見て、store_tags にマッチする「最初のタグ」の店に振り分け（主タグ優先）
- どのタグもマッチしない → 本人の主所属店（primary）に寄せる
- 結果を `resolved_store_id` として post_hourly_metrics に保存

### E. 所属履歴（前回設計）
- `accounts/{uid}/store_assignments/{id}`：{ store_id, is_primary, from, to(null=現在) }
- 投稿の振り分けは「投稿日時(posted_at)時点で有効な所属」を使う
- 店長・エリアMGRが編集可。過去の所属を直したら、影響期間の resolved_store_id を再計算し
  daily_metrics を店ごとに再集計
- タグ優先：投稿に店名タグがあればタグ、なければ所属履歴の主所属

### F. 営業日（実装済み・前提）
- 1営業日 = 朝10:00 JST 区切りで24時間。定数 BUSINESS_DAY_START_HOUR=10
- daily_metrics は営業日基準、dailyBatch は10:30実行

---

## データ構造の変更まとめ

### post_hourly_metrics（追記するフィールド）
```
post_type: 'original' | 'quote' | 'guest'   // 投稿種別
has_media: boolean                           // 本人添付のメディアのみ
resolved_store_id: string                    // 振り分け確定後の店
```

### daily_metrics（種別分離。merge で追記）
```
// 既存: impressions, likes, retweets, posts_count, followers...
by_type: {
  original: { impressions, likes, retweets, posts_count },
  quote:    { impressions, likes, retweets, posts_count },
  guest:    { impressions, likes, retweets, posts_count },
}
media_breakdown: {  // 通常投稿のみ
  with_media:    { posts_count, avg_imp, avg_like },
  without_media: { posts_count, avg_imp, avg_like },
}
```

### stores
```
store_tags: string[]   // ["電脳サキュバス心斎橋","電サキュ心斎橋","電サキュ"] 正規化済み
```

### accounts/{uid}/store_assignments/{id}
```
store_id: string
is_primary: boolean
from: Timestamp
to: Timestamp | null
```

---

## 実装の段階分け（推奨：3フェーズに分けて投げる）

一度に全部やると差分が大きすぎて事故りやすい。以下の順で、各フェーズごとにビルド確認・承認する。

- フェーズ1：投稿タイプ判定 ＋ メディア正確判定（batchFetch中心、影響小）
- フェーズ2：daily_metrics の種別別集計 ＋ メディア比較（dailyBatch中心）
- フェーズ3：店舗タグ振り分け ＋ 所属履歴 ＋ 再集計（最も重い。custom claims/権限も絡む）

フェーズ1→2はプレゼンで見せた分析を本番化するもの。フェーズ3は店舗運用の本格機能。

---

# Claude Code 実装プロンプト

各フェーズを順に投げる。前フェーズのビルド確認・デプロイが済んでから次へ。

## ▼ フェーズ1：投稿タイプ判定 ＋ メディア正確判定

```
Stellasyncに「投稿タイプ判定（通常/引用/ゲスト出勤）」と「本人添付メディアのみの
正確なメディア判定」を実装したい。batchFetch.ts への変更が中心。

【絶対ルール】
- pollingScheduler.ts には触れない
- 既存の docID構成・集計の数式・営業日ロジックは変えない
- functions のビルド(型チェック)を必ず通す。デプロイは私の承認後
- 各変更後に「ファイル:行」と差分概要を報告

【変更1: X API取得クエリに referenced_tweets を追加】
- batchFetch.ts の tweets取得URL（X_TWEETS_URL を使う箇所）の tweet.fields に
  referenced_tweets を追加し、expansions に referenced_tweets.id,author_id を追加する
- これにより各ツイートの referenced_tweets[].type（quoted/replied_to/retweeted）と、
  引用先ツイートの author_id（includes側）が取れるようになる
- 既存の non_public_metrics,organic_metrics,created_at,attachments,text は維持

【変更2: 投稿タイプ判定関数を追加】
- batchFetch.ts に判定関数 classifyPostType(tweet, includes, selfUserId, text) を新設:
  1. 本文にゲスト出勤キーワードが含まれれば 'guest' を返す（最優先）
     - キーワードは定数配列 GUEST_KEYWORDS = ['ゲスト出勤','ゲスト降臨','ゲスト出演','ゲスト来店']
       としてファイル上部にまとめる（将来編集しやすく）
  2. referenced_tweets に type==='quoted' があり、その引用先の author_id が
     selfUserId（本人のx_user_id）と異なれば 'quote'
  3. 引用先の author_id が本人自身、または referenced_tweets が無ければ 'original'
  4. replied_to / retweeted のみの場合も 'original' 扱い
- includes.tweets から引用先ツイートを引いて author_id を照合する

【変更3: メディア判定を本人添付のみに】
- 既存の has_media 判定を、本人投稿の attachments.media_keys が存在するかのみで行う
  （引用先のメディアは includes 側なので自然と除外される。引用先を見ないこと）

【変更4: post_hourly_metrics に保存】
- batch.set のオブジェクトに post_type（'original'|'quote'|'guest'）を追加
- has_media は変更3の正確判定の結果を保存
- types.ts の PostHourlyMetrics に post_type?: 'original'|'quote'|'guest' を追加

【確認・報告】
- 既存の post_hourly_metrics には post_type が無いため、次回取得分から付与される点を明記
- referenced_tweets 追加でAPIコストが変わらないか（同じ1リクエストで取れる範囲）を確認して報告
- ビルドが通ったら差分を報告し、デプロイは私の承認を待つ
```

## ▼ フェーズ2：daily_metrics の種別別集計 ＋ メディア比較

```
Stellasyncの dailyBatch に、投稿タイプ別の集計と「通常投稿のみのメディア比較」を追加したい。
フェーズ1で post_hourly_metrics に post_type と正確な has_media が入っている前提。

【絶対ルール】
- batchFetch.ts / pollingScheduler.ts には触れない
- 既存の営業日ロジック（朝10時区切り24時間）・docID（営業日基準）・既存集計は壊さない
- 既存の aggregatePostMetrics の出力（impressions/likes/retweets/posts_count）は維持し、追加する形
- ビルドを通す。デプロイは承認後

【変更1: 種別別集計を aggregatePostMetrics に追加】
- 既存の集計（全投稿のimpressions等）に加えて、post_type ごとに
  impressions/likes/retweets/posts_count を集計する
- daily_metrics に by_type: { original:{...}, quote:{...}, guest:{...} } を merge で追記
- 各 post_id の最新 hour_offset を採用する既存ロジックは踏襲

【変更2: 通常投稿のメディア比較を追加】
- post_type==='original' の投稿だけを対象に、has_media の有無で分けて
  with_media / without_media それぞれの posts_count・avg_imp・avg_like を算出
- daily_metrics に media_breakdown: { with_media:{...}, without_media:{...} } を merge で追記

【変更3: 型定義】
- types.ts の DailyMetric 型に by_type と media_breakdown を optional で追加

【確認・報告】
- 既存のフロント(HomePage/GraphPage)は by_type/media_breakdown を読んでいないため
  既存表示は壊れない点を確認して報告
- ビルドが通ったら差分を報告。デプロイは承認を待つ
- （任意）フロントにタイプ別・メディア比較を表示する場合は別途相談、として今回はデータ側のみ
```

## ▼ フェーズ3：店舗タグ振り分け ＋ 所属履歴 ＋ 再集計

```
Stellasyncに「店舗タグ振り分け」と「期間付き所属履歴」を実装したい。掛け持ちキャストを
店ごとに正しく集計し、過去の所属変更も遡って直せるようにする。最も影響が大きい改修なので
慎重に、段階的に。フェーズ1・2が反映済みである前提。

【絶対ルール】
- 既存の取得・タイプ判定・営業日ロジックは壊さない
- Firestoreの既存データを破壊しない（追加・更新のみ、削除しない）
- firestore.rules の変更を伴う場合は、変更内容を必ず提示し私の承認を得てから反映
- ビルドを通す。デプロイは承認後。各サブステップごとに報告

【データ構造】
- stores/{store_id} に store_tags: string[] を追加（ハッシュタグ別名・略語。小文字正規化して保存）
- accounts/{uid}/store_assignments/{auto_id} に { store_id, is_primary(bool), from(Timestamp),
  to(Timestamp|null) } のサブコレクションを新設

【変更1: 振り分けロジック（batchFetch）】
- 投稿のハッシュタグ（既存の extractHashtags の結果）を順に走査し、
  どこかの store_tags にマッチする「最初のタグ」の store_id を採用（主タグ優先）
- タグが1つもマッチしない場合は、その投稿の posted_at 時点で有効な所属
  （store_assignments のうち from<=posted_at<to かつ is_primary）の store_id を採用
- タグがある場合もタグを優先（所属より上位）
- 結果を resolved_store_id として post_hourly_metrics に保存
- types.ts に resolved_store_id?: string を追加

【変更2: 集計を resolved_store_id ベースに】
- dailyBatch の集計（フェーズ2で作った種別別・メディア比較含む）を、
  store_id ではなく resolved_store_id で店舗を判定するように変更
- 掛け持ちキャストの投稿が、タグに応じて別々の店に計上されることを確認

【変更3: 所属変更時の再集計】
- 店長/エリアMGRが store_assignments を編集する想定（編集UIは別途。今回はバックエンド関数）
- 所属を編集したら呼ばれる再計算関数 recomputeAssignments(uid, affectedRange) を新設:
  影響期間の post_hourly_metrics の resolved_store_id を再判定して更新し、
  該当営業日の daily_metrics を店ごとに再集計する
- これは onRequest か callable で実装し、?key ガードか認証必須にする

【変更4: セキュリティルール】
- store_assignments の read/write 権限を firestore.rules に追加
  （本人と、その店舗の店長/MGR。custom claims 設計が必要なら、必要な claims を提示）
- 変更案を提示し、私の承認後に反映

【段階確認】
- 変更1ができたらビルド・報告で一旦止まる
- 変更2、3、4 も同様に1つずつ報告し、私の承認で次へ
- 最後に、掛け持ちキャストのテストケース（1人が2店のタグで投稿）で
  正しく振り分くか確認する方法を提示
```

---

## 実装後の検証ポイント
- フェーズ1後：新規取得した投稿に post_type が付き、引用・ゲストが正しく分類されるか
- フェーズ2後：daily_metrics に by_type / media_breakdown が入るか
- フェーズ3後：掛け持ちキャストの投稿が、タグに応じて別の店に計上されるか／
  所属を過去に遡って変更したら再集計されるか
- 全体：プレゼンで見せた「通常メディア2.7倍」「タイプ別3層」が、本番データで再現できるか

## 注意（セキュリティ・運用）
- フェーズ3は他人のトークン・複数店舗のデータ分離に直結する。別途進めているセキュリティ
  レビュー（HIGH-2: uid検証、HIGH-3: stores の org_id 制限・custom claims）と合流させると
  二度手間が減る。フェーズ3の着手前にセキュリティ側の store/権限設計を固めるのが理想。
