import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router'
import { User, Mail, Lock, Hash, BookOpen, GraduationCap, ChevronRight, ChevronLeft, Upload, Check } from 'lucide-react'
import { Button, Input, Select, Alert, Card } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { useInstitutionStore } from '../../stores/institutionStore'
import { getSportLabel } from '../../lib/utils'

const STEPS = ['Account Info', 'Athlete Profile', 'Documents', 'Review']

const YEAR_LEVELS = [
  { value: '1st Year', label: '1st Year' },
  { value: '2nd Year', label: '2nd Year' },
  { value: '3rd Year', label: '3rd Year' },
  { value: '4th Year', label: '4th Year' },
  { value: '5th Year', label: '5th Year' },
]

const SPORTS = [
  { value: 'basketball', label: '🏀 Basketball' },
  { value: 'volleyball', label: '🏐 Volleyball' },
  { value: 'table-tennis', label: '🏓 Table Tennis' },
]

export default function RegisterPage() {
  const { institution, sports } = useInstitutionStore()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [corFile, setCorFile] = useState<File | null>(null)
  const [medFile, setMedFile] = useState<File | null>(null)

  const [form, setForm] = useState({
    email: '',
    password: '',
    full_name: '',
    student_id: '',
    sport: 'basketball',
    position: '',
    jersey_number: '',
    year_level: '1st Year',
    department: '',
  })

  const update = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }))

  const activeSports = sports.filter((s) => s.is_active).map((s) => ({ value: s.slug, label: getSportLabel(s.slug as any) }))
  const positions = sports.find((s) => s.slug === form.sport)?.positions as string[] ?? []

  const handleRegister = async () => {
    if (!corFile || !medFile) {
      setError('Please upload both your COR and Medical Certificate')
      return
    }

    setLoading(true)
    setError('')

    try {
      // Validate domain
      const studentDomain = institution?.student_email_domain ?? 'students.nu-dasma.edu.ph'
      if (!form.email.endsWith(`@${studentDomain}`)) {
        throw new Error(`Use your school email: @${studentDomain}`)
      }

      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: { full_name: form.full_name, role: 'athlete' },
        },
      })

      if (authError) throw new Error(authError.message)
      if (!authData.user) throw new Error('Registration failed')

      // Create athlete record
      const { data: athlete, error: athleteError } = await supabase
        .from('athletes')
        .insert({
          profile_id: authData.user.id,
          student_id: form.student_id,
          sport: form.sport,
          position: form.position,
          jersey_number: form.jersey_number || null,
          year_level: form.year_level,
          department: form.department,
          verification_status: 'pending',
          season_status: 'active',
        })
        .select()
        .single()

      if (athleteError) throw new Error(athleteError.message)

      // Upload documents
      const uploadDoc = async (file: File, type: 'cor' | 'medical_cert') => {
        const ext = file.name.split('.').pop()
        const path = `${authData.user!.id}/${type}.${ext}`
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('verification-documents')
          .upload(path, file, { upsert: true })
        if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`)
        const { data: urlData } = supabase.storage.from('verification-documents').getPublicUrl(path)
        await supabase.from('verification_documents').insert({
          athlete_id: athlete.id,
          document_type: type,
          file_url: urlData.publicUrl,
        })
      }

      await uploadDoc(corFile, 'cor')
      await uploadDoc(medFile, 'medical_cert')

      navigate('/athlete?registered=1')
    } catch (err: any) {
      setError(err.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold">Athlete Registration</h1>
          <p className="text-[var(--text-muted)] text-sm mt-1">{institution?.name}</p>
        </div>

        {/* Step tabs */}
        <div className="flex gap-2 mb-6">
          {STEPS.map((s, i) => (
            <div key={s} className={`flex-1 h-1 rounded-full transition-all ${i <= step ? 'bg-[#0066FF]' : 'bg-[var(--border-subtle)]'}`} />
          ))}
        </div>
        <p className="text-center text-xs text-[var(--text-muted)] mb-4">Step {step + 1} of {STEPS.length}: {STEPS[step]}</p>

        <Card className="p-6">
          {error && <Alert type="danger" className="mb-4">{error}</Alert>}

          {/* Step 0: Account */}
          {step === 0 && (
            <div className="space-y-4">
              <Input label="Full Name" placeholder="Juan dela Cruz" value={form.full_name} onChange={(e) => update('full_name', e.target.value)} icon={<User className="w-4 h-4" />} />
              <Input label="School Email" type="email" placeholder={`dacubayc@${institution?.student_email_domain ?? 'students.nu-dasma.edu.ph'}`} value={form.email} onChange={(e) => update('email', e.target.value)} icon={<Mail className="w-4 h-4" />} hint="Format: LastnameFM@students.nu-dasma.edu.ph" />
              <Input label="Password" type="password" placeholder="Min. 8 characters" value={form.password} onChange={(e) => update('password', e.target.value)} icon={<Lock className="w-4 h-4" />} />
            </div>
          )}

          {/* Step 1: Athlete Profile */}
          {step === 1 && (
            <div className="space-y-4">
              <Input label="Student ID" placeholder="2021-00000" value={form.student_id} onChange={(e) => update('student_id', e.target.value)} icon={<Hash className="w-4 h-4" />} />
              <Select label="Sport" value={form.sport} onChange={(e) => update('sport', e.target.value)} options={activeSports.length > 0 ? activeSports : SPORTS} />
              <Select label="Position" value={form.position} onChange={(e) => update('position', e.target.value)} options={positions.map((p) => ({ value: p, label: p }))} />
              <div className="grid grid-cols-2 gap-4">
                <Input label="Jersey Number" placeholder="23" value={form.jersey_number} onChange={(e) => update('jersey_number', e.target.value)} hint="Optional" />
                <Select label="Year Level" value={form.year_level} onChange={(e) => update('year_level', e.target.value)} options={YEAR_LEVELS} />
              </div>
              <Input label="Department / Course" placeholder="BS Computer Science" value={form.department} onChange={(e) => update('department', e.target.value)} icon={<GraduationCap className="w-4 h-4" />} />
            </div>
          )}

          {/* Step 2: Documents */}
          {step === 2 && (
            <div className="space-y-6">
              <Alert type="info">
                Upload clear photos or scanned copies. Accepted formats: PDF, JPG, PNG. Max 5MB each.
              </Alert>

              <div>
                <label className="text-sm font-medium text-[var(--text-secondary)] block mb-2">
                  Certificate of Registration (COR)
                </label>
                <label className={`flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${corFile ? 'border-[#00FF88] bg-[#00FF88]/5' : 'border-[var(--border-subtle)] hover:border-white/20'}`}>
                  {corFile ? <Check className="w-8 h-8 text-[#00FF88]" /> : <Upload className="w-8 h-8 text-[var(--text-muted)]" />}
                  <div className="text-center">
                    <p className="text-sm font-medium">{corFile ? corFile.name : 'Click to upload COR'}</p>
                    <p className="text-xs text-[var(--text-muted)]">PDF, JPG, or PNG — Max 5MB</p>
                  </div>
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => setCorFile(e.target.files?.[0] ?? null)} />
                </label>
              </div>

              <div>
                <label className="text-sm font-medium text-[var(--text-secondary)] block mb-2">
                  Medical Certificate
                </label>
                <label className={`flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${medFile ? 'border-[#00FF88] bg-[#00FF88]/5' : 'border-[var(--border-subtle)] hover:border-white/20'}`}>
                  {medFile ? <Check className="w-8 h-8 text-[#00FF88]" /> : <Upload className="w-8 h-8 text-[var(--text-muted)]" />}
                  <div className="text-center">
                    <p className="text-sm font-medium">{medFile ? medFile.name : 'Click to upload Medical Certificate'}</p>
                    <p className="text-xs text-[var(--text-muted)]">PDF, JPG, or PNG — Max 5MB</p>
                  </div>
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => setMedFile(e.target.files?.[0] ?? null)} />
                </label>
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div className="space-y-4">
              <h3 className="font-semibold">Review Your Application</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-2 border-b border-[var(--border-subtle)]">
                  <span className="text-[var(--text-muted)]">Full Name</span>
                  <span>{form.full_name}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-[var(--border-subtle)]">
                  <span className="text-[var(--text-muted)]">Email</span>
                  <span>{form.email}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-[var(--border-subtle)]">
                  <span className="text-[var(--text-muted)]">Student ID</span>
                  <span>{form.student_id}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-[var(--border-subtle)]">
                  <span className="text-[var(--text-muted)]">Sport / Position</span>
                  <span>{getSportLabel(form.sport as any)} · {form.position}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-[var(--border-subtle)]">
                  <span className="text-[var(--text-muted)]">Year / Department</span>
                  <span>{form.year_level} · {form.department}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-[var(--text-muted)]">Documents</span>
                  <span className="text-[#00FF88]">COR ✓ Medical ✓</span>
                </div>
              </div>
              <Alert type="info">
                Your application will be reviewed by an organizer. You'll receive a notification once it's processed.
              </Alert>
            </div>
          )}

          {/* Nav buttons */}
          <div className="flex gap-3 mt-6">
            {step === 0 ? (
              <Link to="/auth/login" className="flex-1">
                <Button variant="secondary" className="w-full">Back to Login</Button>
              </Link>
            ) : (
              <Button variant="secondary" icon={<ChevronLeft className="w-4 h-4" />} onClick={() => setStep((s) => s - 1)}>
                Back
              </Button>
            )}
            <div className="flex-1" />
            {step < 3 ? (
              <Button icon={<ChevronRight className="w-4 h-4" />} onClick={() => setStep((s) => s + 1)}>
                Continue
              </Button>
            ) : (
              <Button loading={loading} onClick={handleRegister} size="lg">
                Submit Application
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
