import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import LoginPage from './pages/LoginPage'
import AuthCallback from './pages/AuthCallback'
import CastLayout from './layouts/CastLayout'
import AdminLayout from './layouts/AdminLayout'
import ManagerLayout from './layouts/ManagerLayout'
import HomePage from './pages/cast/HomePage'
import PostsPage from './pages/cast/PostsPage'
import GraphPage from './pages/cast/GraphPage'
import SettingsPage from './pages/cast/SettingsPage'
import OverviewPage from './pages/admin/OverviewPage'

function RootRedirect() {
  const { user, loading, role } = useAuth()

  // Cloudflare / DNS レイヤーで /auth/x/callback のパスが / に変わることがあるため、
  // root に code+state が付いていれば AuthCallback に引き継ぐ
  const params = new URLSearchParams(window.location.search)
  const code  = params.get('code')
  const state = params.get('state')
  if (code && state) {
    return <AuthCallback />
  }

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

  if (!user) return <Navigate to="/login" replace />
  if (role === 'admin')        return <Navigate to="/admin"        replace />
  if (role === 'area_manager') return <Navigate to="/manager"      replace />
  return <Navigate to="/cast/home" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/x/callback" element={<AuthCallback />} />

        {/* キャスト画面 */}
        <Route path="/cast" element={<CastLayout />}>
          <Route index element={<Navigate to="home" replace />} />
          <Route path="home"     element={<HomePage />} />
          <Route path="posts"    element={<PostsPage />} />
          <Route path="graph"    element={<GraphPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        {/* 管理者画面（role: admin） */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<OverviewPage />} />
        </Route>

        {/* エリアマネージャー画面（role: area_manager） */}
        <Route path="/manager" element={<ManagerLayout />}>
          <Route index element={<OverviewPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
