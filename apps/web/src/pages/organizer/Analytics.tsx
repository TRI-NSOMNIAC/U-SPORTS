import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Download, Lightbulb, Loader2, RefreshCw, Search, Trophy, TrendingUp } from 'lucide-react'
import { Card, TabBar, Select, Button, Badge, Skeleton, Input } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import api from '../../lib/api'
import type { Insight, Season } from '../../types'
import { getSportLabel, formatEnumLabel } from '../../lib/utils'
import { deriveEliminationPodium, placementRankLabel, type EventPlacement } from '../../lib/eventPlacements'
import { fetchParticipantLabels } from '../../lib/participantLabels'
import { buildSeasonAggregateInsights } from '../../lib/analyticsComputedInsights'

function insightNavigationTarget(insight: Insight): string {
  return insight.entity_type === 'player'
    ? `/guest/athletes/${insight.entity_id}`
    : `/organizer/teams?teamId=${encodeURIComponent(insight.entity_id)}`
}

function formatSeasonSelectLabel(s: Season): string {
  if (s.status === 'active') return `${s.name} · Active`
  if (s.status === 'completed') return `${s.name} · Completed`
  if (s.status === 'archived') return `${s.name} · Archived`
  if (s.status === 'draft') return `${s.name} · Draft`
  return s.name
}

export default function OrganizerAnalytics() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('leaderboard')
  const [sport, setSport] = useState('basketball')
  const [seasons, setSeasons] = useState<Season[]>([])
  const [seasonsLoading, setSeasonsLoading] = useState(true)
  const [seasonListQuery, setSeasonListQuery] = useState('')
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null)
  const [insights, setInsights] = useState<Insight[]>([])
  const [leaderboard, setLeaderboard] = useState<any[]>([])
  const [teamStats, setTeamStats] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [eventPodiums, setEventPodiums] = useState<{ event: { id: string; name: string }; placements: EventPlacement[] }[]>(
    []
  )
  const [podiumLabels, setPodiumLabels] = useState<Record<string, string>>({})
  const [insightsRefreshing, setInsightsRefreshing] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setSeasonsLoading(true)
      const { data, error } = await supabase
        .from('seasons')
        .select('id, name, status, start_date, end_date, created_at')
        .order('start_date', { ascending: false, nullsFirst: false })
      if (cancelled) return
      if (error) setSeasons([])
      else setSeasons((data ?? []) as Season[])
      setSeasonsLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const effectiveSeasonId = useMemo(() => {
    if (!seasons.length) return null
    if (selectedSeasonId && seasons.some((s) => s.id === selectedSeasonId)) return selectedSeasonId
    const active = seasons.find((s) => s.status === 'active')
    return active?.id ?? seasons[0]?.id ?? null
  }, [seasons, selectedSeasonId])

  const seasonSelectOptions = useMemo(() => {
    const q = seasonListQuery.trim().toLowerCase()
    let list = q ? seasons.filter((s) => s.name.toLowerCase().includes(q)) : seasons
    const selId = effectiveSeasonId
    if (selId && !list.some((s) => s.id === selId)) {
      const sel = seasons.find((s) => s.id === selId)
      if (sel) list = [sel, ...list]
    }
    return list.map((s) => ({ value: s.id, label: formatSeasonSelectLabel(s) }))
  }, [seasons, seasonListQuery, effectiveSeasonId])

  useEffect(() => {
    if (!effectiveSeasonId) {
      setInsights([])
      setLeaderboard([])
      setTeamStats([])
      setEventPodiums([])
      setPodiumLabels({})
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    const loadData = async () => {
      const seasonId = effectiveSeasonId

      try {
        const [lb, ts] = await Promise.all([
          supabase
            .from('player_season_stats')
            .select('*, athlete:athletes(student_id, profile:profiles!athletes_profile_id_fkey(full_name))')
            .eq('sport', sport)
            .eq('season_id', seasonId)
            .order('games_played', { ascending: false })
            .limit(15),
          supabase
            .from('team_season_stats')
            .select('*, team:teams(name, sport)')
            .eq('season_id', seasonId)
            .order('wins', { ascending: false }),
        ])

        if (cancelled) return

        try {
          const ins = await api.get(`/insights?sport=${encodeURIComponent(sport)}&season_id=${seasonId}`)
          if (!cancelled) setInsights(ins.data ?? [])
        } catch {
          if (!cancelled) setInsights([])
        }

        const lbRows = lb.data ?? []
        const tsRows = (ts as { data: any[] | null }).data ?? []
        setLeaderboard(lbRows)
        setTeamStats(tsRows)

        const podiumRows: { event: { id: string; name: string }; placements: EventPlacement[] }[] = []
        const { data: doneEv } = await supabase
          .from('events')
          .select('id,name')
          .eq('season_id', seasonId)
          .eq('sport', sport)
          .eq('status', 'completed')
          .eq('is_tryout', false)
          .order('created_at', { ascending: false })
          .limit(14)

        for (const ev of doneEv ?? []) {
          const { data: br } = await supabase
            .from('brackets')
            .select('round,match_order,participant_a_id,participant_b_id,winner_id,is_bye,bracket_type')
            .eq('event_id', ev.id)
          const placements = deriveEliminationPodium(br ?? [])
          if (!placements) continue
          podiumRows.push({ event: ev as { id: string; name: string }, placements })
        }

        if (cancelled) return

        setEventPodiums(podiumRows)
        const pid = new Set<string>()
        podiumRows.forEach((r) => r.placements.forEach((p) => pid.add(p.participantId)))
        if (pid.size === 0) {
          if (!cancelled) setPodiumLabels({})
        } else {
          try {
            const labels = await fetchParticipantLabels([...pid])
            if (!cancelled) setPodiumLabels(labels)
          } catch {
            if (!cancelled) setPodiumLabels({})
          }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadData()
    return () => {
      cancelled = true
    }
  }, [sport, effectiveSeasonId])

  const runInsightsBackfill = useCallback(async (): Promise<boolean> => {
    if (!effectiveSeasonId) return false
    setInsightsRefreshing(true)
    try {
      await api.post(
        '/insights/backfill-season',
        { seasonId: effectiveSeasonId, sport },
        { timeout: 120000 },
      )
      const ins = await api.get(`/insights?sport=${encodeURIComponent(sport)}&season_id=${effectiveSeasonId}`)
      setInsights(ins.data ?? [])
      return true
    } catch {
      return false
    } finally {
      setInsightsRefreshing(false)
    }
  }, [effectiveSeasonId, sport])

  /** Completed matches may pre-date server-side insight jobs — scan once per browser session when this tab is empty. */
  useEffect(() => {
    if (tab !== 'insights' || loading || seasonsLoading || !effectiveSeasonId || insights.length > 0) return
    const key = `analytics-auto-insights:v1:${effectiveSeasonId}:${sport}`
    try {
      if (sessionStorage.getItem(key)) return
    } catch {
      /* ignore */
    }
    void (async () => {
      const ok = await runInsightsBackfill()
      if (ok) {
        try {
          sessionStorage.setItem(key, '1')
        } catch {
          /* ignore */
        }
      }
    })()
  }, [tab, loading, seasonsLoading, insights.length, effectiveSeasonId, sport, runInsightsBackfill])

  const aggregateInsights = useMemo(
    () => buildSeasonAggregateInsights(sport, leaderboard, teamStats),
    [sport, leaderboard, teamStats]
  )

  const teamStatsForSport = useMemo(
    () => teamStats.filter((ts) => ts.team?.sport === sport),
    [teamStats, sport]
  )

  const handleExportCSV = async () => {
    if (!effectiveSeasonId) return
    try {
      const qs = new URLSearchParams({
        seasonId: effectiveSeasonId,
        sport,
        tab,
      })
      const r = await api.get(`/reports/analytics/csv?${qs.toString()}`, { responseType: 'blob' as const })
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `analytics-${tab}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      /* non-blocking */
    }
  }

  const chartData = leaderboard.slice(0, 10).map((p) => ({
    name: p.athlete?.profile?.full_name?.split(' ').slice(-1)[0] ?? 'Player',
    GP: p.games_played,
    ...(sport === 'basketball'
      ? {
          PPG: p.games_played > 0 ? ((p.stats?.total_points ?? 0) / p.games_played).toFixed(1) : 0,
          RPG: p.games_played > 0 ? ((p.stats?.total_rebounds ?? 0) / p.games_played).toFixed(1) : 0,
        }
      : sport === 'volleyball'
        ? {
            Kills: p.stats?.kills ?? 0,
            Aces: p.stats?.aces ?? 0,
          }
        : {
            Wins: p.stats?.mw ?? 0,
          }),
  }))

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-[var(--text-muted)] text-sm">Performance insights, placements, and leaderboards</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end w-full lg:w-auto lg:max-w-3xl">
          <Input
            label="Find season"
            placeholder="Filter season list…"
            value={seasonListQuery}
            onChange={(e) => setSeasonListQuery(e.target.value)}
            icon={<Search className="w-4 h-4 text-[var(--text-muted)]" />}
            className="min-w-[160px] flex-1 sm:flex-none sm:w-44"
            disabled={seasonsLoading || seasons.length === 0}
          />
          <Select
            label="Season"
            value={effectiveSeasonId ?? ''}
            onChange={(e) => setSelectedSeasonId(e.target.value)}
            options={
              seasonSelectOptions.length > 0
                ? seasonSelectOptions
                : [{ value: '', label: seasonsLoading ? 'Loading seasons…' : 'No seasons' }]
            }
            disabled={seasonsLoading || !effectiveSeasonId || seasons.length === 0}
            className="min-w-[200px] flex-1 sm:flex-none sm:w-56"
          />
          <Select
            label="Sport"
            value={sport}
            onChange={(e) => setSport(e.target.value)}
            options={[
              { value: 'basketball', label: '🏀 Basketball' },
              { value: 'volleyball', label: '🏐 Volleyball' },
              { value: 'table-tennis', label: '🏓 Table Tennis' },
            ]}
            className="min-w-[160px] flex-1 sm:flex-none sm:w-48"
          />
          <Button
            size="sm"
            variant="secondary"
            icon={<Download className="w-4 h-4" />}
            onClick={() => void handleExportCSV()}
            disabled={!effectiveSeasonId}
          >
            Export CSV
          </Button>
        </div>
      </div>

      <TabBar
        tabs={[
          { id: 'leaderboard', label: 'Leaderboard' },
          { id: 'insights', label: 'Insights' },
          { id: 'results', label: 'Event results' },
          { id: 'teams', label: 'Teams' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'leaderboard' && (
        <div className="space-y-6">
          {chartData.length > 0 && (
            <Card>
              <h3 className="font-bold mb-4">Top performers — {getSportLabel(sport as any)}</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" tick={{ fill: '#8888A0', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#8888A0', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: '#16161E',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 8,
                      color: '#fff',
                    }}
                  />
                  <Bar
                    dataKey={sport === 'basketball' ? 'PPG' : sport === 'volleyball' ? 'Kills' : 'Wins'}
                    fill="#0066FF"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface-elevated)]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)]">#</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)]">Athlete</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--text-muted)]">GP</th>
                    {sport === 'basketball' && (
                      <>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--text-muted)]">PPG</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--text-muted)]">RPG</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--text-muted)]">APG</th>
                      </>
                    )}
                    {sport === 'volleyball' && (
                      <>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--text-muted)]">Kills</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--text-muted)]">Aces</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--text-muted)]">Kill%</th>
                      </>
                    )}
                    {sport === 'table-tennis' && (
                      <>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--text-muted)]">MP</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--text-muted)]">W</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--text-muted)]">Win%</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((p, i) => (
                    <tr
                      key={p.id}
                      className="border-t border-[var(--border-subtle)] bg-[var(--surface-card)] hover:bg-[var(--surface-elevated)]"
                    >
                      <td className="px-4 py-3 text-[var(--text-muted)] font-mono text-xs">{i + 1}</td>
                      <td className="px-4 py-3 font-medium">{p.athlete?.profile?.full_name ?? '—'}</td>
                      <td className="px-4 py-3 text-center">{p.games_played}</td>
                      {sport === 'basketball' && (
                        <>
                          <td className="px-4 py-3 text-center font-bold">
                            {p.games_played > 0 ? ((p.stats?.total_points ?? 0) / p.games_played).toFixed(1) : '0.0'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {p.games_played > 0 ? ((p.stats?.total_rebounds ?? 0) / p.games_played).toFixed(1) : '0.0'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {p.games_played > 0 ? ((p.stats?.total_assists ?? 0) / p.games_played).toFixed(1) : '0.0'}
                          </td>
                        </>
                      )}
                      {sport === 'volleyball' && (
                        <>
                          <td className="px-4 py-3 text-center font-bold">{p.stats?.kills ?? 0}</td>
                          <td className="px-4 py-3 text-center">{p.stats?.aces ?? 0}</td>
                          <td className="px-4 py-3 text-center">{p.stats?.kill_pct ?? '0'}%</td>
                        </>
                      )}
                      {sport === 'table-tennis' && (
                        <>
                          <td className="px-4 py-3 text-center">{p.stats?.mp ?? 0}</td>
                          <td className="px-4 py-3 text-center font-bold">{p.stats?.mw ?? 0}</td>
                          <td className="px-4 py-3 text-center">{p.stats?.win_pct ?? '0'}%</td>
                        </>
                      )}
                    </tr>
                  ))}
                  {leaderboard.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-[var(--text-muted)]">
                        No stats yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'insights' && (
        <div className="space-y-4">
          <Card className="border-[#0066FF]/20 bg-[#0066FF]/5">
            <div className="flex items-start gap-3">
              <TrendingUp className="w-5 h-5 text-[#0066FF] shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-sm mb-1">Season snapshots</h3>
                <p className="text-xs text-[var(--text-muted)] mb-3">
                  Derived from recorded season totals for the selected season and sport (same aggregates as the leaderboard below).
                </p>
                {aggregateInsights.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)]">Need more logged games before narratives appear.</p>
                ) : (
                  <ul className="space-y-2">
                    {aggregateInsights.map((row) => (
                      <li key={row.id} className="flex gap-2 text-sm">
                        <span
                          className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                            row.tone === 'positive' ? 'bg-[#00FF88]' : row.tone === 'watch' ? 'bg-[#FFB800]' : 'bg-[var(--text-muted)]'
                          }`}
                        />
                        <span className="text-[var(--text-secondary)]">
                          {row.parts.map((part, idx) =>
                            part.type === 'link' ? (
                              <Link
                                key={idx}
                                to={part.href}
                                className="text-[#0066FF] hover:underline font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0066FF] rounded-sm"
                              >
                                {part.value}
                              </Link>
                            ) : (
                              <span key={idx}>{part.value}</span>
                            ),
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Card>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-sm font-semibold text-[var(--text-muted)]">Automated insights</h3>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              loading={insightsRefreshing}
              disabled={!effectiveSeasonId || insightsRefreshing}
              icon={insightsRefreshing ? undefined : <RefreshCw className="w-4 h-4" />}
              onClick={() => void runInsightsBackfill()}
            >
              {insightsRefreshing ? 'Scanning matches…' : 'Refresh insights'}
            </Button>
          </div>
          {insights.length === 0 ? (
            <Card className="text-center py-12">
              <Lightbulb className="w-10 h-10 mx-auto text-[var(--text-muted)] mb-3" />
              <p className="text-[var(--text-muted)] text-sm max-w-md mx-auto mb-4">
                We scan recent completed matches for this season and sport to build trend and streak insights (players need enough logged games
                for rolling comparisons). Use Refresh insights if this section stays empty after ending matches.
              </p>
              {!insightsRefreshing && (
                <Button type="button" variant="primary" size="sm" onClick={() => void runInsightsBackfill()}>
                  Scan recent matches now
                </Button>
              )}
              {insightsRefreshing && (
                <p className="text-xs text-[var(--text-muted)] inline-flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  Scanning up to 40 recent matches…
                </p>
              )}
            </Card>
          ) : (
            <div className="space-y-3">
              {insights.map((insight) => (
                <div
                  key={insight.id}
                  role="button"
                  tabIndex={0}
                  className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0066FF] cursor-pointer"
                  onClick={() => navigate(insightNavigationTarget(insight))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      navigate(insightNavigationTarget(insight))
                    }
                  }}
                >
                  <Card className="flex gap-3 hover:border-[#0066FF]/35 transition-colors">
                    <div
                      className={`w-1 rounded-full flex-shrink-0 ${
                        insight.insight_type === 'trending_up'
                          ? 'bg-[#00FF88]'
                          : insight.insight_type === 'trending_down'
                            ? 'bg-[#FF3355]'
                            : 'bg-[#FFB800]'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge size="sm" variant={insight.entity_type === 'player' ? 'info' : 'default'}>
                          {formatEnumLabel(insight.entity_type)}
                        </Badge>
                        <Badge
                          size="sm"
                          variant={
                            insight.insight_type === 'trending_up'
                              ? 'success'
                              : insight.insight_type === 'trending_down'
                                ? 'danger'
                                : 'warning'
                          }
                        >
                          {formatEnumLabel(insight.insight_type)}
                        </Badge>
                      </div>
                      <p className="text-sm">{insight.insight_text}</p>
                    </div>
                  </Card>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'results' && (
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-muted)]">
            Champions and runners-up from completed knockout events in this season ({getSportLabel(sport as any)}). Round-robin–only events may not
            appear until a final bracket slot exists.
          </p>
          {loading ? (
            <Skeleton className="h-40" />
          ) : eventPodiums.length === 0 ? (
            <Card className="text-center py-12 text-[var(--text-muted)] text-sm">No finished bracket results for this sport yet.</Card>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface-elevated)]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)]">Event</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)]">Champion</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)]">Runner-up</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--text-muted)]" />
                  </tr>
                </thead>
                <tbody>
                  {eventPodiums.map((row) => {
                    const champ = row.placements.find((p) => p.rank === 1)
                    const runner = row.placements.find((p) => p.rank === 2)
                    return (
                      <tr
                        key={row.event.id}
                        className="border-t border-[var(--border-subtle)] bg-[var(--surface-card)] cursor-pointer hover:bg-[var(--surface-elevated)]"
                        onClick={() => navigate(`/organizer/events/${row.event.id}`)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Trophy className="w-4 h-4 text-[#FFB800] shrink-0" />
                            <span className="font-medium">{row.event.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">{champ ? podiumLabels[champ.participantId] ?? '—' : '—'}</td>
                        <td className="px-4 py-3 text-[var(--text-secondary)]">
                          {runner ? podiumLabels[runner.participantId] ?? '—' : '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Badge size="sm" variant="info">
                            Open
                          </Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
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
              {teamStatsForSport.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-[var(--text-muted)]">
                    No team stats yet
                  </td>
                </tr>
              ) : (
                teamStatsForSport.map((ts) => (
                  <tr key={ts.id} className="border-t border-[var(--border-subtle)] bg-[var(--surface-card)]">
                    <td className="px-4 py-3 font-medium">{ts.team?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-center font-bold text-[#00FF88]">{ts.wins}</td>
                    <td className="px-4 py-3 text-center text-[#FF3355]">{ts.losses}</td>
                    <td className="px-4 py-3 text-center">
                      {ts.wins + ts.losses > 0 ? Math.round((ts.wins / (ts.wins + ts.losses)) * 100) : 0}%
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
