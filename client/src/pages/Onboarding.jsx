import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion'
import { Heart, X, Camera, ChevronRight, Check } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { getMedia, updateMyProfile, uploadAvatar } from '../api'
import { useFavorites } from '../context/FavoritesContext'
import { useToast } from '../components/Toast'

const IMG = (path) => path ? `https://image.tmdb.org/t/p/w500${path}` : null

// ── Indicateur d'étapes ───────────────────────────────────────────────────────
function Steps({ current, total }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={`h-1 rounded-full transition-all duration-400 ${
          i < current ? 'w-6 bg-accent/50' : i === current ? 'w-8 bg-accent' : 'w-4 bg-white/12'
        }`} />
      ))}
    </div>
  )
}

// ── Étape 1 : Nom & Pseudo ────────────────────────────────────────────────────
function StepName({ onNext }) {
  const { user, activeProfile } = useAuth()
  const [form, setForm] = useState({
    display_name: activeProfile?.name ?? '',
    username: '',
  })

  const canContinue = form.display_name.trim().length > 0

  return (
    <motion.div key="name"
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.28 }}
      className="flex flex-col items-center gap-8 w-full"
    >
      <div className="text-center">
        <p className="text-warm/40 text-xs uppercase tracking-[0.2em] mb-2">Étape 1</p>
        <h2 className="font-display text-3xl text-warm">Comment t'appelles-tu ?</h2>
      </div>

      <div className="flex flex-col gap-3 w-full">
        <input
          autoFocus
          value={form.display_name}
          onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
          placeholder="Ton prénom ou surnom"
          className="w-full bg-white/5 border border-white/8 rounded-2xl px-5 py-4 text-base text-warm placeholder-warm/20 focus:outline-none focus:border-accent/40 transition-colors text-center"
        />
        <div className="relative">
          <span className="absolute left-5 top-1/2 -translate-y-1/2 text-warm/25 text-base select-none">@</span>
          <input
            value={form.username}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))}
            placeholder="pseudo (optionnel)"
            className="w-full bg-white/5 border border-white/8 rounded-2xl pl-9 pr-5 py-4 text-base text-warm placeholder-warm/20 focus:outline-none focus:border-accent/40 transition-colors text-center"
          />
        </div>
      </div>

      <button
        onClick={() => canContinue && onNext(form)}
        disabled={!canContinue}
        className="flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-accent text-white font-semibold text-sm hover:bg-accent/85 transition-all disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
      >
        Continuer <ChevronRight size={15} />
      </button>
    </motion.div>
  )
}

// ── Étape 2 : Photo ───────────────────────────────────────────────────────────
function StepPhoto({ nameData, onNext, onSkip }) {
  const [preview, setPreview] = useState(null)
  const [file, setFile]       = useState(null)
  const inputRef              = useRef(null)

  const handleFile = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  const initials = (nameData.display_name || '?').slice(0, 2).toUpperCase()

  return (
    <motion.div key="photo"
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.28 }}
      className="flex flex-col items-center gap-8 w-full"
    >
      <div className="text-center">
        <p className="text-warm/40 text-xs uppercase tracking-[0.2em] mb-2">Étape 2</p>
        <h2 className="font-display text-3xl text-warm">Ta photo</h2>
      </div>

      <label className="relative cursor-pointer group">
        <div className="w-36 h-36 rounded-full overflow-hidden border-2 border-white/10 group-hover:border-accent/50 transition-colors">
          {preview ? (
            <img src={preview} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-accent/12 flex items-center justify-center text-accent font-bold text-4xl">
              {initials}
            </div>
          )}
        </div>
        <div className="absolute inset-0 rounded-full bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5">
          <Camera size={22} className="text-white" />
          <span className="text-white text-[11px] font-medium">{preview ? 'Changer' : 'Ajouter'}</span>
        </div>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </label>

      <p className="text-warm/30 text-sm -mt-4">Clique pour {preview ? 'changer' : 'choisir'} une photo</p>

      <div className="flex flex-col items-center gap-3 w-full">
        <button
          onClick={() => onNext(file)}
          className="flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-accent text-white font-semibold text-sm hover:bg-accent/85 transition-all cursor-pointer w-full justify-center"
        >
          {preview ? <><Check size={15} /> Valider</> : <> Continuer <ChevronRight size={15} /></>}
        </button>
        <button onClick={onSkip} className="text-warm/25 text-xs hover:text-warm/50 transition-colors cursor-pointer py-1">
          Passer cette étape
        </button>
      </div>
    </motion.div>
  )
}

// ── Carte film ────────────────────────────────────────────────────────────────
function FilmCard({ film, onLike, onSkip }) {
  const x      = useMotionValue(0)
  const rotate = useTransform(x, [-180, 0, 180], [-10, 0, 10])
  const likeOp = useTransform(x, [30, 80], [0, 1])
  const skipOp = useTransform(x, [-80, -30], [1, 0])
  const [gone, setGone] = useState(null)

  const exit = (dir) => {
    if (gone) return
    setGone(dir)
    setTimeout(dir === 'right' ? onLike : onSkip, 300)
  }

  const titre  = film.titre_officiel || film.titre_brut || ''
  const annee  = film.annee_devinee
  const genres = Array.isArray(film.genres) ? film.genres : (() => { try { return JSON.parse(film.genres ?? '[]') } catch { return [] } })()

  return (
    <motion.div
      style={{ x, rotate }}
      drag={gone ? false : 'x'}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.15}
      onDragEnd={(_, i) => {
        if (i.offset.x > 70) exit('right')
        else if (i.offset.x < -70) exit('left')
      }}
      animate={gone ? { x: gone === 'right' ? 520 : -520, rotate: gone === 'right' ? 15 : -15 } : {}}
      transition={gone ? { duration: 0.28, ease: 'easeIn' } : {}}
      className="absolute inset-0 cursor-grab active:cursor-grabbing select-none touch-none"
      style={{ x, rotate, zIndex: 10, position: 'absolute', inset: 0 }}
    >
      <div className="relative w-full h-full rounded-3xl overflow-hidden shadow-2xl" style={{ background: '#111' }}>
        {film.poster_path && (
          <img
            src={IMG(film.poster_path)}
            alt={titre}
            className="absolute inset-0 w-full h-full object-cover"
            draggable={false}
          />
        )}

        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.15) 50%, transparent 100%)' }} />

        {/* Infos */}
        <div className="absolute inset-x-0 bottom-0 px-5 pb-5">
          <p className="text-white font-display text-xl leading-tight drop-shadow">{titre}</p>
          <p className="text-white/50 text-sm mt-0.5">{annee}</p>
          {genres.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {genres.slice(0, 3).map((g) => (
                <span key={g} className="px-2.5 py-0.5 rounded-full text-white/75 text-[10px] font-medium border border-white/20" style={{ background: 'rgba(255,255,255,0.1)' }}>{g}</span>
              ))}
            </div>
          )}
        </div>

        {/* Note */}
        {film.note > 0 && (
          <div className="absolute top-4 right-4 px-2.5 py-1 rounded-xl text-white text-xs font-bold" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.12)' }}>
            ★ {Number(film.note).toFixed(1)}
          </div>
        )}

        {/* Overlay LIKE */}
        <motion.div
          style={{ opacity: likeOp, background: 'linear-gradient(135deg, transparent, rgba(34,197,94,0.3))' }}
          className="absolute inset-0 pointer-events-none flex items-start justify-end p-4">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white text-xs font-bold shadow-lg" style={{ background: '#22c55e' }}>
            <Heart size={12} fill="white" /> J'aime
          </div>
        </motion.div>

        {/* Overlay SKIP */}
        <motion.div
          style={{ opacity: skipOp, background: 'linear-gradient(225deg, transparent, rgba(239,68,68,0.3))' }}
          className="absolute inset-0 pointer-events-none flex items-start justify-start p-4">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white text-xs font-bold shadow-lg" style={{ background: '#dc2626' }}>
            <X size={12} /> Skip
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}

// ── Étape 3 : Films ───────────────────────────────────────────────────────────
function StepFilms({ onDone }) {
  const { toggle } = useFavorites()
  const toast = useToast()

  const [films, setFilms]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [index, setIndex]       = useState(0)
  const [liked, setLiked]       = useState([])
  const [cardKey, setCardKey]   = useState(0)

  useEffect(() => {
    setLoading(true)
    getMedia().then((all) => {
      const score = (f) => {
        const note   = f.note ?? 0
        const year   = parseInt(f.annee_devinee) || 2000
        const recent = Math.min(3, Math.max(0, (year - 2000) / 6))
        return note + recent
      }
      const top = [...all]
        .filter((f) => f.poster_path && (f.note ?? 0) >= 6.5)
        .sort((a, b) => score(b) - score(a))
        .slice(0, 10)
      setFilms(top)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const handleLike = useCallback(() => {
    const film = films[index]
    if (film) { toggle(film.id); setLiked((p) => [...p, film]) }
    setCardKey((k) => k + 1)
    setIndex((i) => i + 1)
  }, [films, index, toggle])

  const handleSkip = useCallback(() => {
    setCardKey((k) => k + 1)
    setIndex((i) => i + 1)
  }, [])

  const done    = !loading && index >= films.length
  const current = films[index]

  return (
    <motion.div key="films"
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.28 }}
      className="flex flex-col items-center gap-6 w-full"
    >
      <div className="text-center">
        <p className="text-warm/40 text-xs uppercase tracking-[0.2em] mb-2">Étape 3</p>
        <h2 className="font-display text-3xl text-warm">Tes coups de cœur</h2>
        <p className="text-warm/35 text-sm mt-1">Top 10 des films qui font le plus envie</p>
      </div>

      {/* Zone cartes */}
      <div className="relative w-full" style={{ height: 360 }}>

        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center rounded-3xl border border-white/8" style={{ background: '#111' }}>
            <div className="w-8 h-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
          </div>
        ) : done ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-3xl border border-white/8" style={{ background: '#111', zIndex: 10 }}>
            <Check size={40} className="text-green-400" />
            <p className="text-warm/50">Top 10 exploré !</p>
          </div>
        ) : (
          <>
            {films.slice(index + 1, index + 3).map((f, i) => (
              <div
                key={f.id}
                className="absolute rounded-3xl overflow-hidden pointer-events-none"
                style={{
                  inset: 0,
                  transform: `scale(${1 - (i + 1) * 0.05}) translateY(${(i + 1) * 14}px)`,
                  zIndex: 5 - i,
                  background: '#111',
                }}
              >
                {f.poster_path && (
                  <img src={IMG(f.poster_path)} alt="" className="w-full h-full object-cover" style={{ opacity: 0.7 - i * 0.2 }} />
                )}
                <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${0.45 + i * 0.15})` }} />
              </div>
            ))}
            <AnimatePresence mode="wait">
              <FilmCard key={cardKey} film={current} onLike={handleLike} onSkip={handleSkip} />
            </AnimatePresence>
          </>
        )}
      </div>

      {/* Dots progression */}
      {!loading && (
        <div className="flex items-center gap-1.5">
          {films.map((_, i) => (
            <div key={i} className={`rounded-full transition-all duration-300 ${
              i < index  ? 'w-2 h-2 bg-accent/40' :
              i === index ? 'w-3 h-3 bg-accent'   : 'w-2 h-2 bg-white/12'
            }`} />
          ))}
        </div>
      )}

      {/* Boutons */}
      {!loading && !done && (
        <div className="flex items-center gap-8">
          <button onClick={handleSkip}
            className="w-14 h-14 rounded-full border border-white/12 flex items-center justify-center text-warm/50 hover:text-warm transition-colors cursor-pointer"
            style={{ background: 'rgba(255,255,255,0.06)' }}>
            <X size={22} />
          </button>
          <span className="text-warm/20 text-xs tabular-nums">{index + 1} / {films.length}</span>
          <button onClick={handleLike}
            className="w-14 h-14 rounded-full border border-accent/30 flex items-center justify-center text-accent hover:border-accent/60 transition-colors cursor-pointer"
            style={{ background: 'rgba(229,9,20,0.12)' }}>
            <Heart size={22} fill="currentColor" />
          </button>
        </div>
      )}

      <button onClick={() => onDone(liked)}
        className="flex items-center gap-2 py-3.5 rounded-2xl bg-accent text-white font-semibold text-sm hover:bg-accent/85 transition-all cursor-pointer w-full justify-center">
        <Check size={15} />
        {liked.length > 0 ? `Terminer · ${liked.length} favori${liked.length > 1 ? 's' : ''}` : 'Passer'}
      </button>
    </motion.div>
  )
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function Onboarding() {
  const { user, activeProfile, refreshSocialProfile } = useAuth()
  const navigate    = useNavigate()
  const toast       = useToast()
  const [step, setStep] = useState(0)
  const [nameData, setNameData] = useState(null)
  const socialId = activeProfile?.id ?? user?.id

  // On marque immédiatement dès l'entrée — évite toute boucle si on quitte sans finir
  useEffect(() => {
    if (activeProfile?.id) localStorage.setItem(`movy_onboarded_${activeProfile.id}`, '1')
  }, [activeProfile?.id])

  const finish = useCallback(() => {
    navigate('/', { replace: true })
  }, [navigate])

  const handleName = async (form) => {
    try {
      await updateMyProfile({ userId: socialId, ...form })
      refreshSocialProfile(socialId)
      setNameData(form)
      setStep(1)
    } catch {
      toast.error('Erreur, réessaie')
    }
  }

  const handlePhoto = async (file) => {
    if (file && socialId) {
      try {
        await uploadAvatar(socialId, file)
        refreshSocialProfile(socialId)
        toast.success('Photo enregistrée !')
      } catch {
        toast.error('Erreur lors de l\'upload')
      }
    }
    setStep(2)
  }

  const handleFilms = (liked) => {
    if (liked.length > 0) toast.success(`${liked.length} favori${liked.length > 1 ? 's' : ''} sauvegardé${liked.length > 1 ? 's' : ''} !`)
    finish()
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-5 py-12">
      {/* Logo */}
      <div className="flex items-center gap-2.5 mb-10">
        <img src="/logo-icon-bold.svg?v=8" alt="" style={{ height: '20px', width: 'auto' }} />
        <span className="font-display text-xl tracking-[0.22em] text-warm leading-none">PRISM</span>
      </div>

      {/* Stepper */}
      <div className="mb-10">
        <Steps current={step} total={3} />
      </div>

      {/* Contenu */}
      <div className="w-full max-w-sm">
        <AnimatePresence mode="wait">
          {step === 0 && <StepName key="s0" onNext={handleName} />}
          {step === 1 && <StepPhoto key="s1" nameData={nameData ?? { display_name: activeProfile?.name ?? '' }} onNext={handlePhoto} onSkip={() => setStep(2)} />}
          {step === 2 && <StepFilms key="s2" onDone={handleFilms} />}
        </AnimatePresence>
      </div>
    </div>
  )
}
