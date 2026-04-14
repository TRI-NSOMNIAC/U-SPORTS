import { create } from 'zustand'
import type { Institution, SportConfig } from '../types'
import { supabase } from '../lib/supabase'
import { applyTheme } from '../lib/utils'

interface InstitutionState {
  institution: Institution | null
  sports: SportConfig[]
  loading: boolean
  fetchInstitution: () => Promise<void>
  setInstitution: (institution: Institution) => void
}

export const useInstitutionStore = create<InstitutionState>()((set) => ({
  institution: null,
  sports: [],
  loading: true,

  fetchInstitution: async () => {
    set({ loading: true })
    try {
      const { data: institution } = await supabase
        .from('institution')
        .select('*')
        .maybeSingle()

      const { data: sports } = await supabase
        .from('sports_config')
        .select('*')
        .eq('is_active', true)
        .order('display_name')

      if (institution) {
        applyTheme(institution.primary_color, institution.secondary_color)
        set({ institution, sports: sports ?? [] })
      }
    } catch (err) {
      console.error('Failed to fetch institution:', err)
    } finally {
      set({ loading: false })
    }
  },

  setInstitution: (institution) => {
    applyTheme(institution.primary_color, institution.secondary_color)
    set({ institution })
  },
}))
