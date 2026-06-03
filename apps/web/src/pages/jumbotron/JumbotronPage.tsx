import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'react-router'
import { supabase } from '../../lib/supabase'
import { useInstitutionStore } from '../../stores/institutionStore'
import { liveScorePresentation } from '../../lib/liveMatchPresentation'
import { useTimerListener } from '../../hooks/useGameTimer'

interface ScoreState {
  q1: number
  q2: number
  q3: number
  q4: number
  ot: number
  set1: number
  set2: number
  set3: number
  set4: number
  set5: number
  sets_won: number
  game1: number
  game2: number
  game3: number
  game4: number
  game5: number
  games_won: number
}

const emptyScore = (): ScoreState => ({
  q1: 0,
  q2: 0,
  q3: 0,
  q4: 0,
  ot: 0,
  set1: 0,
  set2: 0,
  set3: 0,
  set4: 0,
  set5: 0,
  sets_won: 0,
  game1: 0,
  game2: 0,
  game3: 0,
  game4: 0,
  game5: 0,
  games_won: 0,
})

/** Sum of period boxes — increases on rally points; used for flash + works for BB / VB / TT */
function aggregatePeriodPoints(sc: Partial<ScoreState>, sport: string): number {
  if (sport === 'basketball') {
    return (
      Number(sc.q1 ?? 0) +
      Number(sc.q2 ?? 0) +
      Number(sc.q3 ?? 0) +
      Number(sc.q4 ?? 0) +
      Number(sc.ot ?? 0)
    )
  }
  if (sport === 'volleyball') {
    return (
      Number(sc.set1 ?? 0) +
      Number(sc.set2 ?? 0) +
      Number(sc.set3 ?? 0) +
      Number(sc.set4 ?? 0) +
      Number(sc.set5 ?? 0)
    )
  }
  if (sport === 'table-tennis') {
    return (
      Number(sc.game1 ?? 0) +
      Number(sc.game2 ?? 0) +
      Number(sc.game3 ?? 0) +
      Number(sc.game4 ?? 0) +
      Number(sc.game5 ?? 0)
    )
  }
  return 0
}

function mergeScoreRow(raw: Record<string, unknown>): ScoreState {
  return { ...emptyScore(), ...raw } as ScoreState
}

export default function JumbotronPage() {
  const { matchId } = useParams<{ matchId: string }>()
  const { institution } = useInstitutionStore()
  const [match, setMatch] = useState<any>(null)
  const [scoreA, setScoreA] = useState<ScoreState>(emptyScore())
  const [scoreB, setScoreB] = useState<ScoreState>(emptyScore())
  const [sport, setSport] = useState('basketball')
  const [currentPeriod, setCurrentPeriod] = useState(1)
  const [teamAName, setTeamAName] = useState('HOME')
  const [teamBName, setTeamBName] = useState('AWAY')
  const [flash, setFlash] = useState<'A' | 'B' | null>(null)

  const { timerState, formatTime } = useTimerListener(matchId ?? '', sport === 'basketball')

  const participantARef = useRef<string | null>(null)
  const participantBRef = useRef<string | null>(null)
  const sportRef = useRef(sport)

  useEffect(() => {
    sportRef.current = sport
  }, [sport])

  const triggerFlash = useCallback((side: 'A' | 'B') => {
    setFlash(side)
    setTimeout(() => setFlash(null), 600)
  }, [])

  const fetchCurrentPeriod = useCallback(async () => {
    if (!matchId) return
    const { data } = await supabase
      .from('scoring_actions')
      .select('quarter_or_set')
      .eq('match_id', matchId)
      .eq('undone', false)
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data?.quarter_or_set != null) {
      setCurrentPeriod(Math.min(Math.max(Number(data.quarter_or_set), 1), 5))
    }
  }, [matchId])

  const loadMatch = useCallback(async () => {
    if (!matchId) return
    const { data: match } = await supabase.from('matches').select('*').eq('id', matchId).single()
    if (!match) return
    setMatch(match)

    participantARef.current = match.participant_a_id ?? null
    participantBRef.current = match.participant_b_id ?? null

    let sportResolved = 'basketball'
    if (match.event_id) {
      const { data: event } = await supabase.from('events').select('sport').eq('id', match.event_id).single()
      if (event?.sport) sportResolved = event.sport
    }
    setSport(sportResolved)

    const { data: scores } = await supabase.from('match_scores').select('*').eq('match_id', matchId)
    if (scores) {
      const sA = scores.find((s: any) => s.participant_id === match.participant_a_id)
      const sB = scores.find((s: any) => s.participant_id === match.participant_b_id)
      if (sA) setScoreA(mergeScoreRow(sA as Record<string, unknown>))
      if (sB) setScoreB(mergeScoreRow(sB as Record<string, unknown>))
    }

    if (match.participant_a_id) {
      const { data: team } = await supabase.from('teams').select('name').eq('id', match.participant_a_id).single()
      if (team) setTeamAName(team.name)
    }
    if (match.participant_b_id) {
      const { data: team } = await supabase.from('teams').select('name').eq('id', match.participant_b_id).single()
      if (team) setTeamBName(team.name)
    }

    await fetchCurrentPeriod()
  }, [matchId, fetchCurrentPeriod])

  useEffect(() => {
    loadMatch()
    const sp = sportRef.current
    const channel = supabase
      .channel(`jumbotron-${matchId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'match_scores', filter: `match_id=eq.${matchId}` },
        (payload) => {
          const ns = mergeScoreRow(payload.new as Record<string, unknown>)
          const spNow = sportRef.current
          if (ns.participant_id === participantARef.current) {
            setScoreA((prev) => {
              if (aggregatePeriodPoints(ns, spNow) > aggregatePeriodPoints(prev, spNow)) triggerFlash('A')
              return ns
            })
          } else {
            setScoreB((prev) => {
              if (aggregatePeriodPoints(ns, spNow) > aggregatePeriodPoints(prev, spNow)) triggerFlash('B')
              return ns
            })
          }
          void fetchCurrentPeriod()
        }
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` }, () => {
        void loadMatch()
      })
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [matchId, loadMatch, triggerFlash, fetchCurrentPeriod])

  const pres = liveScorePresentation(sport, scoreA, scoreB, currentPeriod)

  const isLive = match?.status === 'live'
  const isDone = match?.status === 'completed'

  const sportLabel = sport.replace(/-/g, ' ').toUpperCase()

  return (
    <div
      className="min-h-screen w-full flex flex-col select-none overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #000510 0%, #00103A 100%)', fontFamily: '"Barlow Condensed", sans-serif' }}
    >
      <div
        className="flex items-center justify-between px-10 py-4 border-b-2"
        style={{ borderColor: 'var(--school-secondary, #FFD700)', backgroundColor: 'rgba(0,0,0,0.5)' }}
      >
        <div className="flex items-center gap-4">
          {institution?.logo_url ? (
            <img src={institution.logo_url} alt="Logo" className="w-12 h-12 rounded-full" />
          ) : (
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold"
              style={{ backgroundColor: 'var(--school-secondary, #FFD700)', color: 'var(--school-primary, #002D62)' }}
            >
              🏆
            </div>
          )}
          <div>
            <p className="text-white font-black text-xl tracking-widest">{institution?.abbreviation ?? 'U-Sports'}</p>
            <p className="text-white/50 text-sm">{institution?.tagline}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-right">
          <p className="text-white/60 text-sm uppercase tracking-wider">{sportLabel}</p>
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

      <p className="text-center text-white/50 text-sm uppercase tracking-widest pt-4">{pres.phase}</p>
      {(sport === 'volleyball' || sport === 'table-tennis') && (
        <p className="text-center text-white/40 text-sm font-medium pb-2">{pres.subtitle}</p>
      )}

      <div className="flex-1 flex items-center justify-center px-10">
        <div className="w-full max-w-6xl">
          <div className="grid grid-cols-[1fr_auto_1fr] gap-8 items-center">
            <div
              className={`text-center transition-all duration-300 ${flash === 'A' ? 'scale-105' : ''}`}
              style={{ filter: flash === 'A' ? 'drop-shadow(0 0 30px var(--school-secondary, #FFD700))' : '' }}
            >
              <p className="text-white/50 text-lg uppercase tracking-widest mb-2">HOME</p>
              <p
                className="font-black uppercase tracking-wide leading-none mb-2"
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
                {pres.left}
              </p>

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

              {sport === 'volleyball' && (
                <div className="flex justify-center gap-3 mt-4">
                  {[scoreA.set1, scoreA.set2, scoreA.set3, scoreA.set4, scoreA.set5].map((s, i) => (
                    <div key={i} className="text-center">
                      <p className="text-white/30 text-xs mb-0.5">S{i + 1}</p>
                      <p className="text-white font-bold text-lg">{s}</p>
                    </div>
                  ))}
                </div>
              )}

              {sport === 'table-tennis' && (
                <div className="flex justify-center gap-3 mt-4">
                  {[scoreA.game1, scoreA.game2, scoreA.game3, scoreA.game4, scoreA.game5].map((g, i) => (
                    <div key={i} className="text-center">
                      <p className="text-white/30 text-xs mb-0.5">G{i + 1}</p>
                      <p className="text-white font-bold text-lg">{g}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col items-center gap-3">
              <div className="w-px h-16 bg-white/10" />
              {timerState ? (
                <div className="text-center">
                  <p className="text-white font-mono font-black text-3xl tabular-nums tracking-wider">
                    {formatTime(timerState.seconds)}
                  </p>
                </div>
              ) : (
                <p className="text-white/30 text-2xl font-black">VS</p>
              )}
              <div className="w-px h-16 bg-white/10" />
            </div>

            <div
              className={`text-center transition-all duration-300 ${flash === 'B' ? 'scale-105' : ''}`}
              style={{ filter: flash === 'B' ? 'drop-shadow(0 0 30px var(--school-secondary, #FFD700))' : '' }}
            >
              <p className="text-white/50 text-lg uppercase tracking-widest mb-2">AWAY</p>
              <p
                className="font-black uppercase tracking-wide leading-none mb-2"
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
                {pres.right}
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
                  {[scoreB.set1, scoreB.set2, scoreB.set3, scoreB.set4, scoreB.set5].map((s, i) => (
                    <div key={i} className="text-center">
                      <p className="text-white/30 text-xs mb-0.5">S{i + 1}</p>
                      <p className="text-white font-bold text-lg">{s}</p>
                    </div>
                  ))}
                </div>
              )}

              {sport === 'table-tennis' && (
                <div className="flex justify-center gap-3 mt-4">
                  {[scoreB.game1, scoreB.game2, scoreB.game3, scoreB.game4, scoreB.game5].map((g, i) => (
                    <div key={i} className="text-center">
                      <p className="text-white/30 text-xs mb-0.5">G{i + 1}</p>
                      <p className="text-white font-bold text-lg">{g}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {sport === 'basketball' && (
            <p className="text-center text-white/35 text-xs mt-6">{pres.subtitle}</p>
          )}

          {isDone && (
            <div className="text-center mt-8">
              <p className="text-[#00FF88] text-3xl font-black tracking-widest animate-pulse-live">GAME OVER</p>
            </div>
          )}
        </div>
      </div>

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
