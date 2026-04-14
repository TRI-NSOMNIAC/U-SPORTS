import React, { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router'
import { supabase } from '../../lib/supabase'
import { useInstitutionStore } from '../../stores/institutionStore'

interface ScoreState {
  q1: number; q2: number; q3: number; q4: number; ot: number
  set1: number; set2: number; set3: number; set4: number; set5: number
  sets_won: number; game1: number; game2: number; game3: number; games_won: number
}

const emptyScore = (): ScoreState => ({
  q1: 0, q2: 0, q3: 0, q4: 0, ot: 0,
  set1: 0, set2: 0, set3: 0, set4: 0, set5: 0, sets_won: 0,
  game1: 0, game2: 0, game3: 0, games_won: 0,
})

export default function JumbotronPage() {
  const { matchId } = useParams<{ matchId: string }>()
  const { institution } = useInstitutionStore()
  const [match, setMatch] = useState<any>(null)
  const [scoreA, setScoreA] = useState<ScoreState>(emptyScore())
  const [scoreB, setScoreB] = useState<ScoreState>(emptyScore())
  const [sport, setSport] = useState('basketball')
  const [teamAName, setTeamAName] = useState('HOME')
  const [teamBName, setTeamBName] = useState('AWAY')
  const [lastScored, setLastScored] = useState<'A' | 'B' | null>(null)
  const [flash, setFlash] = useState<'A' | 'B' | null>(null)

  const triggerFlash = useCallback((side: 'A' | 'B') => {
    setFlash(side)
    setTimeout(() => setFlash(null), 600)
  }, [])

  const loadMatch = useCallback(async () => {
    if (!matchId) return
    const { data: match } = await supabase.from('matches').select('*').eq('id', matchId).single()
    if (!match) return
    setMatch(match)

    const { data: scores } = await supabase.from('match_scores').select('*').eq('match_id', matchId)
    if (scores) {
      const [sA, sB] = scores
      if (sA) setScoreA(sA)
      if (sB) setScoreB(sB)
    }

    if (match.event_id) {
      const { data: event } = await supabase.from('events').select('sport').eq('id', match.event_id).single()
      if (event) setSport(event.sport)
    }

    if (match.participant_a_id) {
      const { data: team } = await supabase.from('teams').select('name').eq('id', match.participant_a_id).single()
      if (team) setTeamAName(team.name)
    }
    if (match.participant_b_id) {
      const { data: team } = await supabase.from('teams').select('name').eq('id', match.participant_b_id).single()
      if (team) setTeamBName(team.name)
    }
  }, [matchId])

  useEffect(() => {
    loadMatch()
    const channel = supabase
      .channel(`jumbotron-${matchId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'match_scores', filter: `match_id=eq.${matchId}` }, (payload) => {
        const ns = payload.new as ScoreState & { participant_id: string }
        if (ns.participant_id === match?.participant_a_id) {
          setScoreA((prev) => {
            const prevTotal = prev.q1 + prev.q2 + prev.q3 + prev.q4 + prev.ot
            const newTotal = ns.q1 + ns.q2 + ns.q3 + ns.q4 + ns.ot
            if (newTotal > prevTotal) triggerFlash('A')
            return ns
          })
        } else {
          setScoreB((prev) => {
            const prevTotal = prev.q1 + prev.q2 + prev.q3 + prev.q4 + prev.ot
            const newTotal = ns.q1 + ns.q2 + ns.q3 + ns.q4 + ns.ot
            if (newTotal > prevTotal) triggerFlash('B')
            return ns
          })
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` }, () => loadMatch())
      .subscribe()

    return () => { channel.unsubscribe() }
  }, [matchId, loadMatch, triggerFlash])

  const getTotalA = () => {
    if (sport === 'basketball') return scoreA.q1 + scoreA.q2 + scoreA.q3 + scoreA.q4 + scoreA.ot
    if (sport === 'volleyball') return scoreA.sets_won
    return scoreA.games_won
  }

  const getTotalB = () => {
    if (sport === 'basketball') return scoreB.q1 + scoreB.q2 + scoreB.q3 + scoreB.q4 + scoreB.ot
    if (sport === 'volleyball') return scoreB.sets_won
    return scoreB.games_won
  }

  const isLive = match?.status === 'live'
  const isDone = match?.status === 'completed'

  return (
    <div
      className="min-h-screen w-full flex flex-col select-none overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #000510 0%, #00103A 100%)', fontFamily: '"Barlow Condensed", sans-serif' }}
    >
      {/* Header bar */}
      <div
        className="flex items-center justify-between px-10 py-4 border-b-2"
        style={{ borderColor: 'var(--school-secondary, #FFD700)', backgroundColor: 'rgba(0,0,0,0.5)' }}
      >
        <div className="flex items-center gap-4">
          {institution?.logo_url ? (
            <img src={institution.logo_url} alt="Logo" className="w-12 h-12 rounded-full" />
          ) : (
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold" style={{ backgroundColor: 'var(--school-secondary, #FFD700)', color: 'var(--school-primary, #002D62)' }}>
              🏆
            </div>
          )}
          <div>
            <p className="text-white font-black text-xl tracking-widest">{institution?.abbreviation ?? 'U-Sports'}</p>
            <p className="text-white/50 text-sm">{institution?.tagline}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-right">
          <p className="text-white/60 text-sm uppercase tracking-wider">{sport.replace('-', ' ').toUpperCase()}</p>
          {isLive && (
            <div className="flex items-center gap-2 bg-red-600 px-4 py-1.5 rounded-full">
              <div className="w-2.5 h-2.5 rounded-full bg-white animate-pulse-live" />
              <span className="font-black tracking-widest text-white text-sm">LIVE</span>
            </div>
          )}
          {isDone && (
            <div className="flex items-center gap-2 bg-green-800 px-4 py-1.5 rounded-full">
              <span className="font-black tracking-widest text-[#00FF88] text-sm">FINAL</span>
            </div>
          )}
        </div>
      </div>

      {/* Scores */}
      <div className="flex-1 flex items-center justify-center px-10">
        <div className="w-full max-w-6xl">
          <div className="grid grid-cols-[1fr_auto_1fr] gap-8 items-center">
            {/* Team A */}
            <div
              className={`text-center transition-all duration-300 ${flash === 'A' ? 'scale-105' : ''}`}
              style={{ filter: flash === 'A' ? 'drop-shadow(0 0 30px var(--school-secondary, #FFD700))' : '' }}
            >
              <p className="text-white/50 text-lg uppercase tracking-widest mb-2">HOME</p>
              <p
                className="font-black uppercase tracking-wide leading-none mb-6"
                style={{ fontSize: 'clamp(2rem, 5vw, 4.5rem)', color: 'var(--school-secondary, #FFD700)' }}
              >
                {teamAName}
              </p>
              <p
                className="font-black leading-none"
                style={{
                  fontSize: 'clamp(5rem, 18vw, 14rem)',
                  color: flash === 'A' ? 'var(--school-secondary, #FFD700)' : '#FFFFFF',
                  textShadow: flash === 'A' ? '0 0 40px rgba(255, 215, 0, 0.8)' : 'none',
                  transition: 'all 0.3s ease',
                }}
              >
                {getTotalA()}
              </p>

              {/* Period scores - basketball only */}
              {sport === 'basketball' && (
                <div className="flex justify-center gap-4 mt-4">
                  {['Q1', 'Q2', 'Q3', 'Q4'].map((q, i) => (
                    <div key={q} className="text-center">
                      <p className="text-white/30 text-xs mb-0.5">{q}</p>
                      <p className="text-white font-bold text-lg">{[scoreA.q1, scoreA.q2, scoreA.q3, scoreA.q4][i]}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Volleyball sets */}
              {sport === 'volleyball' && (
                <div className="flex justify-center gap-3 mt-4">
                  {[scoreA.set1, scoreA.set2, scoreA.set3, scoreA.set4, scoreA.set5].filter((_, i) => i < 5).map((s, i) => (
                    <div key={i} className="text-center">
                      <p className="text-white/30 text-xs mb-0.5">S{i + 1}</p>
                      <p className="text-white font-bold text-lg">{s}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* VS divider */}
            <div className="flex flex-col items-center gap-3">
              <div className="w-px h-24 bg-white/10" />
              <p className="text-white/30 text-2xl font-black">VS</p>
              <div className="w-px h-24 bg-white/10" />
            </div>

            {/* Team B */}
            <div
              className={`text-center transition-all duration-300 ${flash === 'B' ? 'scale-105' : ''}`}
              style={{ filter: flash === 'B' ? 'drop-shadow(0 0 30px var(--school-secondary, #FFD700))' : '' }}
            >
              <p className="text-white/50 text-lg uppercase tracking-widest mb-2">AWAY</p>
              <p
                className="font-black uppercase tracking-wide leading-none mb-6"
                style={{ fontSize: 'clamp(2rem, 5vw, 4.5rem)', color: 'var(--school-secondary, #FFD700)' }}
              >
                {teamBName}
              </p>
              <p
                className="font-black leading-none"
                style={{
                  fontSize: 'clamp(5rem, 18vw, 14rem)',
                  color: flash === 'B' ? 'var(--school-secondary, #FFD700)' : '#FFFFFF',
                  textShadow: flash === 'B' ? '0 0 40px rgba(255, 215, 0, 0.8)' : 'none',
                  transition: 'all 0.3s ease',
                }}
              >
                {getTotalB()}
              </p>

              {sport === 'basketball' && (
                <div className="flex justify-center gap-4 mt-4">
                  {['Q1', 'Q2', 'Q3', 'Q4'].map((q, i) => (
                    <div key={q} className="text-center">
                      <p className="text-white/30 text-xs mb-0.5">{q}</p>
                      <p className="text-white font-bold text-lg">{[scoreB.q1, scoreB.q2, scoreB.q3, scoreB.q4][i]}</p>
                    </div>
                  ))}
                </div>
              )}

              {sport === 'volleyball' && (
                <div className="flex justify-center gap-3 mt-4">
                  {[scoreB.set1, scoreB.set2, scoreB.set3, scoreB.set4, scoreB.set5].filter((_, i) => i < 5).map((s, i) => (
                    <div key={i} className="text-center">
                      <p className="text-white/30 text-xs mb-0.5">S{i + 1}</p>
                      <p className="text-white font-bold text-lg">{s}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {isDone && (
            <div className="text-center mt-8">
              <p className="text-[#00FF88] text-3xl font-black tracking-widest animate-pulse-live">GAME OVER</p>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div
        className="px-10 py-3 border-t flex items-center justify-between"
        style={{ borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(0,0,0,0.5)' }}
      >
        <p className="text-white/30 text-sm">U-Sports Platform · {institution?.name}</p>
        {match?.venue && <p className="text-white/30 text-sm">{match.venue}</p>}
        <p className="text-white/20 text-xs font-mono">{matchId?.slice(0, 8)}</p>
      </div>
    </div>
  )
}
