import { useState } from 'react'

const OAUTH_SECRET_KEY = 'stellasync_oauth_secret'

export default function LoginPage() {
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [guideOpen, setGuideOpen]   = useState(false)

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
      localStorage.setItem(OAUTH_SECRET_KEY, sessionSecret)
      window.location.href = redirectUrl
    } catch {
      setError('サインインに失敗しました。もう一度お試しください。')
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-8"
      style={{ backgroundColor: '#0F0F14' }}
    >
      <div className="w-full max-w-[375px] flex flex-col items-center gap-6">
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

        {/* 連携手順アコーディオン */}
        <div className="w-full rounded-xl overflow-hidden" style={{ backgroundColor: '#1A1A24' }}>
          <button
            onClick={() => setGuideOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-left"
            aria-expanded={guideOpen}
          >
            <span className="text-xs font-semibold" style={{ color: '#D4A017' }}>
              ⚠️ お店用アカウントで連携するには
            </span>
            <span className="text-xs shrink-0 ml-2" style={{ color: '#606070' }}>
              {guideOpen ? '▲ 閉じる' : '▼ タップで開く'}
            </span>
          </button>

          {guideOpen && (
            <div
              className="px-4 pb-4 space-y-4 border-t"
              style={{ borderColor: '#2A2A3C' }}
            >
              <p className="text-xs pt-3 leading-relaxed" style={{ color: '#C0C0D0' }}>
                連携には「今このブラウザでXにログインしているアカウント」が使われます。
                確実にお店用アカウントで連携するには、シークレットモードがおすすめです。
              </p>

              {/* シークレットモード手順 */}
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: '#A08FE0' }}>
                  シークレットモードで連携（推奨）
                </p>
                <ol className="text-xs space-y-2" style={{ color: '#C0C0D0' }}>
                  {([
                    'ブラウザのメニュー（⋮ または 共有ボタン）から「シークレットタブ」（Android/Chrome）または「プライベートタブ」（iPhone/Safari）を開く',
                    'そのタブで stellasync.uminobozu.com を開く',
                    'Xのログイン画面が出るので、お店用アカウントのID・パスワードでログイン',
                    '「アプリにアクセスを許可」をタップ',
                    '連携後に表示される @アカウント名 がお店用で合っているか確認',
                  ] as const).map((step, i) => (
                    <li key={i} className="flex gap-2">
                      <span
                        className="shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5"
                        style={{ backgroundColor: '#2A2A3C', color: '#A08FE0' }}
                      >
                        {i + 1}
                      </span>
                      <span className="leading-relaxed">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* 補足 */}
              <div className="space-y-1" style={{ color: '#606070' }}>
                <p className="text-xs leading-relaxed">
                  ※ Xアプリでアカウントを切り替えても連携には反映されません。
                </p>
                <p className="text-xs leading-relaxed">
                  ※ 通常タブで連携する場合は、先にこのブラウザで x.com にお店用アカウントでログインしておいてください。
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
