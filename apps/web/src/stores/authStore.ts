import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Session, User } from '@supabase/supabase-js'
import type { Profile, Athlete, Organizer } from '../types'
import { supabase } from '../lib/supabase'

interface AuthState {
  session: Session | null
  user: User | null
  profile: Profile | null
  athlete: Athlete | null
  organizer: Organizer | null
  loading: boolean
  /** Clears persisted profile rows when session user changes or signs out */
  clearStaleRoleData: () => void
  setSession: (session: Session | null) => void
  setProfile: (profile: Profile | null) => void
  setAthlete: (athlete: Athlete | null) => void
  setOrganizer: (organizer: Organizer | null) => void
  setLoading: (loading: boolean) => void
  signOut: () => Promise<void>
  fetchProfile: (userId: string) => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      session: null,
      user: null,
      profile: null,
      athlete: null,
      organizer: null,
      loading: true,

      setSession: (session) => set({ session, user: session?.user ?? null }),
      setProfile: (profile) => set({ profile }),
      setAthlete: (athlete) => set({ athlete }),
      setOrganizer: (organizer) => set({ organizer }),
      setLoading: (loading) => set({ loading }),

      clearStaleRoleData: () => set({ profile: null, athlete: null, organizer: null }),

      fetchProfile: async (userId: string) => {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single()

          if (!profile) return
          set({ profile })

          if (profile.role === 'athlete') {
            const { data: athlete } = await supabase
              .from('athletes')
              .select('*')
              .eq('profile_id', userId)
              .single()
            set({ athlete: athlete ?? null })
          } else {
            set({ athlete: null })
          }

          if (profile.role === 'organizer') {
            const { data: organizer } = await supabase
              .from('organizers')
              .select('*')
              .eq('profile_id', userId)
              .single()
            set({ organizer: organizer ?? null })
          } else {
            set({ organizer: null })
          }
        } catch (err) {
          console.error('Failed to fetch profile:', err)
        }
      },

      signOut: async () => {
        await supabase.auth.signOut()
        set({ session: null, user: null, profile: null, athlete: null, organizer: null })
      },
    }),
    {
      name: 'u-sports-auth',
      partialize: (state) => ({
        profile: state.profile,
        athlete: state.athlete,
        organizer: state.organizer,
      }),
    }
  )
)
