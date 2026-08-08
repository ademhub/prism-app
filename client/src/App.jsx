import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Dock from './components/Dock'
import Home from './pages/Home'
import Detail from './pages/Detail'
import Actor from './pages/Actor'
import Browse from './pages/Browse'
import Series from './pages/Series'
import SagaDetail from './pages/SagaDetail'
import Channels from './pages/Channels'
import Profile from './pages/Profile'
import UserPublicProfile from './pages/UserPublicProfile'
import Messages from './pages/Messages'
import Login from './pages/Login'
import Onboarding from './pages/Onboarding'
import ProfileSelector from './components/ProfileSelector'
import { FavoritesProvider } from './context/FavoritesContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './components/Toast'

function useNeedsOnboarding() {
  const { activeProfile, socialProfile, socialProfileLoading } = useAuth()
  const location = useLocation()
  if (!activeProfile || location.pathname === '/onboarding') return false
  // Le flag localStorage est la source de vérité — set dès l'entrée dans l'onboarding
  if (localStorage.getItem(`movy_onboarded_${activeProfile.id}`)) return false
  // Attendre que le profil social soit chargé avant de décider
  if (socialProfileLoading || socialProfile === null) return false
  // Nouveau compte = pas encore de nom ni pseudo
  return !socialProfile.display_name && !socialProfile.username
}

function AppRoutes() {
  const { activeProfile, loading } = useAuth()
  const needsOnboarding = useNeedsOnboarding()

  if (loading) return null

  if (!activeProfile) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<ProfileSelector />} />
      </Routes>
    )
  }

  if (needsOnboarding) {
    return (
      <Routes>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="*" element={<Navigate to="/onboarding" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/*" element={
        <div className="min-h-screen bg-surface text-warm">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/media/:id" element={<Detail />} />
            <Route path="/actor/:name" element={<Actor />} />
            <Route path="/browse" element={<Browse />} />
            <Route path="/series" element={<Series />} />
            <Route path="/channels" element={<Channels />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/user/:id" element={<UserPublicProfile />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/saga/:key" element={<SagaDetail />} />
          </Routes>
          <Dock />
        </div>
      } />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <FavoritesProvider>
        <BrowserRouter>
          <ToastProvider>
            <AppRoutes />
          </ToastProvider>
        </BrowserRouter>
      </FavoritesProvider>
    </AuthProvider>
  )
}
