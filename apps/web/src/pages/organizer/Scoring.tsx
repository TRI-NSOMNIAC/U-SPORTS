import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router'
import { Play, Square, RotateCcw, Tv2, Lock, Unlock, AlertTriangle, ArrowLeft } from 'lucide-react'
import { Button, Card, Badge, Alert, Modal, Select } from '../../components/ui'
import api from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { formatDateTime } from '../../lib/utils'
import type { Match } from '../../types'

interface ScoreState {
  q1: number; q2: number; q3: number; q4: number; ot: number
  set1: number; set2: number; set3: number; set4: number; set5: number
  sets_won: number; games_won: number
  game1: number; game2: number; game3: number
  total: number
}

const emptyScore = (): ScoreState => ({ q1:0, q2:0, q3:0, q4:0, ot:0, set1:0, set2:0, set3:0, set4:0, set5:0, sets_won:0, games_won:0, game1:0, game2:0, game3:0, total:0 })

export default function OrganizerScoring() {
  const { matchId } = useParams<{ matchId: string }>()
  const navigate = useNavigate()
  const { profile } = useAuthStore()
  const [match, setMatch] = useState<Match | null>(null)
  const [scoreA, setScoreA] = useState<ScoreState>(emptyScore())
  const [scoreB, setScoreB] = useState<ScoreState>(emptyScore())
  const [sport, setSport] = useState('basketball')
  const [currentPeriod, setCurrentPeriod] = useState(1)
  const [isLive, setIsLive] = useState(false)
  const [lockWarning, setLockWarning] = useState<{ name: string } | null>(null)
  const [starting, setStarting] = useState(false)
  const [ending, setEnding] = useState(false)
  const [endConfirm, setEndConfirm] = useState(false)
  const [winnerId, setWinnerId] = useState('')
  const [error, setError] = useState('')
  const [recentActions, setRecentActions] = useState<any[]>([])

  const loadState = useCallback(async () => {
    if (!matchId) return
    const { data } = await api.get(`/scoring/${matchId}/state`)
    if (!data) return
    setMatch(data.match)
    setIsLive(data.match?.status === 'live')
    setRecentActions(data.recentActions ?? [])

    const [sA, sB] = data.scores ?? []
    if (sA) setScoreA(sA)
    if (sB) setScoreB(sB)

    // Get sport from event
    if (data.match?.event_id) {
      const { data: event } = await supabase.from('events').select('sport').eq('id', data.match.event_id).single()
      if (event) setSport(event.sport)
    }
  }, [matchId])

  useEffect(() => {
    loadState()
    // Subscribe to score updates
    const channel = supabase
      .channel(`scoring-${matchId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'match_scores', filter: `match_id=eq.${matchId}` }, () => loadState())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` }, () => loadState())
      .subscribe()
    return () => { channel.unsubscribe() }
  }, [matchId, loadState])

  const handleStart = async () => {
    setStarting(true); setError('')
    try {
      await api.post(`/scoring/${matchId}/start`)
      await loadState()
    } catch (e: any) {
      if (e.response?.data?.error === 'SCORING_LOCKED') {
        setLockWarning({ name: e.response.data.lockedBy })
      } else {
        setError(e.response?.data?.error ?? 'Failed to start match')
      }
    } finally { setStarting(false) }
  }

  const handleAction = async (participantId: string, actionType: string, value: number = 1) => {
    try {
      await api.post(`/scoring/${matchId}/action`, { participantId, actionType, value, quarterOrSet: currentPeriod, sport })
      await loadState()
    } catch (e: any) { setError(e.response?.data?.error ?? 'Action failed') }
  }

  const handleUndo = async () => {
    try { await api.post(`/scoring/${matchId}/undo`); await loadState() }
    catch (e: any) { setError('Undo failed') }
  }

  const handleEnd = async () => {
    if (!winnerId) return
    setEnding(true)
    try {
      await api.post(`/scoring/${matchId}/end`, { winnerId })
      navigate('/organizer/events')
    } catch (e: any) { setError(e.response?.data?.error ?? 'Failed to end match') }
    finally { setEnding(false) }
  }

  const getTotal = (score: ScoreState) => {
    if (sport === 'basketball') return score.q1 + score.q2 + score.q3 + score.q4 + score.ot
    if (sport === 'volleyball') return score.sets_won
    if (sport === 'table-tennis') return score.games_won
    return 0
  }

  const participantAId = match?.participant_a_id ?? ''
  const participantBId = match?.participant_b_id ?? ''

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-[var(--text-muted)] hover:text-white"><ArrowLeft className="w-5 h-5" /></button>
        <div>
          <h1 className="text-xl font-bold">Live Scoring</h1>
          <p className="text-[var(--text-muted)] text-xs">Match {matchId?.slice(0, 8)}...</p>
        </div>
        <div className="flex-1" />
        {isLive && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#FF3355] animate-pulse-live" />
            <Badge variant="danger">LIVE</Badge>
          </div>
        )}
        <Button size="sm" variant="secondary" icon={<Tv2 className="w-3.5 h-3.5" />} onClick={() => window.open(`/jumbotron/${matchId}`, '_blank')}>
          Jumbotron
        </Button>
      </div>

      {error && <Alert type="danger" onDismiss={() => setError('')}>{error}</Alert>}

      {lockWarning && (
        <Alert type="warning">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span>{lockWarning.name} is currently scoring this match. Forcefully taking over?</span>
          </div>
          <div className="flex gap-2 mt-2">
            <Button size="sm" onClick={async () => { await api.post(`/scoring/${matchId}/transfer-lock`); setLockWarning(null); loadState() }}>Take Over</Button>
            <Button size="sm" variant="secondary" onClick={() => setLockWarning(null)}>Cancel</Button>
          </div>
        </Alert>
      )}

      {/* Scoreboard */}
      <div className="grid grid-cols-2 gap-4">
        {/* Team A */}
        <Card className="text-center" elevated>
          <p className="text-xs text-[var(--text-muted)] mb-1">HOME</p>
          <p className="text-sm font-medium mb-2 truncate">{participantAId.slice(0, 12)}...</p>
          <p className="text-6xl font-black font-[Barlow_Condensed] text-white mb-4">{getTotal(scoreA)}</p>

          {sport === 'basketball' && (
            <div className="grid grid-cols-4 gap-1 text-xs text-[var(--text-muted)] mb-4">
              {['Q1', 'Q2', 'Q3', 'Q4'].map((q, i) => (
                <div key={q}><p className="font-bold">{q}</p><p>{[scoreA.q1, scoreA.q2, scoreA.q3, scoreA.q4][i]}</p></div>
              ))}
            </div>
          )}

          {isLive && (
            <div className="space-y-2">
              <div className="flex justify-center gap-2">
                <Button size="sm" onClick={() => handleAction(participantAId, 'point_1', 1)}>+1</Button>
                <Button size="sm" onClick={() => handleAction(participantAId, 'point_2', 2)}>+2</Button>
                {sport === 'basketball' && <Button size="sm" onClick={() => handleAction(participantAId, 'point_3', 3)}>+3</Button>}
              </div>
              {sport === 'basketball' && (
                <div className="flex justify-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => handleAction(participantAId, 'rebound', 1)}>REB</Button>
                  <Button size="sm" variant="secondary" onClick={() => handleAction(participantAId, 'assist', 1)}>AST</Button>
                  <Button size="sm" variant="secondary" onClick={() => handleAction(participantAId, 'steal', 1)}>STL</Button>
                </div>
              )}
              {sport === 'volleyball' && (
                <div className="flex justify-center gap-2">
                  <Button size="sm" onClick={() => handleAction(participantAId, 'kill', 1)}>Kill</Button>
                  <Button size="sm" variant="secondary" onClick={() => handleAction(participantAId, 'ace', 1)}>Ace</Button>
                  <Button size="sm" variant="secondary" onClick={() => handleAction(participantAId, 'block', 1)}>Block</Button>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Team B */}
        <Card className="text-center" elevated>
          <p className="text-xs text-[var(--text-muted)] mb-1">AWAY</p>
          <p className="text-sm font-medium mb-2 truncate">{participantBId.slice(0, 12)}...</p>
          <p className="text-6xl font-black font-[Barlow_Condensed] text-white mb-4">{getTotal(scoreB)}</p>

          {sport === 'basketball' && (
            <div className="grid grid-cols-4 gap-1 text-xs text-[var(--text-muted)] mb-4">
              {['Q1', 'Q2', 'Q3', 'Q4'].map((q, i) => (
                <div key={q}><p className="font-bold">{q}</p><p>{[scoreB.q1, scoreB.q2, scoreB.q3, scoreB.q4][i]}</p></div>
              ))}
            </div>
          )}

          {isLive && (
            <div className="space-y-2">
              <div className="flex justify-center gap-2">
                <Button size="sm" onClick={() => handleAction(participantBId, 'point_1', 1)}>+1</Button>
                <Button size="sm" onClick={() => handleAction(participantBId, 'point_2', 2)}>+2</Button>
                {sport === 'basketball' && <Button size="sm" onClick={() => handleAction(participantBId, 'point_3', 3)}>+3</Button>}
              </div>
              {sport === 'basketball' && (
                <div className="flex justify-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => handleAction(participantBId, 'rebound', 1)}>REB</Button>
                  <Button size="sm" variant="secondary" onClick={() => handleAction(participantBId, 'assist', 1)}>AST</Button>
                  <Button size="sm" variant="secondary" onClick={() => handleAction(participantBId, 'steal', 1)}>STL</Button>
                </div>
              )}
              {sport === 'volleyball' && (
                <div className="flex justify-center gap-2">
                  <Button size="sm" onClick={() => handleAction(participantBId, 'kill', 1)}>Kill</Button>
                  <Button size="sm" variant="secondary" onClick={() => handleAction(participantBId, 'ace', 1)}>Ace</Button>
                  <Button size="sm" variant="secondary" onClick={() => handleAction(participantBId, 'block', 1)}>Block</Button>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Period selector */}
      {isLive && sport === 'basketball' && (
        <Card className="flex items-center gap-3">
          <span className="text-sm font-medium">Period:</span>
          <div className="flex gap-2">
            {['Q1', 'Q2', 'Q3', 'Q4', 'OT'].map((p, i) => (
              <button key={p} onClick={() => setCurrentPeriod(i + 1)} className={`px-3 py-1 rounded text-sm font-medium transition-colors ${currentPeriod === i + 1 ? 'bg-[#0066FF] text-white' : 'bg-[var(--surface-elevated)] text-[var(--text-muted)] hover:text-white'}`}>{p}</button>
            ))}
          </div>
        </Card>
      )}

      {/* Controls */}
      <Card className="flex items-center justify-between">
        <div className="flex gap-2">
          {!isLive ? (
            <Button icon={<Play className="w-4 h-4" />} loading={starting} onClick={handleStart}>
              Start Match
            </Button>
          ) : (
            <>
              <Button variant="secondary" icon={<RotateCcw className="w-4 h-4" />} onClick={handleUndo} size="sm">
                Undo
              </Button>
              <Button variant="danger" icon={<Square className="w-4 h-4" />} onClick={() => setEndConfirm(true)} size="sm">
                End Match
              </Button>
            </>
          )}
        </div>
        {recentActions.length > 0 && (
          <div className="text-xs text-[var(--text-muted)]">
            Last: {recentActions[0]?.action_type} ({recentActions[0]?.value > 0 ? '+' : ''}{recentActions[0]?.value})
          </div>
        )}
      </Card>

      {/* End match confirmation */}
      <Modal open={endConfirm} onClose={() => setEndConfirm(false)} title="End Match">
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-muted)]">Select the winner to officially end this match.</p>
          <Select
            label="Winner"
            value={winnerId}
            onChange={e => setWinnerId(e.target.value)}
            options={[
              { value: '', label: 'Select winner...' },
              { value: participantAId, label: 'Home Team' },
              { value: participantBId, label: 'Away Team' },
            ]}
          />
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setEndConfirm(false)}>Cancel</Button>
            <Button variant="danger" loading={ending} onClick={handleEnd} disabled={!winnerId}>Confirm End Match</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
