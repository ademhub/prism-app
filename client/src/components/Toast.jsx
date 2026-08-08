import { useState, useCallback, createContext, useContext } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Check, AlertTriangle, Info } from 'lucide-react'

const ToastContext = createContext(null)
let nextId = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const remove = useCallback((id) => {
    setToasts((p) => p.filter((t) => t.id !== id))
  }, [])

  const add = useCallback((text, type = 'message') => {
    const id = nextId++
    setToasts((p) => [...p, { id, text, type }])
    setTimeout(() => remove(id), 3200)
  }, [remove])

  const ctx = {
    message: useCallback((text) => add(text, 'message'), [add]),
    success: useCallback((text) => add(text, 'success'), [add]),
    error:   useCallback((text) => add(text, 'error'),   [add]),
    warning: useCallback((text) => add(text, 'warning'), [add]),
  }

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      <div className="fixed bottom-24 right-5 z-[9999] flex flex-col-reverse gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => {
            const styles = {
              success: { wrap: 'bg-green-500/12 border-green-500/25 text-green-400', icon: <Check size={13} className="shrink-0" /> },
              error:   { wrap: 'bg-accent/12 border-accent/25 text-accent',         icon: <AlertTriangle size={13} className="shrink-0" /> },
              warning: { wrap: 'bg-amber-400/12 border-amber-400/25 text-amber-300', icon: <AlertTriangle size={13} className="shrink-0" /> },
              message: { wrap: 'bg-surface/95 border-white/10 text-warm',            icon: <Info size={13} className="shrink-0 text-warm/40" /> },
            }[t.type] ?? {}

            return (
              <motion.div key={t.id}
                initial={{ opacity: 0, x: 30, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 20, scale: 0.95 }}
                transition={{ duration: 0.22, ease: [0.25, 0.75, 0.6, 0.98] }}
                className={`pointer-events-auto flex items-center gap-3 pl-3.5 pr-2 py-2.5 rounded-2xl shadow-2xl border text-[13px] font-medium backdrop-blur-xl min-w-[220px] max-w-[320px] ${styles.wrap}`}
              >
                {styles.icon}
                <span className="flex-1 leading-snug">{t.text}</span>
                <button onClick={() => remove(t.id)}
                  className="opacity-35 hover:opacity-70 transition-opacity p-1 rounded-lg hover:bg-white/5 cursor-pointer">
                  <X size={12} />
                </button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
