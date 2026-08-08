import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

const VERT = `
  precision mediump float;
  uniform vec2 u_resolution;
  out vec2 fragCoord;
  void main() {
    gl_Position = vec4(position, 1.0);
    fragCoord = (position.xy + 1.0) * 0.5 * u_resolution;
    fragCoord.y = u_resolution.y - fragCoord.y;
  }
`

const FRAG = `
  precision mediump float;
  in vec2 fragCoord;
  uniform float u_time;
  uniform float u_opacities[10];
  uniform vec3 u_colors[6];
  uniform float u_total_size;
  uniform float u_dot_size;
  uniform vec2 u_resolution;
  uniform vec2 u_mouse;
  out vec4 fragColor;

  float PHI = 1.61803398874989484820459;
  float random(vec2 xy) {
    return fract(tan(distance(xy * PHI, xy) * 0.5) * xy.x);
  }

  void main() {
    vec2 st = fragCoord.xy;
    st.x -= abs(floor((mod(u_resolution.x, u_total_size) - u_dot_size) * 0.5));
    st.y -= abs(floor((mod(u_resolution.y, u_total_size) - u_dot_size) * 0.5));

    float opacity = step(0.0, st.x) * step(0.0, st.y);
    vec2 st2 = vec2(int(st.x / u_total_size), int(st.y / u_total_size));

    float frequency = 5.0;
    float show_offset = random(st2);
    float rand = random(st2 * floor((u_time / frequency) + show_offset + frequency));
    opacity *= u_opacities[int(rand * 10.0)];
    opacity *= 1.0 - step(u_dot_size / u_total_size, fract(st.x / u_total_size));
    opacity *= 1.0 - step(u_dot_size / u_total_size, fract(st.y / u_total_size));

    float animation_speed_factor = 3.0;
    vec2 center_grid = u_resolution / 2.0 / u_total_size;
    float dist_from_center = distance(center_grid, st2);
    float timing_offset = dist_from_center * 0.01 + (random(st2) * 0.15);
    opacity *= step(timing_offset, u_time * animation_speed_factor);
    opacity *= clamp((1.0 - step(timing_offset + 0.1, u_time * animation_speed_factor)) * 1.25, 1.0, 1.25);

    /* couleur de base blanche */
    vec3 color = vec3(1.0);

    /* influence souris → rouge */
    vec2 dot_pos = st2 * u_total_size + u_dot_size * 0.5;
    float mouse_dist = distance(dot_pos, u_mouse);
    float influence = 1.0 - smoothstep(0.0, 360.0, mouse_dist);
    color = mix(color, vec3(1.0, 0.08, 0.08), influence * 0.95);

    fragColor = vec4(color, opacity);
  }
`

function DotCanvas() {
  const canvasRef  = useRef(null)
  const uniformsRef = useRef(null)

  useEffect(() => {
    let active = true
    let renderer, geometry, material, animationId

    const init = (THREE) => {
      if (!canvasRef.current || !active) return
      renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, alpha: false, antialias: false })
      renderer.setClearColor(0x0a0a0a, 1)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.setSize(window.innerWidth, window.innerHeight)

      const scene  = new THREE.Scene()
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

      const uniforms = {
        u_time:       { value: 0 },
        u_resolution: { value: new THREE.Vector2(window.innerWidth * 2, window.innerHeight * 2) },
        u_opacities:  { value: [0.3, 0.3, 0.3, 0.5, 0.5, 0.5, 0.8, 0.8, 0.8, 1.0] },
        u_colors:     { value: Array(6).fill(null).map(() => new THREE.Vector3(1, 1, 1)) },
        u_total_size: { value: 22.0 },
        u_dot_size:   { value: 4.0 },
        u_mouse:      { value: new THREE.Vector2(-9999, -9999) },
      }

      uniformsRef.current = uniforms

      material = new THREE.ShaderMaterial({
        vertexShader: VERT, fragmentShader: FRAG, uniforms,
        glslVersion: THREE.GLSL3,
        blending: THREE.NormalBlending,
        transparent: true,
        depthWrite: false,
      })

      geometry = new THREE.PlaneGeometry(2, 2)
      scene.add(new THREE.Mesh(geometry, material))

      const t0 = performance.now()
      const tick = () => {
        if (!active) return
        animationId = requestAnimationFrame(tick)
        uniforms.u_time.value = (performance.now() - t0) / 1000
        renderer.render(scene, camera)
      }
      tick()

      const onResize = () => {
        renderer.setSize(window.innerWidth, window.innerHeight)
        uniforms.u_resolution.value.set(window.innerWidth * 2, window.innerHeight * 2)
      }
      const onMouse = (e) => {
        if (uniformsRef.current) {
          uniformsRef.current.u_mouse.value.set(e.clientX * 2, e.clientY * 2)
        }
      }
      window.addEventListener('resize', onResize)
      window.addEventListener('mousemove', onMouse)

      return () => {
        window.removeEventListener('resize', onResize)
        window.removeEventListener('mousemove', onMouse)
      }
    }

    let cleanup
    if (window.THREE) {
      cleanup = init(window.THREE)
    } else {
      const s = document.createElement('script')
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
      s.async = true
      s.onload = () => { cleanup = init(window.THREE) }
      document.head.appendChild(s)
    }

    return () => {
      active = false
      if (cleanup) cleanup()
      if (animationId) cancelAnimationFrame(animationId)
      if (renderer) renderer.dispose()
      if (geometry) geometry.dispose()
      if (material) material.dispose()
    }
  }, [])

  return (
    <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }} />
  )
}

export default function Login() {
  const [mode, setMode]         = useState('login') // 'login' | 'signup'
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')
  const { login, signup }       = useAuth()
  const navigate                = useNavigate()

  const switchMode = (m) => { setMode(m); setError(''); setSuccess('') }

  const handleOAuth = async (provider) => {
    setError('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    })
    if (error) setError(error.message)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (mode === 'signup' && password !== confirm) {
      setError('Les mots de passe ne correspondent pas')
      return
    }

    setLoading(true)
    try {
      if (mode === 'login') {
        await login(email, password)
        navigate('/', { replace: true })
      } else {
        await signup(email, password)
        setSuccess('Compte créé ! Vérifie ton email pour confirmer.')
      }
    } catch (err) {
      setError(err.message ?? 'Une erreur est survenue')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#0A0A0A]">
      <DotCanvas />

      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 1, background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 80%)' }} />

      <div
        className="relative flex flex-col items-center w-full max-w-sm mx-4 px-8 py-10 rounded-2xl border border-white/8"
        style={{ zIndex: 2, background: 'rgba(12,12,12,0.88)', backdropFilter: 'blur(24px)' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-8">
          <img src="/logo-icon-bold.svg?v=8" alt="" style={{ height: '26px', width: 'auto', display: 'block' }} />
          <span className="font-display text-2xl tracking-[0.22em] text-warm leading-none">PRISM</span>
        </div>

        {/* Toggle */}
        <div className="flex w-full mb-6 rounded-lg bg-white/5 p-0.5">
          <button
            onClick={() => switchMode('login')}
            className={`flex-1 py-1.5 rounded-md text-xs font-semibold tracking-wide transition-colors ${mode === 'login' ? 'bg-white/10 text-warm' : 'text-warm/35 hover:text-warm/60'}`}
          >
            Connexion
          </button>
          <button
            onClick={() => switchMode('signup')}
            className={`flex-1 py-1.5 rounded-md text-xs font-semibold tracking-wide transition-colors ${mode === 'signup' ? 'bg-white/10 text-warm' : 'text-warm/35 hover:text-warm/60'}`}
          >
            Créer un compte
          </button>
        </div>

        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="w-full bg-white/5 border border-white/8 rounded-lg px-4 py-2.5 text-sm text-warm placeholder-warm/25 focus:outline-none focus:border-accent/50 transition-colors"
          />
          <input
            type="password"
            placeholder="Mot de passe"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            className="w-full bg-white/5 border border-white/8 rounded-lg px-4 py-2.5 text-sm text-warm placeholder-warm/25 focus:outline-none focus:border-accent/50 transition-colors"
          />
          {mode === 'signup' && (
            <input
              type="password"
              placeholder="Confirmer le mot de passe"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              className="w-full bg-white/5 border border-white/8 rounded-lg px-4 py-2.5 text-sm text-warm placeholder-warm/25 focus:outline-none focus:border-accent/50 transition-colors"
            />
          )}

          {error   && <p className="text-accent text-xs text-center">{error}</p>}
          {success && <p className="text-green-400 text-xs text-center">{success}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-1 py-2.5 rounded-lg bg-accent text-white text-sm font-semibold tracking-wide hover:bg-accent/85 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {loading ? '…' : mode === 'login' ? 'Se connecter' : 'Créer mon compte'}
          </button>
        </form>

        {/* Séparateur */}
        <div className="flex items-center gap-3 w-full mt-6">
          <div className="flex-1 h-px bg-white/8" />
          <span className="text-warm/20 text-[10px] uppercase tracking-widest">ou</span>
          <div className="flex-1 h-px bg-white/8" />
        </div>

        {/* Boutons OAuth — icônes compactes */}
        <div className="flex gap-3 w-full mt-4 justify-center">
          {[
            {
              provider: 'google', label: 'Google',
              icon: <svg width="17" height="17" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>,
            },
            {
              provider: 'github', label: 'GitHub',
              icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg>,
            },
          ].map(({ provider, label, icon }) => (
            <button
              key={provider}
              onClick={() => handleOAuth(provider)}
              title={`Continuer avec ${label}`}
              className="flex-1 flex items-center justify-center h-10 rounded-xl border border-white/8 bg-white/3 hover:bg-white/8 text-warm/60 hover:text-warm transition-colors cursor-pointer"
            >
              {icon}
            </button>
          ))}
        </div>

        <p className="text-warm/15 text-[10px] mt-6 text-center">Prism · Bibliothèque privée</p>
      </div>
    </div>
  )
}
