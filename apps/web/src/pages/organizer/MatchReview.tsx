import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router'
import { CheckCircle, ArrowLeft, Save } from 'lucide-react'
import { Button, Card, Badge, Alert, Skeleton, Modal } from '../../components/ui'
import api from '../../lib/api'
import { formatEnumLabel } from '../../lib/utils'

interface PlayerStat {
  athlete_id: string
  sport: string
  stats: Record<string, number>
  athlete?: { id: string; profile?: { full_name: string } | null } | null
  /** Match participant UUID for team/side roster (solo matches use athlete id as participant). */
  team_id?: string | null
  team_name?: string | null
  participant_side?: 'a' | 'b' | null
}

const STAT_KEYS: Record<string, { key: string; label: string }[]> = {
  basketball: [
    { key: 'total_points', label: 'PTS' },
    { key: 'ft_made', label: 'FT' },
    { key: 'total_rebounds', label: 'REB' },
    { key: 'total_assists', label: 'AST' },
    { key: 'total_steals', label: 'STL' },
    { key: 'total_blocks', label: 'BLK' },
    { key: 'fouls', label: 'FOUL' },
  ],
  volleyball: [
    { key: 'pts_scored', label: 'PTS' },
    { key: 'kills', label: 'Kills' },
    { key: 'aces', label: 'Aces' },
    { key: 'digs', label: 'Digs' },
    { key: 'blocks', label: 'Blocks' },
    { key: 'assists', label: 'Assists' },
    { key: 'errors', label: 'Err' },
    { key: 'serve_errors', label: 'Srv Err' },
  ],
  'table-tennis': [
    { key: 'pts_scored', label: 'PTS' },
    { key: 'serves', label: 'Serve' },
    { key: 'attacks', label: 'Attack' },
    { key: 'errors', label: 'Err' },
  ],
}

export default function MatchReview() {
  const { matchId } = useParams<{ matchId: string }>()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [match, setMatch] = useState<any>(null)
  const [scores, setScores] = useState<any[]>([])
  const [playerStats, setPlayerStats] = useState<PlayerStat[]>([])
  const [nameA, setNameA] = useState('Home')
  const [nameB, setNameB] = useState('Away')
  const [editedStats, setEditedStats] = useState<Record<string, Record<string, number>>>({})
  const [saving, setSaving] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [error, setError] = useState('')
  const [finalized, setFinalized] = useState(false)
  const [finalizeConfirmOpen, setFinalizeConfirmOpen] = useState(false)

  const loadReview = useCallback(async () => {
    if (!matchId) return
    try {
      const { data } = await api.get(`/scoring/${matchId}/review`)
      setMatch(data.match)
      setScores(data.scores ?? [])
      setPlayerStats(data.playerStats ?? [])
      setNameA(data.participantNames?.a ?? 'Home')
      setNameB(data.participantNames?.b ?? 'Away')
      const mergedSport = (data.match as { event?: { sport?: string } } | null)?.event?.sport ?? 'basketball'
      const defs = STAT_KEYS[mergedSport] ?? STAT_KEYS.basketball
      const zeros = Object.fromEntries(defs.map((d) => [d.key, 0])) as Record<string, number>
      const initial: Record<string, Record<string, number>> = {}
      for (const ps of data.playerStats ?? []) {
        initial[ps.athlete_id] = { ...zeros, ...((ps.stats as Record<string, number> | undefined) ?? {}) }
      }
      setEditedStats(initial)
    } catch {
      setError('Failed to load match review data')
    } finally {
      setLoading(false)
    }
  }, [matchId])

  useEffect(() => { loadReview() }, [loadReview])

  const sport: string = match?.event?.sport ?? 'basketball'
  const statDefs = STAT_KEYS[sport] ?? STAT_KEYS.basketball

  const handleStatChange = (athleteId: string, key: string, value: number) => {
    setEditedStats(prev => ({
      ...prev,
      [athleteId]: { ...(prev[athleteId] ?? {}), [key]: Math.max(0, value) },
    }))
  }

  const handleSaveAll = async () => {
    setSaving(true)
    setError('')
    try {
      for (const [athleteId, stats] of Object.entries(editedStats)) {
        await api.patch(`/scoring/${matchId}/player-stats/${athleteId}`, { stats })
      }
      await loadReview()
    } catch {
      setError('Failed to save stats')
    } finally {
      setSaving(false)
    }
  }

  const handleFinalize = async () => {
    if (!match) return
    setFinalizing(true)
    setError('')
    try {
      await handleSaveAll()

      const winnerId = prompt_winnerId()
      if (!winnerId) {
        setFinalizing(false)
        return
      }

      await api.post(`/scoring/${matchId}/finalize`, { winnerId })
      setFinalized(true)
      setFinalizeConfirmOpen(false)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } }).response?.data?.error
      setError(msg ?? 'Finalize failed')
    } finally {
      setFinalizing(false)
    }
  }

  function prompt_winnerId(): string | null {
    const scoreA = scores.find(s => s.participant_id === match?.participant_a_id)
    const scoreB = scores.find(s => s.participant_id === match?.participant_b_id)
    const totalA = (scoreA?.total ?? 0) || ((scoreA?.q1 ?? 0) + (scoreA?.q2 ?? 0) + (scoreA?.q3 ?? 0) + (scoreA?.q4 ?? 0) + (scoreA?.ot ?? 0))
    const totalB = (scoreB?.total ?? 0) || ((scoreB?.q1 ?? 0) + (scoreB?.q2 ?? 0) + (scoreB?.q3 ?? 0) + (scoreB?.q4 ?? 0) + (scoreB?.ot ?? 0))
    if (totalA > totalB) return match.participant_a_id
    if (totalB > totalA) return match.participant_b_id
    return match.participant_a_id
  }

  if (loading) return <div className="space-y-4 max-w-4xl mx-auto">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
  if (!match) return <div className="text-center py-12 text-[var(--text-muted)]">Match not found</div>

  if (finalized) {
    return (
      <div className="max-w-xl mx-auto text-center py-20 space-y-6">
        <CheckCircle className="w-16 h-16 mx-auto text-[#00FF88]" />
        <h1 className="text-2xl font-bold">Match Finalized</h1>
        <p className="text-[var(--text-muted)]">
          Player season stats were saved when the match ended; totals update again after any edits here. Leaderboards reflect finalized numbers.
        </p>
        <div className="flex justify-center gap-3">
          <Button onClick={() => navigate('/organizer/events')}>Back to Events</Button>
          <Button variant="secondary" onClick={() => navigate('/organizer/analytics')}>View Analytics</Button>
        </div>
      </div>
    )
  }

  const scoreA = scores.find(s => s.participant_id === match.participant_a_id)
  const scoreB = scores.find(s => s.participant_id === match.participant_b_id)

  const bbTotal = (s: any) => (s?.q1 ?? 0) + (s?.q2 ?? 0) + (s?.q3 ?? 0) + (s?.q4 ?? 0) + (s?.ot ?? 0)
  const vbSetsWon = (s: any) => s?.sets_won ?? 0
  const ttGamesWon = (s: any) => s?.games_won ?? 0

  const finalScoreLabel = sport === 'basketball'
    ? `${bbTotal(scoreA)} – ${bbTotal(scoreB)}`
    : sport === 'volleyball'
      ? `Sets: ${vbSetsWon(scoreA)} – ${vbSetsWon(scoreB)}`
      : `Games: ${ttGamesWon(scoreA)} – ${ttGamesWon(scoreB)}`

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate(-1)} className="text-[var(--text-muted)] hover:text-white p-1 rounded">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-xl font-bold">Post-Game Review</h1>
          <p className="text-[var(--text-muted)] text-xs">{nameA} vs {nameB}</p>
        </div>
        <div className="flex-1" />
        <Badge variant="success">Completed</Badge>
      </div>

      {error && <Alert type="danger" onDismiss={() => setError('')}>{error}</Alert>}

      <Card>
        <h3 className="font-semibold mb-1">Final Score</h3>
        <p className="text-3xl font-black text-center py-4">{nameA} {finalScoreLabel} {nameB}</p>
        <p className="text-center text-xs text-[var(--text-muted)]">{formatEnumLabel(sport)}</p>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Player Stats</h3>
          <Button size="sm" variant="secondary" icon={<Save className="w-3 h-3" />} loading={saving} onClick={() => void handleSaveAll()}>
            Save changes
          </Button>
        </div>

        {playerStats.length === 0 ? (
          <p className="text-center py-8 text-[var(--text-muted)]">
            No roster athletes are linked to these match participants. Confirm team rosters and that players are on the official roster for this
            event.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--text-muted)] text-xs border-b border-[var(--border-subtle)]">
                  <th className="text-left py-2 pr-3 w-36 min-w-36 max-w-36 shrink-0 sticky left-0 z-[2] bg-[var(--surface-card)] shadow-[1px_0_0_var(--border-subtle)]">
                    Team
                  </th>
                  <th className="text-left py-2 pr-3 min-w-[8rem] sticky left-36 z-[2] bg-[var(--surface-card)] shadow-[1px_0_0_var(--border-subtle)]">
                    Player
                  </th>
                  {statDefs.map(s => (
                    <th key={s.key} className="text-center py-2 px-2 min-w-[3.5rem]">{s.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {playerStats.map(ps => {
                  const teamLabel =
                    ps.team_name?.trim()
                    ?? (ps.participant_side === 'a' ? nameA : ps.participant_side === 'b' ? nameB : 'Team')
                  return (
                  <tr key={ps.athlete_id} className="border-t border-[var(--border-subtle)]">
                    <td className="py-2 pr-3 w-36 min-w-36 max-w-36 shrink-0 align-top text-[var(--text-secondary)] sticky left-0 z-[1] bg-[var(--surface-card)] shadow-[1px_0_0_var(--border-subtle)]">
                      <span className="line-clamp-2 break-words text-xs sm:text-sm" title={teamLabel}>
                        {teamLabel}
                      </span>
                    </td>
                    <td className="py-2 pr-3 font-medium min-w-[8rem] sticky left-36 z-[1] bg-[var(--surface-card)] shadow-[1px_0_0_var(--border-subtle)]">
                      {ps.athlete?.profile?.full_name ?? `Athlete ${ps.athlete_id.slice(0, 6)}`}
                    </td>
                    {statDefs.map(s => (
                      <td key={s.key} className="py-2 px-1 text-center">
                        <input
                          type="number"
                          min={0}
                          value={editedStats[ps.athlete_id]?.[s.key] ?? 0}
                          onChange={e => handleStatChange(ps.athlete_id, s.key, parseInt(e.target.value) || 0)}
                          className="w-14 text-center bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded px-1 py-1 text-sm text-white"
                        />
                      </td>
                    ))}
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="flex items-center justify-between">
        <div>
          <p className="font-semibold">Ready to finalize?</p>
          <p className="text-xs text-[var(--text-muted)]">This will update season leaderboards, team standings, and generate insights.</p>
        </div>
        <Button loading={finalizing} onClick={() => setFinalizeConfirmOpen(true)} icon={<CheckCircle className="w-4 h-4" />}>
          Finalize Match
        </Button>
      </Card>

      <Modal open={finalizeConfirmOpen} onClose={() => !finalizing && setFinalizeConfirmOpen(false)} title="Finalize match" size="md">
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            Finalizing publishes these stats to season leaderboards, standings, and insights. Double-check scores above — fixing mistakes
            afterward requires another review pass.
          </p>
          <div className="flex gap-3 justify-end flex-wrap">
            <Button variant="secondary" disabled={finalizing} onClick={() => setFinalizeConfirmOpen(false)}>
              Cancel
            </Button>
            <Button loading={finalizing} onClick={() => void handleFinalize()} icon={<CheckCircle className="w-4 h-4" />}>
              Yes, finalize
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
