import React, { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router'
import { Trophy, TrendingUp } from 'lucide-react'
import { Card, Badge, TabBar, Skeleton } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { getSportLabel } from '../../lib/utils'
import type { Insight } from '../../types'

export default function GuestLeaderboards() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const sport = searchParams.get('sport') ?? 'basketball'
  const [leaderboard, setLeaderboard] = useState<any[]>([])
  const [teamStandings, setTeamStandings] = useState<any[]>([])
  const [insights, setInsights] = useState<Insight[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('players')

  useEffect(() => {
    setLoading(true)
    Promise.all([
      supabase.from('player_season_stats')
        .select('*, athlete:athletes(student_id, position, profile:profiles(full_name))')
        .eq('sport', sport)
        .order('games_played', { ascending: false })
        .limit(20),
      supabase.from('team_season_stats')
        .select('*, team:teams(name, sport)')
        .eq('season_id', 'CURRENT')
        .order('wins', { ascending: false }),
      supabase.from('insights')
        .select('*')
        .eq('sport', sport)
        .limit(5),
    ]).then(([lb, ts, ins]) => {
      setLeaderboard(lb.data ?? [])
      setTeamStandings(ts.data ?? [])
      setInsights(ins.data ?? [])
    }).finally(() => setLoading(false))
  }, [sport])

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Standings & Leaderboards</h1>
        <p className="text-[var(--text-muted)] text-sm">Season statistics and rankings</p>
      </div>

      {/* Sport selector */}
      <div className="flex gap-2">
        {['basketball', 'volleyball', 'table-tennis'].map(s => (
          <button
            key={s}
            onClick={() => setSearchParams({ sport: s })}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${sport === s ? 'bg-[var(--school-primary)] text-[var(--school-secondary)]' : 'bg-[var(--surface-elevated)] text-[var(--text-muted)] hover:text-white'}`}
          >
            {getSportLabel(s as any)}
          </button>
        ))}
      </div>

      <TabBar tabs={[{ id: 'players', label: 'Player Stats' }, { id: 'teams', label: 'Team Standings' }, { id: 'insights', label: 'Insights' }]} active={tab} onChange={setTab} />

      {tab === 'players' && (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-elevated)]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)] w-10">#</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)]">Athlete</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--text-muted)]">GP</th>
                {sport === 'basketball' && <>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--text-muted)]">PPG</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--text-muted)]">RPG</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--text-muted)]">APG</th>
                </>}
                {sport === 'volleyball' && <>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--text-muted)]">Kills</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--text-muted)]">Aces</th>
                </>}
                {sport === 'table-tennis' && <>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--text-muted)]">Win%</th>
                </>}
              </tr>
            </thead>
            <tbody>
              {loading ? Array.from({length:8}).map((_,i) => (
                <tr key={i} className="border-t border-[var(--border-subtle)]">
                  {Array.from({length:5}).map((_,j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-[var(--surface-elevated)] rounded animate-pulse" /></td>)}
                </tr>
              )) : leaderboard.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-[var(--text-muted)]">No stats yet</td></tr>
              ) : leaderboard.map((p, i) => (
                <tr key={p.id} className="border-t border-[var(--border-subtle)] bg-[var(--surface-card)] hover:bg-[var(--surface-elevated)] cursor-pointer" onClick={() => navigate(`/guest/athletes/${p.athlete_id}`)}>
                  <td className="px-4 py-3 text-[var(--text-muted)] font-mono text-xs">{i + 1}</td>
                  <td className="px-4 py-3 font-medium">{p.athlete?.profile?.full_name ?? '—'}</td>
                  <td className="px-4 py-3 text-center">{p.games_played}</td>
                  {sport === 'basketball' && <>
                    <td className="px-4 py-3 text-center font-bold">{p.games_played > 0 ? ((p.stats?.total_points ?? 0) / p.games_played).toFixed(1) : '0.0'}</td>
                    <td className="px-4 py-3 text-center">{p.games_played > 0 ? ((p.stats?.total_rebounds ?? 0) / p.games_played).toFixed(1) : '0.0'}</td>
                    <td className="px-4 py-3 text-center">{p.games_played > 0 ? ((p.stats?.total_assists ?? 0) / p.games_played).toFixed(1) : '0.0'}</td>
                  </>}
                  {sport === 'volleyball' && <>
                    <td className="px-4 py-3 text-center font-bold">{p.stats?.kills ?? 0}</td>
                    <td className="px-4 py-3 text-center">{p.stats?.aces ?? 0}</td>
                  </>}
                  {sport === 'table-tennis' && <>
                    <td className="px-4 py-3 text-center font-bold">{p.stats?.win_pct ?? '0'}%</td>
                  </>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'teams' && (
        <div className="space-y-2">
          {teamStandings.length === 0 ? (
            <p className="text-center text-[var(--text-muted)] py-10">No team standings yet</p>
          ) : teamStandings.filter(ts => !sport || ts.team?.sport === sport).map((ts, i) => (
            <Card key={ts.id} className="flex items-center gap-4">
              <span className="text-lg font-bold text-[var(--text-muted)] w-6 text-center">{i + 1}</span>
              <div className="flex-1">
                <p className="font-bold">{ts.team?.name}</p>
                <p className="text-xs text-[var(--text-muted)]">{ts.team?.sport}</p>
              </div>
              <div className="flex gap-4 text-sm">
                <span className="text-[#00FF88] font-bold">{ts.wins}W</span>
                <span className="text-[#FF3355]">{ts.losses}L</span>
                <span className="text-[var(--text-muted)]">{ts.wins + ts.losses > 0 ? Math.round(ts.wins / (ts.wins + ts.losses) * 100) : 0}%</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === 'insights' && (
        <div className="space-y-3">
          {insights.length === 0 ? (
            <p className="text-center text-[var(--text-muted)] py-10">No insights yet for this sport</p>
          ) : insights.map(i => (
            <Card key={i.id} className="flex items-center gap-3">
              <TrendingUp className={`w-5 h-5 flex-shrink-0 ${i.insight_type === 'trending_up' ? 'text-[#00FF88]' : 'text-[#FF3355]'}`} />
              <p className="text-sm">{i.insight_text}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
