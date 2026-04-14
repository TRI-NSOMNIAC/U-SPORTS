import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router'
import { Mail, Lock, Eye, EyeOff, LogIn } from 'lucide-react'
import { Button, Input, Alert, Card } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { useInstitutionStore } from '../../stores/institutionStore'
import { useAuthStore } from '../../stores/authStore'
import { loginFormSchema } from '../../lib/validation/forms'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { institution } = useInstitutionStore()
  const { fetchProfile } = useAuthStore()
  const navigate = useNavigate()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const parsed = loginFormSchema.safeParse({ email: email.trim(), password })
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? 'Invalid form')
      }
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: parsed.data.email,
        password: parsed.data.password,
      })
      if (authError) throw new Error(authError.message)
      if (data.session) {
        await fetchProfile(data.session.user.id)
        const { profile } = useAuthStore.getState()
        const routes: Record<string, string> = {
          super_admin: '/super-admin',
          organizer: '/organizer',
          athlete: '/athlete',
        }
        navigate(routes[profile?.role ?? 'athlete'] ?? '/guest')
      }
    } catch (err: any) {
      setError(err.message || 'Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F] flex">
      {/* Left panel - branding */}
      <div
        className="hidden lg:flex w-1/2 flex-col items-center justify-center p-12 relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, var(--school-primary) 0%, #001A3D 100%)` }}
      >
        <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, #FFD700 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        <div className="relative z-10 text-center">
          {institution?.logo_url ? (
            <img src={institution.logo_url} alt="Logo" className="w-32 h-32 mx-auto mb-6 rounded-full" />
          ) : (
            <div className="w-32 h-32 mx-auto mb-6 rounded-full flex items-center justify-center text-5xl"
              style={{ backgroundColor: 'var(--school-secondary)', color: 'var(--school-primary)' }}>
              🏆
            </div>
          )}
          <h1 className="text-4xl font-black font-[Barlow_Condensed] tracking-widest"
            style={{ color: 'var(--school-secondary)' }}>
            {institution?.abbreviation ?? 'U-Sports'}
          </h1>
          <p className="text-white/70 mt-2 text-lg">{institution?.name}</p>
          <p className="text-white/40 mt-1 italic text-sm">{institution?.tagline}</p>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden text-center">
            <h1 className="text-2xl font-bold font-[Barlow_Condensed]">U-Sports</h1>
            <p className="text-[var(--text-muted)] text-sm">{institution?.name}</p>
          </div>

          <h2 className="text-2xl font-bold mb-1">Sign In</h2>
          <p className="text-[var(--text-muted)] text-sm mb-6">
            Access your U-Sports dashboard
          </p>

          {error && <Alert type="danger" className="mb-4">{error}</Alert>}

          <form onSubmit={handleLogin} className="space-y-4">
            <Input
              label="Email"
              type="email"
              placeholder="yourname@nu-dasma.edu.ph"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              icon={<Mail className="w-4 h-4" />}
              required
            />
            <div>
              <Input
                label="Password"
                type={showPass ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                icon={<Lock className="w-4 h-4" />}
                required
              />
              <button
                type="button"
                className="mt-1 text-xs text-[var(--text-muted)] hover:text-white flex items-center gap-1"
                onClick={() => setShowPass(!showPass)}
              >
                {showPass ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                {showPass ? 'Hide' : 'Show'} password
              </button>
            </div>
            <Button type="submit" className="w-full" size="lg" loading={loading} icon={<LogIn className="w-4 h-4" />}>
              Sign In
            </Button>
          </form>

          <div className="mt-6 space-y-3 text-center text-sm">
            <p className="text-[var(--text-muted)]">
              Are you a student athlete?{' '}
              <Link to="/auth/register" className="text-[#0066FF] hover:underline font-medium">
                Register here
              </Link>
            </p>
            <p className="text-[var(--text-muted)]">
              Just browsing?{' '}
              <Link to="/guest" className="text-[var(--text-secondary)] hover:text-white">
                View as Guest →
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
