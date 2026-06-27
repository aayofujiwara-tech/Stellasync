import type { Timestamp } from 'firebase-admin/firestore'

/**
 * oauth_sessions/{state}
 *   code_verifier : string    – PKCE code verifier (保存して callback で使用)
 *   uid           : string    – Firebase Auth UID of the requesting user
 *   expires_at    : Timestamp – セッション有効期限 (10分)
 *   created_at    : Timestamp – 作成日時 (serverTimestamp)
 */
export interface OAuthSession {
  code_verifier: string
  session_secret: string  // Login CSRF 対策：フローを開始したブラウザにバインドする
  uid?: string  // フェーズA以降は不使用。既存セッションとの互換のため optional
  expires_at: Timestamp
  created_at: Timestamp
}

/**
 * accounts/{userId}
 * X アカウントのプロフィールとトークンステータスを保持する。
 * トークン実体（access_token / refresh_token）は account_tokens/{userId} に分離。
 */
export interface Account {
  x_user_id: string
  display_name: string
  store_id?: string
  org_id?: string
  token_expires_at: Timestamp
  token_status: 'valid' | 'expired' | 'revoked'
  token_checked_at: Timestamp
  notification_sent_at?: Timestamp | null
  last_fetched_at?: Timestamp
  is_active?: boolean
  deactivated_at?: Timestamp | null
  deactivated_by?: string | null
  best_times?: Array<{ hour: number; avg_imp: number; sample_count: number }>
  best_times_updated_at?: Timestamp
}

/**
 * account_tokens/{userId}
 * AES-256-GCM 暗号化済みトークン実体。Admin SDK のみがアクセスする。
 * クライアントからは firestore.rules で一切読み取り不可。
 */
export interface AccountTokens {
  access_token: string   // AES-256-GCM 暗号化済み
  refresh_token: string  // AES-256-GCM 暗号化済み
}

/** X OAuth 2.0 トークンエンドポイントのレスポンス */
export interface TokenResponse {
  access_token: string
  refresh_token?: string  // X がローテーションしない場合は省略されることがある
  token_type: string
  expires_in: number
  scope: string
}

/**
 * stores/{storeId}
 * 店舗の営業時間とポーリング設定を保持する。
 */
export interface StoreData {
  name: string
  org_id: string
  is_active: boolean
  business_hours: {
    open: string       // 例: '20:00'
    close: string      // 例: '04:00'（深夜またぎ対応）
    timezone: string   // 例: 'Asia/Tokyo'
  }
  polling_config: {
    high_freq_start_offset: number   // 開店の何分前から高頻度開始（例: -60）
    high_freq_end_offset: number     // 閉店の何分後まで高頻度継続（例: 120）
    high_freq_interval: number       // 高頻度間隔（分）（例: 15）
    low_freq_interval: number        // 低頻度間隔（分）（例: 120）
  }
}

/**
 * daily_metrics/{cast_id}_{YYYY-MM-DD}
 * 日次フォロワー数・集計指標を保存するドキュメント。
 */
export interface DailyMetrics {
  cast_id: string
  store_id: string
  org_id: string
  date: Timestamp
  impressions?: number
  likes?: number
  retweets?: number
  followers: number
  following: number
  tweet_count: number
  posts_count?: number
}

/**
 * post_hourly_metrics/{post_id}_{hour_offset}
 * 投稿のインプレッション・いいね・RTを時間単位で蓄積するドキュメント。
 */
export interface PostHourlyMetrics {
  post_id: string
  cast_id: string
  store_id: string
  org_id: string
  posted_at: Timestamp
  posted_hour: number           // 0〜23
  posted_dow: number            // 0〜6（0 = 日曜）
  hour_offset: number           // 投稿からの経過時間（整数時間）
  imp_delta: number
  like_delta: number
  rt_delta: number
  imp_cumulative: number
  like_cumulative: number
  rt_cumulative: number
  fetch_phase: 'high' | 'low' | 'daily'
  has_media: boolean
  post_type?: 'original' | 'quote' | 'guest' | 'reply'
  text?: string
  hashtags: string[]
  fetched_at: Timestamp
}
