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
  uid: string
  expires_at: Timestamp
  created_at: Timestamp
}

/**
 * accounts/{userId}
 * AES-256-GCM 暗号化済みトークンと X アカウント情報を保持する。
 */
export interface Account {
  x_user_id: string
  display_name: string
  store_id?: string
  org_id?: string
  access_token: string                  // AES-256-GCM 暗号化済み
  refresh_token: string                 // AES-256-GCM 暗号化済み
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

/** X OAuth 2.0 トークンエンドポイントのレスポンス */
export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  scope: string
}
