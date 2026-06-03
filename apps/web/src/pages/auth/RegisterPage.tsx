import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router'
import { User, Mail, Lock, Hash, GraduationCap, ChevronRight, ChevronLeft, Upload, Check } from 'lucide-react'
import { Button, Input, Select, Alert, Card } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { useInstitutionStore } from '../../stores/institutionStore'
import { useAuthStore } from '../../stores/authStore'
import { registerAccountSchema, registerStudentProfileSchema } from '../../lib/validation/forms'

const STEPS = ['Account Info', 'Student Info', 'COR', 'Review']

const YEAR_LEVELS = [
  { value: 'Grade 11', label: 'Grade 11' },
  { value: 'Grade 12', label: 'Grade 12' },
  { value: '1st Year', label: '1st Year' },
  { value: '2nd Year', label: '2nd Year' },
  { value: '3rd Year', label: '3rd Year' },
  { value: '4th Year', label: '4th Year' },
]

export default function RegisterPage() {
  const { institution } = useInstitutionStore()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [corFile, setCorFile] = useState<File | null>(null)

  const [form, setForm] = useState({
    email: '',
    password: '',
    full_name: '',
    student_id: '',
    year_level: '1st Year',
    department: '',
  })

  const maxDocBytes = 5 * 1024 * 1024

  const update = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }))

  const goNext = () => {
    setError('')
    const studentDomain = institution?.student_email_domain ?? 'students.nu-dasma.edu.ph'
    if (step === 0) {
      const acc = registerAccountSchema(studentDomain).safeParse({
        full_name: form.full_name,
        email: form.email,
        password: form.password,
      })
      if (!acc.success) {
        setError(acc.error.issues[0]?.message ?? 'Check account fields')
        return
      }
    } else if (step === 1) {
      const prof = registerStudentProfileSchema.safeParse({
        student_id: form.student_id,
        year_level: form.year_level,
        department: form.department,
      })
      if (!prof.success) {
        setError(prof.error.issues[0]?.message ?? 'Check profile fields')
        return
      }
    } else if (step === 2) {
      if (!corFile) {
        setError('Upload your Certificate of Registration (COR) to continue')
        return
      }
      if (corFile.size > maxDocBytes) {
        setError('Document must be 5MB or smaller')
        return
      }
    }
    setStep((s) => s + 1)
  }

  const handleRegister = async () => {
    if (!corFile) {
      setError('Please upload your COR')
      return
    }
    if (corFile.size > maxDocBytes) {
      setError('Document must be 5MB or smaller')
      return
    }

    setLoading(true)
    setError('')

    try {
      const studentDomain = institution?.student_email_domain ?? 'students.nu-dasma.edu.ph'
      const acc = registerAccountSchema(studentDomain).safeParse({
        full_name: form.full_name,
        email: form.email,
        password: form.password,
      })
      if (!acc.success) {
        throw new Error(acc.error.issues[0]?.message ?? 'Check account fields')
      }
      const prof = registerStudentProfileSchema.safeParse({
        student_id: form.student_id,
        year_level: form.year_level,
        department: form.department,
      })
      if (!prof.success) {
        throw new Error(prof.error.issues[0]?.message ?? 'Check profile fields')
      }

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: acc.data.email,
        password: acc.data.password,
        options: {
          data: { full_name: acc.data.full_name, role: 'student' },
        },
      })

      if (authError) throw new Error(authError.message)
      if (!authData.user) throw new Error('Registration failed')

      if (!authData.session) {
        throw new Error(
          'No active session after sign up. Turn off "Confirm email" in Supabase Auth (hosted: Authentication → Providers → Email), or confirm your email from the inbox, sign in, and upload your COR from Profile.'
        )
      }

      await supabase.auth.setSession({
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
      })

      const userId = authData.user.id

      const { data: updatedProfile, error: profileError } = await supabase
        .from('profiles')
        .update({
          student_id: prof.data.student_id,
          year_level: prof.data.year_level,
          department: prof.data.department,
        })
        .eq('id', userId)
        .select('id')
        .single()

      if (profileError) throw new Error(profileError.message)
      if (!updatedProfile) {
        throw new Error('Could not update your profile. Try signing in and complete registration from Profile.')
      }

      const ext = corFile.name.split('.').pop()
      const path = `${userId}/cor.${ext}`
      const { error: uploadError } = await supabase.storage.from('verification-documents').upload(path, corFile, { upsert: true })
      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`)
      const { data: urlData } = supabase.storage.from('verification-documents').getPublicUrl(path)

      const { data: existingCor } = await supabase
        .from('student_documents')
        .select('id')
        .eq('profile_id', userId)
        .eq('document_type', 'cor')
        .maybeSingle()
      if (existingCor?.id) {
        const { error: docUp } = await supabase
          .from('student_documents')
          .update({ file_url: urlData.publicUrl })
          .eq('id', existingCor.id)
        if (docUp) throw new Error(docUp.message)
      } else {
        const { error: docError } = await supabase.from('student_documents').insert({
          profile_id: userId,
          document_type: 'cor',
          file_url: urlData.publicUrl,
        })
        if (docError) throw new Error(docError.message)
      }

      await useAuthStore.getState().fetchProfile(userId)
      navigate('/guest?registered=1')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          {institution?.logo_url ? (
            <img
              src={institution.logo_url}
              alt=""
              className="w-16 h-16 mx-auto mb-3 rounded-full object-cover border border-[var(--border-subtle)]"
            />
          ) : null}
          <h1 className="text-2xl font-bold">Student sign up</h1>
          <p className="text-[var(--text-muted)] text-sm mt-1">{institution?.name}</p>
          <p className="text-[var(--text-muted)] text-xs mt-2 max-w-md mx-auto">
            Upload your COR for enrollment verification. Medical documents are only required after you make a team.
          </p>
        </div>

        <div className="flex gap-2 mb-6">
          {STEPS.map((s, i) => (
            <div key={s} className={`flex-1 h-1 rounded-full transition-all ${i <= step ? 'bg-[#0066FF]' : 'bg-[var(--border-subtle)]'}`} />
          ))}
        </div>
        <p className="text-center text-xs text-[var(--text-muted)] mb-4">
          Step {step + 1} of {STEPS.length}: {STEPS[step]}
        </p>

        <Card className="p-6">
          {error && <Alert type="danger" className="mb-4">{error}</Alert>}

          {step === 0 && (
            <div className="space-y-4">
              <Input label="Full Name" placeholder="Juan dela Cruz" value={form.full_name} onChange={(e) => update('full_name', e.target.value)} icon={<User className="w-4 h-4" />} />
              <Input label="School Email" type="email" placeholder={`you@${institution?.student_email_domain ?? 'school.edu'}`} value={form.email} onChange={(e) => update('email', e.target.value)} icon={<Mail className="w-4 h-4" />} />
              <Input label="Password" type="password" placeholder="Min. 8 characters" value={form.password} onChange={(e) => update('password', e.target.value)} icon={<Lock className="w-4 h-4" />} />
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <Input label="Student ID" placeholder="2021-00000" value={form.student_id} onChange={(e) => update('student_id', e.target.value)} icon={<Hash className="w-4 h-4" />} />
              <Select label="Year Level" value={form.year_level} onChange={(e) => update('year_level', e.target.value)} options={YEAR_LEVELS} />
              <Input label="Department / Course" placeholder="BS Computer Science" value={form.department} onChange={(e) => update('department', e.target.value)} icon={<GraduationCap className="w-4 h-4" />} />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <Alert type="info">
                Certificate of Registration (COR) only. Accepted: PDF, JPG, PNG. Max 5MB.
              </Alert>
              <div>
                <label className="text-sm font-medium text-[var(--text-secondary)] block mb-2">
                  Certificate of Registration (COR)
                </label>
                <label className={`flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${corFile ? 'border-[#00FF88] bg-[#00FF88]/5' : 'border-[var(--border-subtle)] hover:border-[var(--accent-default)]/40'}`}>
                  {corFile ? <Check className="w-8 h-8 text-[#00FF88]" /> : <Upload className="w-8 h-8 text-[var(--text-muted)]" />}
                  <div className="text-center">
                    <p className="text-sm font-medium">{corFile ? corFile.name : 'Click to upload COR'}</p>
                    <p className="text-xs text-[var(--text-muted)]">PDF, JPG, or PNG — Max 5MB</p>
                  </div>
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => setCorFile(e.target.files?.[0] ?? null)} />
                </label>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h3 className="font-semibold">Review</h3>
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
                  <span className="text-[var(--text-muted)]">Year / Department</span>
                  <span>{form.year_level} · {form.department}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-[var(--text-muted)]">COR</span>
                  <span className="text-[#00FF88]">{corFile ? 'Uploaded ✓' : 'Missing'}</span>
                </div>
              </div>
              <Alert type="info">
                An organizer will verify your COR. You can browse the site until then.
              </Alert>
            </div>
          )}

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
              <Button icon={<ChevronRight className="w-4 h-4" />} onClick={goNext}>
                Continue
              </Button>
            ) : (
              <Button loading={loading} onClick={handleRegister} size="lg">
                Submit
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
