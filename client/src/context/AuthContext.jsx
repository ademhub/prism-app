import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { getMyProfile } from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]             = useState(null)
  const [loading, setLoading]       = useState(true)
  const [profiles, setProfiles]     = useState([])
  const [activeProfile, setActive]  = useState(null)
  const [socialProfile, setSocial]       = useState(null)
  const [socialProfileLoading, setSocialLoading] = useState(false)

  useEffect(() => {
    // Charge les profils sauvegardés
    const saved = JSON.parse(localStorage.getItem('prism_profiles') || '[]')
    setProfiles(saved)

    // Restaure le profil actif de cette session
    const active = sessionStorage.getItem('prism_active')
    if (active) {
      try { setActive(JSON.parse(active)) } catch {}
    }

    // Session Supabase (timeout 4s pour éviter un blanc si Supabase est lent)
    const timeout = setTimeout(() => setLoading(false), 4000)
    supabase.auth.getSession().then(({ data }) => {
      clearTimeout(timeout)
      setUser(data.session?.user ?? null)
      setLoading(false)
    }).catch(() => { clearTimeout(timeout); setLoading(false) })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      if (event === 'SIGNED_IN' && session?.user) {
        const u = session.user
        const profile = {
          id:    u.id,
          email: u.email,
          name:  u.user_metadata?.full_name ?? u.user_metadata?.name ?? u.email.split('@')[0],
        }
        setProfiles(prev => {
          const exists = prev.find(p => p.id === profile.id)
          if (exists) return prev
          const updated = [...prev, profile]
          localStorage.setItem('prism_profiles', JSON.stringify(updated))
          return updated
        })
        setActive(profile)
        sessionStorage.setItem('prism_active', JSON.stringify(profile))
        refreshSocialProfile(profile.id)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const _saveProfile = (supabaseUser) => {
    const profile = {
      id:    supabaseUser.id,
      email: supabaseUser.email,
      name:  supabaseUser.user_metadata?.full_name ?? supabaseUser.email.split('@')[0],
    }
    setProfiles(prev => {
      const exists = prev.find(p => p.id === profile.id)
      if (exists) return prev
      const updated = [...prev, profile]
      localStorage.setItem('prism_profiles', JSON.stringify(updated))
      return updated
    })
    return profile
  }

  const refreshSocialProfile = useCallback((id) => {
    if (!id) { setSocial(null); setSocialLoading(false); return }
    setSocialLoading(true)
    getMyProfile(id).then((p) => { setSocial(p); setSocialLoading(false) }).catch(() => setSocialLoading(false))
  }, [])

  const selectProfile = (profile) => {
    setActive(profile)
    if (profile) {
      sessionStorage.setItem('prism_active', JSON.stringify(profile))
      refreshSocialProfile(profile.id)
    } else {
      sessionStorage.removeItem('prism_active')
      setSocial(null)
    }
  }

  // Charge le profil social au démarrage si un profil actif est restauré
  useEffect(() => {
    const active = sessionStorage.getItem('prism_active')
    if (active) {
      try { const p = JSON.parse(active); refreshSocialProfile(p.id) } catch {}
    }
  }, [])

  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    const profile = _saveProfile(data.user)
    selectProfile(profile)
    return data.user
  }

  const signup = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
    if (data.user) _saveProfile(data.user)
    return data.user
  }

  const removeProfile = (profileId) => {
    const updated = profiles.filter((p) => p.id !== profileId)
    localStorage.setItem('prism_profiles', JSON.stringify(updated))
    setProfiles(updated)
    if (activeProfile?.id === profileId) {
      setActive(null)
      sessionStorage.removeItem('prism_active')
    }
  }

  const logout = async () => {
    try { await supabase.auth.signOut() } catch {}
    setActive(null)
    sessionStorage.removeItem('prism_active')
  }

  const value = {
    user,
    loading,
    profiles,
    activeProfile,
    socialProfile,
    socialProfileLoading,
    refreshSocialProfile,
    selectProfile,
    removeProfile,
    login,
    signup,
    logout,
    name: activeProfile?.name ?? user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? null,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
