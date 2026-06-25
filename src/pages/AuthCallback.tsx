import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function AuthCallback() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code  = params.get('code')
    const state = params.get('state')

    if (!code || !state) {
      setError('認証パラメータが不正です。')
      return
    }

    fetch('https://authxcallback-6rca6icyda-dt.a.run.app', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, state }),
    })
      .then((res) => {
        if (!res.ok) throw new Error('認証に失敗しました')
        navigate('/cast/home', { replace: true })
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error
            ? err.message
            : '認証に失敗しました。もう一度お試しください。',
        )
      })
  }, [navigate])

  if (error) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4"
        style={{ backgroundColor: '#0F0F14' }}
      >
        <div className="w-full max-w-[375px] flex flex-col items-center gap-6 text-center">
          <p className="text-sm" style={{ color: '#D85A30' }}>{error}</p>
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
