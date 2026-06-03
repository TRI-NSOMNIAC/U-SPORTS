import React from 'react'
import AppearanceSection from '../../components/settings/AppearanceSection'
import SettingsSignOutSection from '../../components/settings/SettingsSignOutSection'

export default function StudentSettings() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-[var(--text-muted)] text-sm">Appearance for your student hub account. Use My Profile in the sidebar for your details and documents.</p>
      </div>

      <AppearanceSection />

      <SettingsSignOutSection />
    </div>
  )
}
