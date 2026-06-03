import React, { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Check, ChevronRight, ChevronLeft, Shield, Palette, Globe, Trophy, Calendar, Upload } from 'lucide-react'
import { Button, Input, Card, Alert } from '../../components/ui'
import api from '../../lib/api'
import { useInstitutionStore } from '../../stores/institutionStore'
import {
  setupDomainsSchema,
  setupInstitutionSchema,
  setupSeasonSchema,
  setupSportsSchema,
  setupSuperAdminSchema,
} from '../../lib/validation/forms'

const STEPS = [
  { id: 1, label: 'Admin Account', icon: Shield },
  { id: 2, label: 'School Identity', icon: Palette },
  { id: 3, label: 'Email Domains', icon: Globe },
  { id: 4, label: 'Activate Sports', icon: Trophy },
  { id: 5, label: 'First Season', icon: Calendar },
]

const AVAILABLE_SPORTS = [
  { slug: 'basketball', label: 'Basketball', icon: '🏀' },
  { slug: 'volleyball', label: 'Volleyball', icon: '🏐' },
  { slug: 'table-tennis', label: 'Table Tennis', icon: '🏓' },
]

function mapZodFieldErrors(issues: { path: (string | number)[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of issues) {
    const key = issue.path[0]
    if (typeof key === 'string' && !out[key]) out[key] = issue.message
  }
  return out
}

export default function SetupPage() {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [setupSecret, setSetupSecret] = useState('')
  const [setupMeta, setSetupMeta] = useState({ loaded: false, requiresSecret: false })
  const logoFileRef = useRef<HTMLInputElement>(null)
  const { fetchInstitution } = useInstitutionStore()
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    api
      .get<{ setupComplete: boolean; requiresSetupSecret: boolean }>('/setup/status')
      .then(({ data }) => {
        if (cancelled) return
        if (data.setupComplete) {
          navigate('/super-admin/login', { replace: true })
          return
        }
        setSetupMeta({ loaded: true, requiresSecret: Boolean(data.requiresSetupSecret) })
      })
      .catch(() => {
        if (!cancelled) setSetupMeta({ loaded: true, requiresSecret: false })
      })
    return () => {
      cancelled = true
    }
  }, [navigate])

  const [form, setForm] = useState({
    superAdmin: { full_name: '', email: '', password: '', confirmPassword: '' },
    institution: {
      name: '',
      abbreviation: '',
      tagline: '',
      primary_color: '#0F172A',
      secondary_color: '#3B82F6',
      address: '',
      region: '',
      logo_url: '',
    },
    domains: { staff: 'mail.university.edu', student: 'students.university.edu' },
    sports: ['basketball', 'volleyball', 'table-tennis'] as string[],
    season: { name: 'AY 2025-2026', start_date: '2025-08-01', end_date: '2026-05-31' },
  })

  const update = (section: string, field: string, value: string) => {
    setForm((f) => ({ ...f, [section]: { ...(f as any)[section], [field]: value } }))
  }

  const handleSetupLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (setupMeta.requiresSecret && !setupSecret.trim()) {
      setError('Enter the setup key on step 1 before uploading a logo.')
      return
    }
    setLogoUploading(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (setupMeta.requiresSecret && setupSecret.trim()) {
        fd.append('setupSecret', setupSecret.trim())
      }
      const { data } = await api.post<{ logo_url: string }>('/setup/logo', fd)
      update('institution', 'logo_url', data.logo_url)
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      setError(msg ?? 'Logo upload failed')
    } finally {
      setLogoUploading(false)
    }
  }

  const toggleSport = (slug: string) => {
    setForm((f) => ({
      ...f,
      sports: f.sports.includes(slug) ? f.sports.filter((s) => s !== slug) : [...f.sports, slug],
    }))
  }

  const validateCurrentStep = (): string | null => {
    switch (step) {
      case 1: {
        const p = setupSuperAdminSchema.safeParse({
          full_name: form.superAdmin.full_name,
          email: form.superAdmin.email,
          password: form.superAdmin.password,
          confirmPassword: form.superAdmin.confirmPassword,
        })
        return p.success ? null : p.error.issues[0]?.message ?? 'Check the form'
      }
      case 2: {
        const p = setupInstitutionSchema.safeParse(form.institution)
        return p.success ? null : p.error.issues[0]?.message ?? 'Check the form'
      }
      case 3: {
        const p = setupDomainsSchema.safeParse(form.domains)
        return p.success ? null : p.error.issues[0]?.message ?? 'Check the form'
      }
      case 4: {
        const p = setupSportsSchema.safeParse(form.sports)
        return p.success ? null : p.error.issues[0]?.message ?? 'Check the form'
      }
      case 5: {
        if (!setupMeta.loaded) return 'Checking setup policy…'
        if (setupMeta.requiresSecret && !setupSecret.trim()) return 'Setup key is required'
        const p = setupSeasonSchema.safeParse(form.season)
        return p.success ? null : p.error.issues[0]?.message ?? 'Check the form'
      }
      default:
        return null
    }
  }

  const goNext = () => {
    setError('')
    if (step === 1) {
      const p = setupSuperAdminSchema.safeParse({
        full_name: form.superAdmin.full_name,
        email: form.superAdmin.email,
        password: form.superAdmin.password,
        confirmPassword: form.superAdmin.confirmPassword,
      })
      if (!p.success) {
        setFieldErrors(mapZodFieldErrors(p.error.issues))
        return
      }
      setFieldErrors({})
      setStep((s) => s + 1)
      return
    }
    const msg = validateCurrentStep()
    if (msg) {
      setError(msg)
      return
    }
    setStep((s) => s + 1)
  }

  const goBack = () => {
    setError('')
    setFieldErrors({})
    setStep((s) => s - 1)
  }

  const handleSubmit = async () => {
    setError('')
    const stepErr = validateCurrentStep()
    if (stepErr) {
      setError(stepErr)
      return
    }
    setLoading(true)
    setError('')
    try {
      await api.post('/setup/complete', {
        institution: {
          ...form.institution,
          logo_url: form.institution.logo_url.trim() || null,
          staff_email_domain: form.domains.staff,
          student_email_domain: form.domains.student,
        },
        superAdmin: {
          full_name: form.superAdmin.full_name,
          email: form.superAdmin.email,
          password: form.superAdmin.password,
        },
        activeSports: form.sports,
        season: form.season,
        ...(setupSecret.trim() ? { setupSecret: setupSecret.trim() } : {}),
      })
      await fetchInstitution()
      navigate('/super-admin/login', { replace: true })
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Setup failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div
            className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center text-white overflow-hidden border border-white/10"
            style={{ background: `linear-gradient(135deg, ${form.institution.primary_color}, ${form.institution.secondary_color})` }}
          >
            {form.institution.logo_url ? (
              <img src={form.institution.logo_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <Trophy className="w-8 h-8" aria-hidden />
            )}
          </div>
          <h1 className="text-3xl font-bold font-[Barlow_Condensed] tracking-wide">Welcome to U-Sports</h1>
          <p className="text-[var(--text-muted)] mt-1 text-sm">Configure your deployment in a few steps.</p>
          <p className="text-[var(--text-muted)] mt-2 text-sm">
            Already provisioned?{' '}
            <Link to="/super-admin/login" className="text-[#0066FF] hover:underline font-medium">
              Super admin portal
            </Link>
            {' · '}
            <Link to="/auth/login" className="text-[#0066FF] hover:underline font-medium">
              Staff / athlete sign in
            </Link>
          </p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-between mb-3">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            const done = step > s.id
            const active = step === s.id
            const failedHere =
              active && (!!error || (step === 1 && Object.keys(fieldErrors).length > 0))
            return (
              <React.Fragment key={s.id}>
                <div className="flex flex-col items-center gap-1 min-w-0">
                  <div
                    className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center border-2 transition-all ${
                      done
                        ? 'bg-[#00FF88] border-[#00FF88]'
                        : active
                          ? failedHere
                            ? 'border-[#FF3355] bg-[#FF3355]/10'
                            : 'border-[#0066FF] bg-[#0066FF]/10'
                          : 'border-[var(--border-subtle)]'
                    }`}
                  >
                    {done ? <Check className="w-5 h-5 text-black" /> : <Icon className={`w-4 h-4 ${active ? 'text-[#0066FF]' : 'text-[var(--text-muted)]'}`} />}
                  </div>
                  <span
                    className={`text-[10px] font-medium text-center leading-tight hidden sm:block max-w-[4.5rem] truncate ${
                      active ? 'text-white' : 'text-[var(--text-muted)]'
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 ${step > s.id ? 'bg-[#00FF88]' : 'bg-[var(--border-subtle)]'}`} />
                )}
              </React.Fragment>
            )
          })}
        </div>

        {error && (
          <div className="mb-4">
            <Alert type="danger" className="text-sm">
              {error}
            </Alert>
          </div>
        )}

        <Card className="p-6">
          {/* Step 1: Super Admin */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold">Create Super Admin Account</h2>
              <p className="text-sm text-[var(--text-muted)]">
                This account has full platform access. Use a reliable organizational email you control.
              </p>
              <Input
                label="Full name"
                value={form.superAdmin.full_name}
                onChange={(e) => {
                  update('superAdmin', 'full_name', e.target.value)
                  setFieldErrors((fe) => {
                    const next = { ...fe }
                    delete next.full_name
                    return next
                  })
                }}
                error={fieldErrors.full_name}
                errorPosition="above"
              />
              <Input
                label="Email"
                type="email"
                value={form.superAdmin.email}
                onChange={(e) => {
                  update('superAdmin', 'email', e.target.value)
                  setFieldErrors((fe) => {
                    const next = { ...fe }
                    delete next.email
                    return next
                  })
                }}
                error={fieldErrors.email}
                errorPosition="above"
              />
              <Input
                label="Password"
                type="password"
                value={form.superAdmin.password}
                onChange={(e) => {
                  update('superAdmin', 'password', e.target.value)
                  setFieldErrors((fe) => {
                    const next = { ...fe }
                    delete next.password
                    return next
                  })
                }}
                error={fieldErrors.password}
                errorPosition="above"
              />
              <Input
                label="Confirm password"
                type="password"
                value={form.superAdmin.confirmPassword}
                onChange={(e) => {
                  update('superAdmin', 'confirmPassword', e.target.value)
                  setFieldErrors((fe) => {
                    const next = { ...fe }
                    delete next.confirmPassword
                    return next
                  })
                }}
                error={fieldErrors.confirmPassword}
                errorPosition="above"
              />
              {setupMeta.loaded && setupMeta.requiresSecret && (
                <Input
                  label="Setup key"
                  type="password"
                  autoComplete="off"
                  value={setupSecret}
                  onChange={(e) => setSetupSecret(e.target.value)}
                  hint="Must match SETUP_SECRET on the API server. Required before uploading a logo (School Identity step) and to complete setup."
                />
              )}
            </div>
          )}

          {/* Step 2: School Identity */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold">School Identity</h2>
              <p className="text-sm text-[var(--text-muted)]">Branding and location shown across the platform.</p>
              <Input label="School Name" value={form.institution.name} onChange={(e) => update('institution', 'name', e.target.value)} />
              <div className="grid grid-cols-2 gap-4">
                <Input label="Abbreviation" value={form.institution.abbreviation} onChange={(e) => update('institution', 'abbreviation', e.target.value)} />
                <Input label="Tagline" value={form.institution.tagline} onChange={(e) => update('institution', 'tagline', e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium text-[var(--text-secondary)] block mb-1.5">School logo</label>
                <p className="text-xs text-[var(--text-muted)] mb-3">
                  Appears in the sidebar, sign-in page, guest hub, and live displays. Optional — JPEG, PNG, WebP, or SVG, max 5MB.
                </p>
                {setupMeta.requiresSecret && !setupSecret.trim() ? (
                  <p className="text-xs text-amber-400/90 mb-3">Enter the setup key on step 1 before uploading.</p>
                ) : null}
                <div className="flex flex-wrap items-center gap-4">
                  <div className="w-20 h-20 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] overflow-hidden flex items-center justify-center shrink-0">
                    {form.institution.logo_url ? (
                      <img src={form.institution.logo_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Trophy className="w-8 h-8 text-[var(--text-muted)]" aria-hidden />
                    )}
                  </div>
                  <div className="flex flex-col gap-2 items-start">
                    <input
                      ref={logoFileRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/svg+xml"
                      className="hidden"
                      disabled={logoUploading || (setupMeta.requiresSecret && !setupSecret.trim())}
                      onChange={handleSetupLogoFile}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={logoUploading || (setupMeta.requiresSecret && !setupSecret.trim())}
                      loading={logoUploading}
                      icon={logoUploading ? undefined : <Upload className="w-4 h-4" />}
                      onClick={() => logoFileRef.current?.click()}
                    >
                      {logoUploading ? 'Uploading…' : 'Upload logo'}
                    </Button>
                    {form.institution.logo_url ? (
                      <button
                        type="button"
                        className="text-xs text-[#FF3355] hover:underline"
                        onClick={() => update('institution', 'logo_url', '')}
                      >
                        Remove logo
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-[var(--text-secondary)] block mb-1.5">Primary Color</label>
                  <div className="flex gap-2 items-center">
                    <input type="color" value={form.institution.primary_color} onChange={(e) => update('institution', 'primary_color', e.target.value)} className="w-10 h-10 rounded cursor-pointer border-0 bg-transparent" />
                    <span className="text-sm font-mono text-[var(--text-muted)]">{form.institution.primary_color}</span>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-[var(--text-secondary)] block mb-1.5">Secondary Color</label>
                  <div className="flex gap-2 items-center">
                    <input type="color" value={form.institution.secondary_color} onChange={(e) => update('institution', 'secondary_color', e.target.value)} className="w-10 h-10 rounded cursor-pointer border-0 bg-transparent" />
                    <span className="text-sm font-mono text-[var(--text-muted)]">{form.institution.secondary_color}</span>
                  </div>
                </div>
              </div>
              <Input label="Address" value={form.institution.address} onChange={(e) => update('institution', 'address', e.target.value)} />
              <Input label="Region" value={form.institution.region} onChange={(e) => update('institution', 'region', e.target.value)} />
            </div>
          )}

          {/* Step 3: Email Domains */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold">Email Domain Configuration</h2>
              <p className="text-sm text-[var(--text-muted)]">
                Staff and student Microsoft 365 (or equivalent) domains used for sign-up validation. They must be different; athlete self-registration is limited to the student domain.
              </p>
              <Input
                label="Staff email domain"
                placeholder="mail.university.edu"
                value={form.domains.staff}
                onChange={(e) => setForm((f) => ({ ...f, domains: { ...f.domains, staff: e.target.value } }))}
                hint={`Example sign-in: name@${form.domains.staff}`}
              />
              <Input
                label="Student email domain"
                placeholder="students.university.edu"
                value={form.domains.student}
                onChange={(e) => setForm((f) => ({ ...f, domains: { ...f.domains, student: e.target.value } }))}
                hint={`Example sign-in: name@${form.domains.student}`}
              />
            </div>
          )}

          {/* Step 4: Activate Sports */}
          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold">Activate Sports</h2>
              <p className="text-sm text-[var(--text-muted)]">Select at least one module to enable for this deployment.</p>
              <div className="space-y-3">
                {AVAILABLE_SPORTS.map((sport) => (
                  <div
                    key={sport.slug}
                    className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all ${
                      form.sports.includes(sport.slug)
                        ? 'border-[#0066FF] bg-[#0066FF]/10'
                        : 'border-[var(--border-subtle)] hover:border-white/20'
                    }`}
                    onClick={() => toggleSport(sport.slug)}
                  >
                    <span className="text-2xl shrink-0" aria-hidden>
                      {sport.icon}
                    </span>
                    <p className="font-semibold flex-1">{sport.label}</p>
                    <div
                      className={`w-5 h-5 shrink-0 rounded-full border-2 flex items-center justify-center ${
                        form.sports.includes(sport.slug) ? 'border-[#0066FF] bg-[#0066FF]' : 'border-[var(--border-subtle)]'
                      }`}
                    >
                      {form.sports.includes(sport.slug) && <Check className="w-3 h-3 text-white" />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 5: First Season */}
          {step === 5 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold">Create First Season</h2>
              <p className="text-sm text-[var(--text-muted)]">Define the initial academic or competition window.</p>
              <Input label="Season Name" placeholder="AY 2025-2026" value={form.season.name} onChange={(e) => setForm((f) => ({ ...f, season: { ...f.season, name: e.target.value } }))} />
              <div className="grid grid-cols-2 gap-4">
                <Input label="Start Date" type="date" value={form.season.start_date} onChange={(e) => setForm((f) => ({ ...f, season: { ...f.season, start_date: e.target.value } }))} />
                <Input label="End Date" type="date" value={form.season.end_date} onChange={(e) => setForm((f) => ({ ...f, season: { ...f.season, end_date: e.target.value } }))} />
              </div>
              <div className="mt-4 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)]">
                <p className="text-sm font-semibold mb-2">Summary</p>
                <div className="text-xs text-[var(--text-muted)] space-y-1">
                  <p>
                    School: <span className="text-white">{form.institution.name || '—'}</span>
                  </p>
                  <p>
                    Admin: <span className="text-white">{form.superAdmin.email}</span>
                  </p>
                  <p>
                    Sports: <span className="text-white">{form.sports.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(', ')}</span>
                  </p>
                  <p>
                    Season: <span className="text-white">{form.season.name}</span>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-3 mt-6">
            {step > 1 && (
              <Button variant="secondary" icon={<ChevronLeft className="w-4 h-4" />} onClick={goBack}>
                Back
              </Button>
            )}
            <div className="flex-1" />
            {step < 5 ? (
              <Button icon={<ChevronRight className="w-4 h-4" />} onClick={goNext}>
                Continue
              </Button>
            ) : (
              <Button loading={loading} disabled={!setupMeta.loaded} onClick={handleSubmit} size="lg">
                Complete setup
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
