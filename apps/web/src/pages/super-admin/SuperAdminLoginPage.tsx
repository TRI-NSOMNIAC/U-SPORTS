import React, { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { Shield, Mail, Lock, Eye, EyeOff, LogIn } from 'lucide-react'
import { Button, Input, Alert } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useInstitutionStore } from '../../stores/institutionStore'
import { loginFormSchema } from '../../lib/validation/forms'
import { sessionScopedProfile } from '../../lib/sessionProfile'

export default function SuperAdminLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const { session, profile, fetchProfile } = useAuthStore()
  const scopedProfile = sessionScopedProfile(session, profile)
  const { institution } = useInstitutionStore()
  const navigate = useNavigate()

  // Synchronous guards — App.tsx spinner ensures both stores are settled before render,
  // so these run without any flash.
  if (!institution?.is_setup_complete) {
    return <Navigate to="/setup" replace />
  }
  if (session && scopedProfile?.role === 'super_admin') {
    return <Navigate to="/super-admin" replace />
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
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
        const { profile: p } = useAuthStore.getState()

        if (p?.role !== 'super_admin') {
          await supabase.auth.signOut()
          useAuthStore.setState({ session: null, user: null, profile: null })
          throw new Error('This portal is for super admins only. Students and organizers use the main login.')
        }

        navigate('/super-admin', { replace: true })
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid credentials')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-6"
      style={{
        backgroundImage:
          'radial-gradient(circle at 25% 50%, rgba(0,102,255,0.07) 0%, transparent 55%), radial-gradient(circle at 75% 50%, rgba(0,102,255,0.04) 0%, transparent 55%)',
      }}
    >
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#0066FF]/10 border border-[#0066FF]/20 mb-4 overflow-hidden">
            {institution?.logo_url ? (
              <img src={institution.logo_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <Shield className="w-8 h-8 text-[#0066FF]" />
            )}
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Super Admin Portal</h1>
          <p className="text-[var(--text-muted)] text-sm mt-1">
            {institution?.name ?? 'U-Sports'} · Platform administration
          </p>
        </div>

        <div className="bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-2xl p-8">
          {error && <Alert type="danger" className="mb-5">{error}</Alert>}

          <form onSubmit={handleLogin} className="space-y-4">
            <Input
              label="Admin Email"
              type="email"
              placeholder="admin@institution.edu"
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
                className="mt-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center gap-1"
                onClick={() => setShowPass(!showPass)}
              >
                {showPass ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                {showPass ? 'Hide' : 'Show'} password
              </button>
            </div>
            <Button
              type="submit"
              className="w-full"
              size="lg"
              loading={submitting}
              icon={<LogIn className="w-4 h-4" />}
            >
              Sign In
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-[var(--text-muted)] mt-6">
          Not an admin?{' '}
          <a href="/auth/login" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline">
            Student / Organizer login →
          </a>
        </p>
      </div>
    </div>
  )
}
