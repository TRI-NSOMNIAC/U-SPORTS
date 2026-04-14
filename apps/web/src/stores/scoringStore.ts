import { create } from 'zustand'
import type { Match, MatchScore, ScoringAction } from '../types'

interface ScoringState {
  activeMatch: Match | null
  scores: Record<string, MatchScore>
  actions: ScoringAction[]
  isLocked: boolean
  lockedByName: string | null
  setActiveMatch: (match: Match | null) => void
  setScores: (scores: Record<string, MatchScore>) => void
  addAction: (action: ScoringAction) => void
  undoLastAction: () => void
  setLock: (isLocked: boolean, lockedByName?: string | null) => void
  reset: () => void
}

export const useScoringStore = create<ScoringState>()((set, get) => ({
  activeMatch: null,
  scores: {},
  actions: [],
  isLocked: false,
  lockedByName: null,

  setActiveMatch: (match) => set({ activeMatch: match }),

  setScores: (scores) => set({ scores }),

  addAction: (action) =>
    set((state) => ({ actions: [...state.actions, action] })),

  undoLastAction: () =>
    set((state) => {
      const lastActive = [...state.actions].reverse().find((a) => !a.undone)
      if (!lastActive) return state
      return {
        actions: state.actions.map((a) =>
          a.id === lastActive.id ? { ...a, undone: true } : a
        ),
      }
    }),

  setLock: (isLocked, lockedByName = null) => set({ isLocked, lockedByName }),

  reset: () =>
    set({ activeMatch: null, scores: {}, actions: [], isLocked: false, lockedByName: null }),
}))
