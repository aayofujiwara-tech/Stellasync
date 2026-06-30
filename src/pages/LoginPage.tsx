import { useState } from 'react'

const OAUTH_SECRET_KEY = 'stellasync_oauth_secret'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleXLogin = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(import.meta.env.VITE_AUTH_REDIRECT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) throw new Error('redirect request failed')
      const { redirectUrl, sessionSecret } = (await res.json()) as {
        redirectUrl: string
        sessionSecret: string
      }
      // Login CSRF 対策: sessionSecret をブラウザに保持し callback で検証する
      localStorage.setItem(OAUTH_SECRET_KEY, sessionSecret)
      window.location.href = redirectUrl
    } catch {
      setError('サインインに失敗しました。もう一度お試しください。')
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: '#0F0F14' }}
    >
      <div className="w-full max-w-[375px] flex flex-col items-center gap-8">
        {/* ロゴ */}
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: '#7C6FE0' }}
          >
            <svg viewBox="0 0 24 24" className="w-9 h-9 fill-white">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-wide" style={{ color: '#FFFFFF' }}>
            Stellasync
          </h1>
          <p className="text-sm text-center" style={{ color: '#A0A0B0' }}>
            あなたの発信を、数字で見える化
          </p>
        </div>

        {/* アカウント確認注意書き */}
        <div className="w-full rounded-xl px-4 py-3 text-left" style={{ backgroundColor: '#1A1A24' }}>
          <p className="text-xs font-semibold mb-1" style={{ color: '#D4A017' }}>⚠️ 連携前にご確認ください</p>
          <p className="text-xs" style={{ color: '#A0A0B0' }}>
            お店用のXアカウントでログイン中か確認してください。複数アカウントをお持ちの方は、Xアプリでお店用アカウントに切り替えてからボタンをタップしてください。
          </p>
        </div>

        {/* サインインボタン */}
        <button
          onClick={handleXLogin}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 px-6 py-3 rounded-xl font-semibold transition-opacity disabled:opacity-60"
          style={{ backgroundColor: '#FFFFFF', color: '#000000', minHeight: '44px' }}
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-black">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              Xでサインイン
            </>
          )}
        </button>

        {error && (
          <p className="text-sm text-center" style={{ color: '#D85A30' }}>{error}</p>
        )}
      </div>
    </div>
  )
}
