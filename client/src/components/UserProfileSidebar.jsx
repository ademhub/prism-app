import { motion } from 'framer-motion'
import { ChevronRight, Heart, Play, BarChart2, Settings, LogOut, Trophy } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const sidebar = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.07 } },
}

const item = {
  hidden:  { opacity: 0, x: -16 },
  visible: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 120, damping: 16 } },
}

const NAV = [
  { label: 'Trophées',      icon: <Trophy     size={16} />, id: 'trophies' },
  { label: 'Statistiques',  icon: <BarChart2  size={16} />, id: 'stats' },
  { label: 'En cours',      icon: <Play       size={16} />, id: 'inprogress' },
  { label: 'Ma liste',      icon: <Heart      size={16} />, id: 'favorites' },
  { label: 'Paramètres',    icon: <Settings   size={16} />, id: 'settings', separator: true },
]

export default function UserProfileSidebar({ activeSection, onNavigate }) {
  const { user, name, logout } = useAuth()
  const navigate = useNavigate()

  const initial = name?.[0]?.toUpperCase() ?? 'U'
  const email   = user?.email ?? ''

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  const scrollTo = (id) => {
    if (onNavigate) onNavigate(id)
    else document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <motion.aside
      className="flex flex-col w-64 shrink-0 rounded-2xl border border-white/8 bg-white/3 p-5"
      initial="hidden"
      animate="visible"
      variants={sidebar}
    >
      {/* Avatar + infos */}
      <motion.div variants={item} className="flex items-center gap-3 px-1 mb-5">
        <div className="w-11 h-11 rounded-full bg-accent flex items-center justify-center text-white font-bold text-lg shadow-[0_0_24px_rgba(229,9,20,0.25)] shrink-0">
          {initial}
        </div>
        <div className="min-w-0">
          <p className="text-warm text-sm font-semibold truncate">{name}</p>
          <p className="text-warm/35 text-xs truncate">{email}</p>
        </div>
      </motion.div>

      <motion.div variants={item} className="border-t border-white/8 mb-4" />

      {/* Nav */}
      <nav className="flex-1 flex flex-col gap-0.5">
        {NAV.map(({ label, icon, id, separator }) => {
          const active = activeSection === id
          return (
            <div key={id}>
              {separator && <div className="my-2 border-t border-white/8" />}
              <motion.button
                variants={item}
                onClick={() => scrollTo(id)}
                className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-left w-full ${
                  active
                    ? 'bg-white/8 text-warm'
                    : 'text-warm/45 hover:bg-white/6 hover:text-warm/80'
                }`}
              >
                <span className="shrink-0">{icon}</span>
                <span className="flex-1">{label}</span>
                <ChevronRight size={13} className="opacity-0 group-hover:opacity-60 transition-opacity" />
              </motion.button>
            </div>
          )
        })}
      </nav>

      <motion.div variants={item} className="border-t border-white/8 mt-4 mb-3" />

      {/* Déconnexion */}
      <motion.button
        variants={item}
        onClick={handleLogout}
        className="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-accent/70 hover:bg-accent/8 hover:text-accent transition-colors w-full"
      >
        <LogOut size={16} className="shrink-0" />
        <span>Déconnexion</span>
      </motion.button>
    </motion.aside>
  )
}
