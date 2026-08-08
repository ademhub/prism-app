import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Plus, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getMyProfile } from '../api'

const COLORS = [
  '#E50914', '#E87C03', '#54B9C5', '#B39DDB',
  '#81C784', '#F06292', '#4DB6AC', '#FFB74D',
]

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
}

const card = {
  hidden:  { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 120, damping: 16 } },
}

export default function ProfileSelector() {
  const { profiles, selectProfile, removeProfile } = useAuth()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [avatars, setAvatars] = useState({})

  useEffect(() => {
    profiles.forEach((p) => {
      getMyProfile(p.id).then((sp) => {
        if (sp?.avatar_url) setAvatars((prev) => ({ ...prev, [p.id]: sp.avatar_url }))
      }).catch(() => {})
    })
  }, [profiles])

  const handleSelect = (profile) => {
    if (editing) return
    selectProfile(profile)
    navigate('/', { replace: true })
  }

  const handleAdd = () => navigate('/login')

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center px-8">
      {/* Logo */}
      <div className="flex items-center gap-2.5 mb-16">
        <img src="/logo-icon-bold.svg?v=8" alt="" style={{ height: '22px', width: 'auto', display: 'block' }} />
        <span className="font-display text-xl tracking-[0.22em] text-warm leading-none">PRISM</span>
      </div>

      {profiles.length > 0 && (
        <div className="flex flex-col items-center gap-3 mb-12">
          <h1 className="text-warm text-2xl md:text-4xl font-light tracking-wide">
            Qui regarde ?
          </h1>
          {(profiles.length > 1 || editing) && (
            <button onClick={() => setEditing((v) => !v)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors cursor-pointer ${
                editing
                  ? 'border-accent/40 text-accent bg-accent/10'
                  : 'border-white/15 text-warm/30 hover:text-warm/60 hover:border-white/30'
              }`}>
              {editing ? 'Terminer' : 'Gérer les profils'}
            </button>
          )}
        </div>
      )}

      <motion.div
        className="flex flex-wrap items-end justify-center gap-6 md:gap-10"
        variants={container}
        initial="hidden"
        animate="visible"
      >
        {profiles.map((profile, i) => (
          <motion.div
            key={profile.id}
            variants={card}
            className="flex flex-col items-center gap-3 group cursor-pointer relative"
            onClick={() => handleSelect(profile)}
          >
            <div className="relative">
              <motion.div
                whileHover={editing ? {} : { y: -6, scale: 1.04 }}
                whileTap={editing ? {} : { scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 200, damping: 18 }}
                className={`w-28 h-28 md:w-36 md:h-36 rounded-lg overflow-hidden flex items-center justify-center text-white text-4xl md:text-5xl font-bold shadow-lg ${editing ? 'animate-[wiggle_0.3s_ease-in-out_infinite]' : ''}`}
                style={{ background: avatars[profile.id] ? undefined : COLORS[i % COLORS.length] }}
              >
                {avatars[profile.id] ? (
                  <img src={avatars[profile.id]} alt={profile.name} className="w-full h-full object-cover" />
                ) : (
                  profile.name?.[0]?.toUpperCase() ?? '?'
                )}
              </motion.div>
              {editing && (
                <button
                  onClick={(e) => { e.stopPropagation(); removeProfile(profile.id) }}
                  className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg hover:bg-red-600 transition-colors cursor-pointer z-10"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <span className="text-warm/50 text-sm group-hover:text-warm transition-colors">
              {profile.name}
            </span>
          </motion.div>
        ))}

        {/* Bouton Ajouter */}
        <motion.div
          variants={card}
          className="flex flex-col items-center gap-3 group cursor-pointer"
          onClick={handleAdd}
        >
          <motion.div
            whileHover={{ y: -6, scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 200, damping: 18 }}
            className="w-28 h-28 md:w-36 md:h-36 rounded-lg border-2 border-dashed border-white/15 flex items-center justify-center text-white/25 group-hover:border-white/35 group-hover:text-white/50 transition-colors"
          >
            <Plus size={36} />
          </motion.div>
          <span className="text-warm/30 text-sm group-hover:text-warm/60 transition-colors">
            Ajouter un compte
          </span>
        </motion.div>
      </motion.div>
    </div>
  )
}
