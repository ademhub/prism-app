import { useEffect, useRef, useState } from 'react'
import { getTrailer } from '../api'

export default function TrailerModal({ mediaId, onClose }) {
  const [state, setState] = useState('loading') // loading | ready | error
  const [ytKey, setYtKey] = useState(null)
  const overlayRef = useRef(null)

  useEffect(() => {
    getTrailer(mediaId)
      .then((data) => { setYtKey(data.key); setState('ready') })
      .catch(() => setState('error'))
  }, [mediaId])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleOverlay = (e) => { if (e.target === overlayRef.current) onClose() }

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlay}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm animate-fade-in"
    >
      <div className="relative w-full max-w-4xl mx-4">
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 text-warm/50 hover:text-warm text-sm transition-colors"
        >
          Fermer ✕
        </button>

        <div className="relative w-full rounded-xl overflow-hidden bg-black" style={{ paddingBottom: '56.25%' }}>
          {state === 'loading' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-10 h-10 border-4 border-accent/30 border-t-accent rounded-full animate-spin" />
            </div>
          )}
          {state === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <p className="text-warm/50 text-sm">Aucune bande-annonce disponible.</p>
              <button onClick={onClose} className="text-accent text-sm hover:underline">Fermer</button>
            </div>
          )}
          {state === 'ready' && ytKey && (
            <iframe
              className="absolute inset-0 w-full h-full"
              src={`https://www.youtube-nocookie.com/embed/${ytKey}?autoplay=1&rel=0`}
              allow="autoplay; fullscreen"
              allowFullScreen
              title="Bande-annonce"
            />
          )}
        </div>
      </div>
    </div>
  )
}
