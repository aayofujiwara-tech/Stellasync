import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signInWithCustomToken } from 'firebase/auth'
import { auth } from '../lib/firebase'

const CALLBACK_ENDPOINT = import.meta.env.VITE_AUTH_CALLBACK_URL
const OAUTH_SECRET_KEY  = 'stellasync_oauth_secret'

export default function AuthCallback() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const run = async () => {
      console.log('[AuthCallback] 開始 URL:', window.location.href)

      const params = new URLSearchParams(window.location.search)
      const code  = params.get('code')
      const state = params.get('state')

      console.log('[AuthCallback] code:', code ? `${code.slice(0, 10)}...` : 'なし')
      console.log('[AuthCallback] state:', state ? `${state.slice(0, 10)}...` : 'なし')

      if (!code || !state) {
        console.error('[AuthCallback] code/state が取得できなかった:', window.location.search)
        setError('認証パラメータが不正です。')
        return
      }

      // Login CSRF 対策: localStorage から sessionSecret を取り出す（使い捨て）
      const sessionSecret = localStorage.getItem(OAUTH_SECRET_KEY)
      localStorage.removeItem(OAUTH_SECRET_KEY)

      if (!sessionSecret) {
        console.error('[AuthCallback] sessionSecret が localStorage にない — CSRF の可能性')
        setError('認証セッションが無効です。もう一度サインインしてください。')
        return
      }

      console.log('[AuthCallback] エンドポイントにリクエスト送信:', CALLBACK_ENDPOINT)

      let res: Response
      try {
        res = await fetch(CALLBACK_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, state, session_secret: sessionSecret }),
        })
      } catch (fetchErr) {
        console.error('[AuthCallback] fetch 失敗（CORS or ネットワーク）:', fetchErr)
        setError('サーバーへの接続に失敗しました。もう一度お試しください。')
        return
      }

      console.log('[AuthCallback] レスポンス status:', res.status)

      if (!res.ok) {
        const body = await res.text()
        console.error('[AuthCallback] エラーレスポンス:', res.status, body)
        setError('認証に失敗しました。もう一度お試しください。')
        return
      }

      const data = (await res.json()) as { success: boolean; customToken?: string }
      console.log('[AuthCallback] 成功')

      if (!data.customToken) {
        setError('認証トークンが取得できませんでした。もう一度お試しください。')
        return
      }

      try {
        await signInWithCustomToken(auth, data.customToken)
      } catch (signInErr) {
        console.error('[AuthCallback] signInWithCustomToken 失敗:', signInErr)
        setError('サインインに失敗しました。もう一度お試しください。')
        return
      }

      // フルリロードで onAuthStateChanged + Firestore 読み込みを確実に完了させる
      window.location.href = '/'
    }

    run()
  }, [navigate])

  if (error) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4"
        style={{ backgroundColor: '#0F0F14' }}
      >
        <div className="w-full max-w-[375px] flex flex-col items-center gap-4 text-center">
          <p className="text-sm font-medium" style={{ color: '#D85A30' }}>{error}</p>
          <button
            onClick={() => navigate('/login', { replace: true })}
            className="px-6 py-3 rounded-xl font-semibold"
            style={{ backgroundColor: '#7C6FE0', color: '#FFFFFF', minHeight: '44px' }}
          >
            ログインに戻る
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: '#0F0F14' }}
    >
      <div className="flex flex-col items-center gap-4">
        <div
          className="w-8 h-8 border-2 rounded-full animate-spin"
          style={{ borderColor: '#7C6FE0', borderTopColor: 'transparent' }}
        />
        <p className="text-sm" style={{ color: '#A0A0B0' }}>認証処理中...</p>
      </div>
    </div>
  )
}
