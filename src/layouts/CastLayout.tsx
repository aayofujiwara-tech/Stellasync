import { useEffect } from 'react'
import { Outlet, NavLink, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Home, FileText, BarChart2, Trophy, Settings } from 'lucide-react'

const tabs = [
  { to: '/cast/home',     icon: Home,      label: 'ホーム' },
  { to: '/cast/posts',    icon: FileText,   label: '投稿' },
  { to: '/cast/graph',    icon: BarChart2,  label: 'グラフ' },
  { to: '/cast/ranking',  icon: Trophy,     label: 'ランキング' },
  { to: '/cast/settings', icon: Settings,   label: '設定' },
] as const

export default function CastLayout() {
  const { user, loading, role } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (loading) return
    if (!user) navigate('/login', { replace: true })
    // admin/area_manager は /cast に留まれる（管理者が自分のキャスト画面を閲覧するケース）
  }, [user, loading, navigate])

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

  return (
    <div className="flex flex-col min-h-screen max-w-[430px] mx-auto" style={{ backgroundColor: '#0F0F14' }}>
      <header className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: '#1A1A24' }}>
        <h1 className="text-lg font-bold" style={{ color: '#7C6FE0' }}>Stellasync</h1>
        {(role === 'admin' || role === 'area_manager') && (
          <Link
            to={role === 'admin' ? '/admin' : '/manager'}
            className="text-xs px-3 py-1.5 rounded-lg transition-colors"
            style={{ color: '#A0A0B0', backgroundColor: '#1A1A24' }}
          >
            管理者ビューへ
          </Link>
        )}
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
