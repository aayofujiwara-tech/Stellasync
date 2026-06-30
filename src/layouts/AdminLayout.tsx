import { useEffect } from 'react'
import { Outlet, useNavigate, Link, NavLink } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { useAuth } from '../hooks/useAuth'
import { LogOut, Users } from 'lucide-react'

export default function AdminLayout() {
  const { user, loading, role } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading) {
      if (!user) navigate('/login', { replace: true })
      else if (role !== 'admin') navigate('/cast/home', { replace: true })
    }
  }, [user, loading, role, navigate])

  if (loading || !user || role !== 'admin') {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: '#0F0F14' }}>
        <div
          className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: '#7C6FE0', borderTopColor: 'transparent' }}
        />
      </div>
    )
  }

  const handleLogout = async () => {
    await signOut(auth)
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0F0F14' }}>
      <header
        className="flex items-center justify-between px-5 py-3 border-b sticky top-0 z-10"
        style={{ backgroundColor: '#0F0F14', borderColor: '#1A1A24' }}
      >
        <div className="flex items-center gap-2">
          <Users size={18} style={{ color: '#7C6FE0' }} />
          <h1 className="text-base font-bold" style={{ color: '#7C6FE0' }}>Stellasync</h1>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: '#2A1A4A', color: '#A08FE0' }}>
            ADMIN
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/cast/home"
            className="text-xs px-3 py-1.5 rounded-lg transition-colors"
            style={{ color: '#A0A0B0', backgroundColor: '#1A1A24' }}
          >
            自分の画面
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg transition-colors"
            style={{ color: '#A0A0B0', backgroundColor: '#1A1A24' }}
          >
            <LogOut size={14} />
            ログアウト
          </button>
        </div>
      </header>
      <nav
        className="flex gap-2 px-5 py-2 border-b"
        style={{ backgroundColor: '#0F0F14', borderColor: '#1A1A24' }}
      >
        <NavLink
          to="/admin"
          end
          className="text-xs px-3 py-1.5 rounded-lg transition-colors"
          style={({ isActive }) => ({
            color: isActive ? '#7C6FE0' : '#A0A0B0',
            backgroundColor: isActive ? '#1E1A3A' : '#1A1A24',
          })}
        >
          概要
        </NavLink>
        <NavLink
          to="/admin/ranking"
          className="text-xs px-3 py-1.5 rounded-lg transition-colors"
          style={({ isActive }) => ({
            color: isActive ? '#7C6FE0' : '#A0A0B0',
            backgroundColor: isActive ? '#1E1A3A' : '#1A1A24',
          })}
        >
          全体ランキング
        </NavLink>
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  )
}
