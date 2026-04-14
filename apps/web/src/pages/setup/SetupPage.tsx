import React, { useState } from 'react'
import { useNavigate } from 'react-router'
import { Check, ChevronRight, ChevronLeft, Shield, Palette, Globe, Trophy, Calendar } from 'lucide-react'
import { Button, Input, Card, Alert, Toggle } from '../../components/ui'
import api from '../../lib/api'
import { useInstitutionStore } from '../../stores/institutionStore'

const STEPS = [
  { id: 1, label: 'Admin Account', icon: Shield },
  { id: 2, label: 'School Identity', icon: Palette },
  { id: 3, label: 'Email Domains', icon: Globe },
  { id: 4, label: 'Activate Sports', icon: Trophy },
  { id: 5, label: 'First Season', icon: Calendar },
]

const AVAILABLE_SPORTS = [
  { slug: 'basketball', label: 'Basketball', icon: '🏀', description: '5-on-5, elimination/round-robin' },
  { slug: 'volleyball', label: 'Volleyball', icon: '🏐', description: 'Best-of-5 sets, rally scoring' },
  { slug: 'table-tennis', label: 'Table Tennis', icon: '🏓', description: 'Singles and Doubles events' },
]

export default function SetupPage() {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { fetchInstitution } = useInstitutionStore()
  const navigate = useNavigate()

  const [form, setForm] = useState({
    superAdmin: { full_name: '', email: '', password: '', confirmPassword: '' },
    institution: {
      name: 'National University Dasmariñas',
      abbreviation: 'NU Dasmariñas',
      tagline: 'Animo NU!',
      primary_color: '#002D62',
      secondary_color: '#FFD700',
      address: "Governor's Drive, Dasmariñas, Cavite",
      region: 'CALABARZON',
    },
    domains: { staff: 'nu-dasma.edu.ph', student: 'students.nu-dasma.edu.ph' },
    sports: ['basketball', 'volleyball', 'table-tennis'] as string[],
    season: { name: 'AY 2025-2026', start_date: '2025-08-01', end_date: '2026-05-31' },
  })

  const update = (section: string, field: string, value: string) => {
    setForm((f) => ({ ...f, [section]: { ...(f as any)[section], [field]: value } }))
  }

  const toggleSport = (slug: string) => {
    setForm((f) => ({
      ...f,
      sports: f.sports.includes(slug) ? f.sports.filter((s) => s !== slug) : [...f.sports, slug],
    }))
  }

  const handleSubmit = async () => {
    if (form.superAdmin.password !== form.superAdmin.confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    setError('')
    try {
      await api.post('/setup/complete', {
        institution: {
          ...form.institution,
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
      })
      await fetchInstitution()
      navigate('/auth/login')
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Setup failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center text-3xl"
            style={{ background: `linear-gradient(135deg, ${form.institution.primary_color}, ${form.institution.secondary_color})` }}>
            🏆
          </div>
          <h1 className="text-3xl font-bold font-[Barlow_Condensed] tracking-wide">Welcome to U-Sports</h1>
          <p className="text-[var(--text-muted)] mt-1 text-sm">Let's configure your platform — this only takes a minute.</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-between mb-8">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            const done = step > s.id
            const active = step === s.id
            return (
              <React.Fragment key={s.id}>
                <div className="flex flex-col items-center gap-1">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                    done ? 'bg-[#00FF88] border-[#00FF88]' : active ? 'border-[#0066FF] bg-[#0066FF]/10' : 'border-[var(--border-subtle)]'
                  }`}>
                    {done ? <Check className="w-5 h-5 text-black" /> : <Icon className={`w-4 h-4 ${active ? 'text-[#0066FF]' : 'text-[var(--text-muted)]'}`} />}
                  </div>
                  <span className={`text-[10px] font-medium hidden sm:block ${active ? 'text-white' : 'text-[var(--text-muted)]'}`}>
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

        <Card className="p-6">
          {error && <Alert type="danger" className="mb-4">{error}</Alert>}

          {/* Step 1: Super Admin */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold">Create Super Admin Account</h2>
              <p className="text-sm text-[var(--text-muted)]">This account has full platform control.</p>
              <Input label="Full Name" placeholder="Juan dela Cruz" value={form.superAdmin.full_name} onChange={(e) => update('superAdmin', 'full_name', e.target.value)} />
              <Input label="Email" type="email" placeholder="admin@nu-dasma.edu.ph" value={form.superAdmin.email} onChange={(e) => update('superAdmin', 'email', e.target.value)} />
              <Input label="Password" type="password" placeholder="Min. 8 characters" value={form.superAdmin.password} onChange={(e) => update('superAdmin', 'password', e.target.value)} />
              <Input label="Confirm Password" type="password" placeholder="Repeat password" value={form.superAdmin.confirmPassword} onChange={(e) => update('superAdmin', 'confirmPassword', e.target.value)} />
            </div>
          )}

          {/* Step 2: School Identity */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold">School Identity</h2>
              <p className="text-sm text-[var(--text-muted)]">This branding will appear across the entire platform.</p>
              <Input label="School Name" value={form.institution.name} onChange={(e) => update('institution', 'name', e.target.value)} />
              <div className="grid grid-cols-2 gap-4">
                <Input label="Abbreviation" value={form.institution.abbreviation} onChange={(e) => update('institution', 'abbreviation', e.target.value)} />
                <Input label="Tagline" value={form.institution.tagline} onChange={(e) => update('institution', 'tagline', e.target.value)} />
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
                These domains are used to validate who can register. Use your school's Microsoft 365 domains.
              </p>
              <Input label="Staff Email Domain (Organizers / Admin)" placeholder="nu-dasma.edu.ph" value={form.domains.staff} onChange={(e) => setForm((f) => ({ ...f, domains: { ...f.domains, staff: e.target.value } }))} hint={`Example: admin@${form.domains.staff}`} />
              <Input label="Student Email Domain (Athletes)" placeholder="students.nu-dasma.edu.ph" value={form.domains.student} onChange={(e) => setForm((f) => ({ ...f, domains: { ...f.domains, student: e.target.value } }))} hint={`Example: delacruzjm@${form.domains.student}`} />
              <Alert type="info">
                Athletes will register using the format: <strong>lastnameFM@{form.domains.student}</strong> (Last name + First initial + Middle initial)
              </Alert>
            </div>
          )}

          {/* Step 4: Activate Sports */}
          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold">Activate Sports</h2>
              <p className="text-sm text-[var(--text-muted)]">Choose which sports this platform will manage. You can add more later.</p>
              <div className="space-y-3">
                {AVAILABLE_SPORTS.map((sport) => (
                  <div key={sport.slug}
                    className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all ${
                      form.sports.includes(sport.slug)
                        ? 'border-[#0066FF] bg-[#0066FF]/10'
                        : 'border-[var(--border-subtle)] hover:border-white/20'
                    }`}
                    onClick={() => toggleSport(sport.slug)}
                  >
                    <span className="text-3xl">{sport.icon}</span>
                    <div className="flex-1">
                      <p className="font-semibold">{sport.label}</p>
                      <p className="text-xs text-[var(--text-muted)]">{sport.description}</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      form.sports.includes(sport.slug) ? 'border-[#0066FF] bg-[#0066FF]' : 'border-[var(--border-subtle)]'
                    }`}>
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
              <p className="text-sm text-[var(--text-muted)]">Define your current academic sports season.</p>
              <Input label="Season Name" placeholder="AY 2025-2026" value={form.season.name} onChange={(e) => setForm((f) => ({ ...f, season: { ...f.season, name: e.target.value } }))} />
              <div className="grid grid-cols-2 gap-4">
                <Input label="Start Date" type="date" value={form.season.start_date} onChange={(e) => setForm((f) => ({ ...f, season: { ...f.season, start_date: e.target.value } }))} />
                <Input label="End Date" type="date" value={form.season.end_date} onChange={(e) => setForm((f) => ({ ...f, season: { ...f.season, end_date: e.target.value } }))} />
              </div>
              <div className="mt-4 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)]">
                <p className="text-sm font-semibold mb-2">Review Summary</p>
                <div className="text-xs text-[var(--text-muted)] space-y-1">
                  <p>School: <span className="text-white">{form.institution.name}</span></p>
                  <p>Admin: <span className="text-white">{form.superAdmin.email}</span></p>
                  <p>Sports: <span className="text-white">{form.sports.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(', ')}</span></p>
                  <p>Season: <span className="text-white">{form.season.name}</span></p>
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-3 mt-6">
            {step > 1 && (
              <Button variant="secondary" icon={<ChevronLeft className="w-4 h-4" />} onClick={() => setStep((s) => s - 1)}>
                Back
              </Button>
            )}
            <div className="flex-1" />
            {step < 5 ? (
              <Button icon={<ChevronRight className="w-4 h-4" />} onClick={() => setStep((s) => s + 1)}>
                Continue
              </Button>
            ) : (
              <Button loading={loading} onClick={handleSubmit} size="lg">
                Launch U-Sports 🚀
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
