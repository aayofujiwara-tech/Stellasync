import { useEffect, useState } from 'react'
import { Outlet, NavLink, useNavigate, useParams, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { db } from '../lib/firebase'
import { doc, getDoc } from 'firebase/firestore'
import { Home, FileText, BarChart2, ArrowLeft } from 'lucide-react'

export default function CastDetailLayout() {
  const { user, loading, role } = useAuth()
  const navigate = useNavigate()
  const { castId } = useParams<{ castId: string }>()
  const [displayName, setDisplayName] = useState<string | null>(null)

  useEffect(() => {
    if (loading) return
    if (!user) {
      navigate('/login', { replace: true })
      return
    }
    if (role !== 'admin' && role !== 'area_manager') {
      navigate('/cast/home', { replace: true })
    }
  }, [user, loading, role, navigate])

  useEffect(() => {
    if (!castId) return
    getDoc(doc(db, 'accounts', castId)).then((snap) => {
      if (snap.exists()) {
        setDisplayName((snap.data().display_name as string) ?? null)
      }
    })
  }, [castId])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: '#0F0F14' }}>
        <div
          className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: '#7C6FE0', borderTopColor: 'transparent' }}
        />
      </div>
    )
  }

  if (!user) return null

  const backTo = role === 'admin' ? '/admin' : '/manager'

  const tabs = [
    { to: `/detail/cast/${castId}/home`,  icon: Home,     label: 'ホーム' },
    { to: `/detail/cast/${castId}/posts`, icon: FileText,  label: '投稿' },
    { to: `/detail/cast/${castId}/graph`, icon: BarChart2, label: 'グラフ' },
  ] as const

  return (
    <div className="flex flex-col min-h-screen max-w-[430px] mx-auto" style={{ backgroundColor: '#0F0F14' }}>
      <header className="px-4 py-3 border-b" style={{ borderColor: '#1A1A24' }}>
        <Link
          to={backTo}
          className="flex items-center gap-1 text-xs mb-1"
          style={{ color: '#7C6FE0' }}
        >
          <ArrowLeft size={14} />
          {role === 'admin' ? '管理者ビューに戻る' : 'マネージャービューに戻る'}
        </Link>
        <p className="text-sm font-medium" style={{ color: '#E0E0EE' }}>
          {displayName ?? '...'} のデータ（管理者閲覧）
        </p>
      </header>

      <main className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </main>

      <nav
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] border-t"
        style={{ backgroundColor: '#0F0F14', borderColor: '#1A1A24' }}
      >
        <div className="flex">
          {tabs.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 gap-1 py-2 text-xs transition-colors ${
                  isActive ? 'text-[#7C6FE0]' : 'text-[#A0A0B0]'
                }`
              }
              style={{ minHeight: '44px' }}
            >
              <Icon size={20} />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
