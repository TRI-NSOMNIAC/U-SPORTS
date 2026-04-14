import React, { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts'
import { Download, Filter, TrendingUp, Lightbulb } from 'lucide-react'
import { Card, TabBar, Select, Button, Badge, Skeleton } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import api from '../../lib/api'
import type { Insight } from '../../types'
import { getSportLabel, getSportIcon } from '../../lib/utils'

export default function OrganizerAnalytics() {
  const [tab, setTab] = useState('leaderboard')
  const [sport, setSport] = useState('basketball')
  const [insights, setInsights] = useState<Insight[]>([])
  const [leaderboard, setLeaderboard] = useState<any[]>([])
  const [teamStats, setTeamStats] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.get(`/insights?sport=${sport}`),
      supabase.from('player_season_stats')
        .select('*, athlete:athletes(student_id, profile:profiles(full_name))')
        .eq('sport', sport)
        .order('games_played', { ascending: false })
        .limit(15),
      supabase.from('team_season_stats')
        .select('*, team:teams(name, sport)')
        .eq('season_id', 'CURRENT')
        .order('wins', { ascending: false }),
    ]).then(([ins, lb, ts]) => {
      setInsights(ins.data ?? [])
      setLeaderboard(lb.data ?? [])
      setTeamStats(ts.data ?? [])
    }).finally(() => setLoading(false))
  }, [sport])

  const handleExportCSV = () => api.get(`/reports/analytics/csv?seasonId=current`, { responseType: 'blob' as any }).then(r => {
    const url = URL.createObjectURL(r.data)
    const a = document.createElement('a'); a.href = url; a.download = 'analytics.csv'; a.click()
  })

  const chartData = leaderboard.slice(0, 10).map(p => ({
    name: p.athlete?.profile?.full_name?.split(' ').slice(-1)[0] ?? 'Player',
    GP: p.games_played,
    ...(sport === 'basketball' ? {
      PPG: p.games_played > 0 ? ((p.stats?.total_points ?? 0) / p.games_played).toFixed(1) : 0,
      RPG: p.games_played > 0 ? ((p.stats?.total_rebounds ?? 0) / p.games_played).toFixed(1) : 0,
    } : sport === 'volleyball' ? {
      Kills: p.stats?.kills ?? 0,
      Aces: p.stats?.aces ?? 0,
    } : {
      Wins: p.stats?.mw ?? 0,
    })
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-[var(--text-muted)] text-sm">Performance insights and leaderboards</p>
        </div>
        <div className="flex gap-2">
          <Select value={sport} onChange={e => setSport(e.target.value)} options={[
            { value: 'basketball', label: '🏀 Basketball' },
            { value: 'volleyball', label: '🏐 Volleyball' },
            { value: 'table-tennis', label: '🏓 Table Tennis' },
          ]} />
          <Button size="sm" variant="secondary" icon={<Download className="w-4 h-4" />} onClick={handleExportCSV}>Export CSV</Button>
        </div>
      </div>

      <TabBar
        tabs={[
          { id: 'leaderboard', label: 'Leaderboard' },
          { id: 'insights', label: 'Insights' },
          { id: 'teams', label: 'Teams' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'leaderboard' && (
        <div className="space-y-6">
          {chartData.length > 0 && (
            <Card>
              <h3 className="font-bold mb-4">Top Performers — {getSportLabel(sport as any)}</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" tick={{ fill: '#8888A0', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#8888A0', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: '#16161E', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#fff' }} />
                  <Bar dataKey={sport === 'basketball' ? 'PPG' : sport === 'volleyball' ? 'Kills' : 'Wins'} fill="#0066FF" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}

          {loading ? (
            <div className="space-y-2">{Array.from({length:6}).map((_,i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface-elevated)]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)]">#</th>
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
                      <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--text-muted)]">Kill%</th>
                    </>}
                    {sport === 'table-tennis' && <>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--text-muted)]">MP</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--text-muted)]">W</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--text-muted)]">Win%</th>
                    </>}
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((p, i) => (
                    <tr key={p.id} className="border-t border-[var(--border-subtle)] bg-[var(--surface-card)] hover:bg-[var(--surface-elevated)]">
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
                        <td className="px-4 py-3 text-center">{p.stats?.kill_pct ?? '0'}%</td>
                      </>}
                      {sport === 'table-tennis' && <>
                        <td className="px-4 py-3 text-center">{p.stats?.mp ?? 0}</td>
                        <td className="px-4 py-3 text-center font-bold">{p.stats?.mw ?? 0}</td>
                        <td className="px-4 py-3 text-center">{p.stats?.win_pct ?? '0'}%</td>
                      </>}
                    </tr>
                  ))}
                  {leaderboard.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-8 text-[var(--text-muted)]">No stats yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'insights' && (
        <div className="space-y-3">
          {insights.length === 0 ? (
            <Card className="text-center py-12">
              <Lightbulb className="w-10 h-10 mx-auto text-[var(--text-muted)] mb-3" />
              <p className="text-[var(--text-muted)] text-sm">Insights are generated after games are scored. Check back later.</p>
            </Card>
          ) : (
            insights.map(insight => (
              <Card key={insight.id} className="flex gap-3">
                <div className={`w-1 rounded-full flex-shrink-0 ${insight.insight_type === 'trending_up' ? 'bg-[#00FF88]' : insight.insight_type === 'trending_down' ? 'bg-[#FF3355]' : 'bg-[#FFB800]'}`} />
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge size="sm" variant={insight.entity_type === 'player' ? 'info' : 'default'}>{insight.entity_type}</Badge>
                    <Badge size="sm" variant={insight.insight_type === 'trending_up' ? 'success' : insight.insight_type === 'trending_down' ? 'danger' : 'warning'}>
                      {insight.insight_type.replace('_', ' ')}
                    </Badge>
                  </div>
                  <p className="text-sm">{insight.insight_text}</p>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === 'teams' && (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-elevated)]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)]">Team</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--text-muted)]">W</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--text-muted)]">L</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--text-muted)]">Win%</th>
              </tr>
            </thead>
            <tbody>
              {teamStats.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-8 text-[var(--text-muted)]">No team stats yet</td></tr>
              ) : teamStats.map((ts, i) => (
                <tr key={ts.id} className="border-t border-[var(--border-subtle)] bg-[var(--surface-card)]">
                  <td className="px-4 py-3 font-medium">{ts.team?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-center font-bold text-[#00FF88]">{ts.wins}</td>
                  <td className="px-4 py-3 text-center text-[#FF3355]">{ts.losses}</td>
                  <td className="px-4 py-3 text-center">{ts.wins + ts.losses > 0 ? Math.round(ts.wins / (ts.wins + ts.losses) * 100) : 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
