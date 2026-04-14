import React, { useEffect, useState } from 'react'
import { Save, Palette } from 'lucide-react'
import { Button, Input, Card, Alert } from '../../components/ui'
import { useInstitutionStore } from '../../stores/institutionStore'
import api from '../../lib/api'
import { applyTheme } from '../../lib/utils'

export default function SuperAdminSettings() {
  const { institution, fetchInstitution } = useInstitutionStore()
  const [form, setForm] = useState({
    name: '', abbreviation: '', tagline: '',
    primary_color: '#002D62', secondary_color: '#FFD700',
    address: '', region: '', staff_email_domain: '', student_email_domain: '',
  })
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (institution) {
      setForm({
        name: institution.name, abbreviation: institution.abbreviation,
        tagline: institution.tagline, primary_color: institution.primary_color,
        secondary_color: institution.secondary_color, address: institution.address,
        region: institution.region, staff_email_domain: institution.staff_email_domain,
        student_email_domain: institution.student_email_domain,
      })
    }
  }, [institution])

  const handleSave = async () => {
    setSaving(true); setError(''); setSuccess(false)
    try {
      await api.patch('/admin/institution', form)
      applyTheme(form.primary_color, form.secondary_color)
      await fetchInstitution()
      setSuccess(true)
    } catch (e: any) { setError(e.response?.data?.error ?? 'Save failed') }
    finally { setSaving(false) }
  }

  const update = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }))

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">School Profile</h1>
        <p className="text-[var(--text-muted)] text-sm">Changes reflect immediately across the platform</p>
      </div>

      {success && <Alert type="success" onDismiss={() => setSuccess(false)}>School profile updated successfully!</Alert>}
      {error && <Alert type="danger" onDismiss={() => setError('')}>{error}</Alert>}

      <Card>
        <h2 className="font-bold flex items-center gap-2 mb-4"><Palette className="w-4 h-4" /> Identity & Branding</h2>
        <div className="space-y-4">
          <Input label="Institution Name" value={form.name} onChange={e => update('name', e.target.value)} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Abbreviation" value={form.abbreviation} onChange={e => update('abbreviation', e.target.value)} />
            <Input label="Tagline" value={form.tagline} onChange={e => update('tagline', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-[var(--text-secondary)] block mb-1.5">Primary Color</label>
              <div className="flex gap-2 items-center">
                <input type="color" value={form.primary_color} onChange={e => { update('primary_color', e.target.value); applyTheme(e.target.value, form.secondary_color) }} className="w-10 h-10 rounded cursor-pointer" />
                <Input value={form.primary_color} onChange={e => update('primary_color', e.target.value)} className="font-mono" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-[var(--text-secondary)] block mb-1.5">Secondary Color</label>
              <div className="flex gap-2 items-center">
                <input type="color" value={form.secondary_color} onChange={e => { update('secondary_color', e.target.value); applyTheme(form.primary_color, e.target.value) }} className="w-10 h-10 rounded cursor-pointer" />
                <Input value={form.secondary_color} onChange={e => update('secondary_color', e.target.value)} className="font-mono" />
              </div>
            </div>
          </div>
          <Input label="Address" value={form.address} onChange={e => update('address', e.target.value)} />
          <Input label="Region" value={form.region} onChange={e => update('region', e.target.value)} />
        </div>
      </Card>

      <Card>
        <h2 className="font-bold mb-4">Email Domain Configuration</h2>
        <div className="space-y-4">
          <Input label="Staff Domain" value={form.staff_email_domain} onChange={e => update('staff_email_domain', e.target.value)} hint="Used by organizers and admins" />
          <Input label="Student Domain" value={form.student_email_domain} onChange={e => update('student_email_domain', e.target.value)} hint="Used by athlete accounts" />
        </div>
      </Card>

      <Button icon={<Save className="w-4 h-4" />} loading={saving} onClick={handleSave} size="lg">
        Save Changes
      </Button>
    </div>
  )
}
