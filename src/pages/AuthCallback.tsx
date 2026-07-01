import { useEffect, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  setPersistence,
  browserLocalPersistence,
  signInWithCustomToken,
  onAuthStateChanged,
  signOut,
} from 'firebase/auth'
import { auth } from '../lib/firebase'

const CALLBACK_ENDPOINT = import.meta.env.VITE_AUTH_CALLBACK_URL
const OAUTH_SECRET_KEY  = 'stellasync_oauth_secret'

type Phase =
  | { kind: 'processing' }
  | { kind: 'confirm'; displayName: string; username: string }
  | { kind: 'reauth' }
  | { kind: 'error'; message: string }

const BG: CSSProperties = { backgroundColor: '#0F0F14' }

export default function AuthCallback() {
  const navigate = useNavigate()
  const [phase, setPhase]         = useState<Phase>({ kind: 'processing' })
  const [reLaunching, setRelaunch] = useState(false)

  useEffect(() => {
    const run = async () => {
      const params = new URLSearchParams(window.location.search)
      const code  = params.get('code')
      const state = params.get('state')

      if (!code || !state) {
        setPhase({ kind: 'error', message: '認証パラメータが不正です。' })
        return
      }

      const sessionSecret = localStorage.getItem(OAUTH_SECRET_KEY)
      localStorage.removeItem(OAUTH_SECRET_KEY)

      if (!sessionSecret) {
        setPhase({ kind: 'error', message: '認証セッションが無効です。もう一度サインインしてください。' })
        return
      }

      let res: Response
      try {
        res = await fetch(CALLBACK_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, state, session_secret: sessionSecret }),
        })
      } catch (err) {
        console.error('[AuthCallback] fetch 失敗:', err)
        setPhase({ kind: 'error', message: 'サーバーへの接続に失敗しました。もう一度お試しください。' })
        return
      }

      if (!res.ok) {
        const body = await res.text()
        console.error('[AuthCallback] エラーレスポンス:', res.status, body)
        setPhase({ kind: 'error', message: '認証に失敗しました。もう一度お試しください。' })
        return
      }

      const data = (await res.json()) as {
        success: boolean
        customToken?: string
        displayName?: string
        username?: string
      }

      if (!data.customToken) {
        setPhase({ kind: 'error', message: '認証トークンが取得できませんでした。もう一度お試しください。' })
        return
      }

      try {
        await setPersistence(auth, browserLocalPersistence)
        await signInWithCustomToken(auth, data.customToken)
      } catch (err) {
        console.error('[AuthCallback] signInWithCustomToken 失敗:', err)
        setPhase({ kind: 'error', message: 'サインインに失敗しました。もう一度お試しください。' })
        return
      }

      await new Promise<void>((resolve) => {
        const unsub = onAuthStateChanged(auth, (u) => {
          if (u) { unsub(); resolve() }
        })
      })

      setPhase({
        kind: 'confirm',
        displayName: data.displayName ?? '',
        username:    data.username    ?? '',
      })
    }

    run()
  }, [navigate])

  const handleReauth = async () => {
    setRelaunch(true)
    await signOut(auth)
    try {
      const res = await fetch(import.meta.env.VITE_AUTH_REDIRECT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) throw new Error('redirect failed')
      const { redirectUrl, sessionSecret } = (await res.json()) as {
        redirectUrl: string
        sessionSecret: string
      }
      localStorage.setItem(OAUTH_SECRET_KEY, sessionSecret)
      window.location.href = redirectUrl
    } catch {
      setRelaunch(false)
      navigate('/login', { replace: true })
    }
  }

  if (phase.kind === 'processing') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={BG}>
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

  if (phase.kind === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={BG}>
        <div className="w-full max-w-[375px] flex flex-col items-center gap-5 text-center">
          <p className="text-sm font-medium" style={{ color: '#D85A30' }}>{phase.message}</p>
          <button
            onClick={() => navigate('/login', { replace: true })}
            className="w-full py-3 rounded-xl font-semibold"
            style={{ backgroundColor: '#7C6FE0', color: '#FFFFFF', minHeight: '44px' }}
          >
            ログインに戻る
          </button>
        </div>
      </div>
    )
  }

  if (phase.kind === 'confirm') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={BG}>
        <div className="w-full max-w-[375px] flex flex-col items-center gap-5 text-center">
          <p className="text-sm" style={{ color: '#A0A0B0' }}>
            以下のXアカウントで連携しました
          </p>

          <div className="w-full rounded-2xl px-5 py-4" style={{ backgroundColor: '#1A1A24' }}>
            <p className="text-2xl font-bold mb-1 break-all" style={{ color: '#7C6FE0' }}>
              @{phase.username || '—'}
            </p>
            <p className="text-sm" style={{ color: '#C0C0D0' }}>
              {phase.displayName || '—'}
            </p>
          </div>

          <p className="text-sm" style={{ color: '#E0E0EE' }}>
            お店用アカウントで合っていますか？
          </p>

          <button
            onClick={() => navigate({ pathname: '/', search: '' }, { replace: true })}
            className="w-full py-3 rounded-xl font-semibold"
            style={{ backgroundColor: '#7C6FE0', color: '#FFFFFF', minHeight: '44px' }}
          >
            はい、続ける
          </button>

          <button
            onClick={async () => {
              await signOut(auth)
              setPhase({ kind: 'reauth' })
            }}
            className="w-full py-3 rounded-xl font-semibold"
            style={{ backgroundColor: '#2A2A3C', color: '#E0E0EE', minHeight: '44px' }}
          >
            違う、別のアカウントでやり直す
          </button>
        </div>
      </div>
    )
  }

  // reauth
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8" style={BG}>
      <div className="w-full max-w-[375px] flex flex-col items-center gap-5">
        <p className="text-sm font-medium text-center" style={{ color: '#E0E0EE' }}>
          ブラウザのXログインをお店用アカウントに切り替えてください
        </p>

        <div className="w-full rounded-2xl px-5 py-4 text-left space-y-4" style={{ backgroundColor: '#1A1A24' }}>
          <div>
            <p className="text-xs font-semibold mb-1.5" style={{ color: '#D4A017' }}>
              方法1｜ブラウザでログインを切り替える
            </p>
            <ol className="text-xs space-y-1.5 list-decimal list-inside" style={{ color: '#C0C0D0' }}>
              <li>このブラウザ（Chrome等）で x.com を開く</li>
              <li>ログイン中のアカウントを確認し、お店用アカウントに切り替える<br />
                <span style={{ color: '#909090' }}>（またはログアウト → お店用アカウントでログイン）</span>
              </li>
              <li>この画面に戻って「もう一度連携する」をタップ</li>
            </ol>
          </div>

          <div>
            <p className="text-xs font-semibold mb-1.5" style={{ color: '#D4A017' }}>
              方法2｜シークレットモードで連携（確実）
            </p>
            <ol className="text-xs space-y-1.5 list-decimal list-inside" style={{ color: '#C0C0D0' }}>
              <li>ブラウザで新しいシークレット／プライベートタブを開く</li>
              <li>そこで Stellasync を開く</li>
              <li>Xのログイン画面が表示されるので、お店用アカウントでログインして連携</li>
            </ol>
          </div>

          <p className="text-xs leading-relaxed" style={{ color: '#808090' }}>
            ※ Xアプリでアカウントを切り替えても連携には反映されません。必ずブラウザでのログイン状態をお店用アカウントにしてください。
          </p>
        </div>

        <button
          onClick={handleReauth}
          disabled={reLaunching}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold disabled:opacity-60"
          style={{ backgroundColor: '#FFFFFF', color: '#000000', minHeight: '44px' }}
        >
          {reLaunching ? (
            <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-black">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              もう一度連携する
            </>
          )}
        </button>
      </div>
    </div>
  )
}
