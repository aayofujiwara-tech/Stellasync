import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { db, auth } from '../../lib/firebase'
import { doc, getDoc } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { useNavigate } from 'react-router-dom'

interface AccountData {
  display_name: string
  x_user_id: string
  token_status: 'valid' | 'expired' | 'revoked'
}

export default function SettingsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [account, setAccount] = useState<AccountData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loggingOut, setLoggingOut] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    getDoc(doc(db, 'accounts', user.uid))
      .then((snap) => { if (snap.exists()) setAccount(snap.data() as AccountData) })
      .finally(() => setLoading(false))
  }, [user])

  const handleLogout = async () => {
    setLoggingOut(true)
    await signOut(auth)
    navigate('/login', { replace: true })
  }

  const handleReconnect = async () => {
    setError(null)
    try {
      const res = await fetch(import.meta.env.VITE_AUTH_REDIRECT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) {
        setError('再連携の開始に失敗しました。もう一度お試しください。')
        return
      }
      const { redirectUrl, sessionSecret } = (await res.json()) as {
        redirectUrl: string
        sessionSecret: string
      }
      // LoginPage / AuthCallback と同じキーで sessionSecret を保存（CSRF対策の検証に必須）
      localStorage.setItem('stellasync_oauth_secret', sessionSecret)
      window.location.href = redirectUrl
    } catch {
      setError('再連携に失敗しました。もう一度お試しください。')
    }
  }

  if (loading) {
    return (
      <div className="px-4 py-6 space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="rounded-xl h-16 animate-pulse" style={{ backgroundColor: '#1A1A24' }} />
        ))}
      </div>
    )
  }

  const isValid         = account?.token_status === 'valid'
  const tokenColor      = isValid ? '#1D9E75' : '#D85A30'
  const tokenLabel      = isValid ? '連携済み' : '要再連携'

  return (
    <div className="px-4 py-6 space-y-4">
      {/* アカウント情報 */}
      <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: '#1A1A24' }}>
        <div>
          <p className="text-xs mb-1" style={{ color: '#A0A0B0' }}>表示名</p>
          <p className="text-sm font-medium" style={{ color: '#FFFFFF' }}>
            {account?.display_name ?? '—'}
          </p>
        </div>
        <div>
          <p className="text-xs mb-1" style={{ color: '#A0A0B0' }}>X ID</p>
          <p className="text-sm font-medium" style={{ color: '#FFFFFF' }}>
            {account?.x_user_id ? `@${account.x_user_id}` : '—'}
          </p>
        </div>
      </div>

      {/* X連携状態 */}
      <div className="rounded-xl p-4" style={{ backgroundColor: '#1A1A24' }}>
        <p className="text-xs mb-2" style={{ color: '#A0A0B0' }}>X連携状態</p>
        <div className="flex items-center justify-between">
          <span
            className="px-3 py-1 rounded-full text-xs font-semibold"
            style={{ backgroundColor: `${tokenColor}22`, color: tokenColor }}
          >
            {tokenLabel}
          </span>
          {!isValid && (
            <button
              onClick={handleReconnect}
              className="text-sm font-medium px-4 py-2 rounded-xl"
              style={{ backgroundColor: '#7C6FE0', color: '#FFFFFF', minHeight: '44px' }}
            >
              再連携
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="text-xs px-1" style={{ color: '#D85A30' }}>{error}</p>
      )}

      {/* ログアウト */}
      <button
        onClick={handleLogout}
        disabled={loggingOut}
        className="w-full py-3 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-60"
        style={{
          backgroundColor: '#2A1414',
          color: '#D85A30',
          border: '1px solid #D85A30',
          minHeight: '44px',
        }}
      >
        {loggingOut ? 'ログアウト中...' : 'ログアウト'}
      </button>
    </div>
  )
}
