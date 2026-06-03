import { Router, type Response } from 'express'
import { z } from 'zod'
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth'
import supabase from '../utils/supabase'
import { writeAuditLog } from '../utils/writeAuditLog'
import PDFDocument from 'pdfkit'
import { deriveEliminationPodium } from '../utils/eventPlacements'
import { resolveParticipantLabelMap } from '../utils/participantLabelMap'
import { aggregateInsightPlainText, buildSeasonAggregateInsights } from '../utils/analyticsComputedInsights'

const router = Router()

const analyticsTabSchema = z.enum(['leaderboard', 'insights', 'results', 'teams'])

const analyticsCsvQuerySchema = z.object({
  seasonId: z
    .string()
    .optional()
    .transform((s) => {
      const t = s?.trim()
      return t && t.length > 0 ? t : undefined
    }),
  sport: z.enum(['basketball', 'volleyball', 'table-tennis']).optional(),
  tab: z.preprocess((val) => {
    const v = Array.isArray(val) ? val[0] : val
    if (v === '' || v === undefined || v === null) return 'leaderboard'
    return v
  }, analyticsTabSchema),
})

function csvEscape(cell: unknown): string {
  return `"${String(cell ?? '').replace(/"/g, '""')}"`
}

function sendCsv(res: Response, filename: string, headers: string[], rows: Record<string, unknown>[]) {
  const csv =
    rows.length === 0
      ? headers.join(',')
      : [headers.join(','), ...rows.map((row) => headers.map((h) => csvEscape(row[h])).join(','))].join('\n')
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.send(csv)
}

// Export analytics as CSV (tab-specific; season + optional sport filter)
router.get('/analytics/csv', requireAuth, requireRole('Organizer', 'Admin'), async (req: AuthRequest, res) => {
  const parsed = analyticsCsvQuerySchema.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  let seasonId = parsed.data.seasonId?.trim() ?? ''

  if (!seasonId || seasonId === 'current') {
    const { data: active } = await supabase.from('seasons').select('id').eq('status', 'active').limit(1).maybeSingle()
    if (!active?.id) return res.status(400).json({ error: 'No active season configured.' })
    seasonId = active.id
  } else {
    const { data: exists } = await supabase.from('seasons').select('id').eq('id', seasonId).maybeSingle()
    if (!exists) return res.status(404).json({ error: 'Season not found' })
  }

  const sport = parsed.data.sport
  const tab = parsed.data.tab

  try {
    if (tab === 'leaderboard') {
      let statsQuery = supabase
        .from('player_season_stats')
        .select('*, athlete:athletes(student_id, sport, position, profile:profiles!athletes_profile_id_fkey(full_name))')
        .eq('season_id', seasonId)
        .order('games_played', { ascending: false })

      if (sport) statsQuery = statsQuery.eq('sport', sport)

      const { data: stats, error } = await statsQuery
      if (error) return res.status(500).json({ error: error.message })

      const rows = (stats ?? []).map((s: any) => {
        const athlete = s.athlete
        return {
          student_id: athlete?.student_id ?? '',
          full_name: athlete?.profile?.full_name ?? '',
          sport: s.sport,
          position: athlete?.position ?? '',
          games_played: s.games_played,
          ...s.stats,
        }
      })

      const defaultHeaders = ['student_id', 'full_name', 'sport', 'position', 'games_played']
      const headers = rows.length > 0 ? Object.keys(rows[0]) : defaultHeaders
      await writeAuditLog({
        actorId: req.user!.id,
        action: 'analytics_csv_exported',
        entityType: 'season',
        entityId: seasonId,
        details: { tab: 'leaderboard', sport: sport ?? null },
      })
      sendCsv(res, 'analytics-leaderboard.csv', headers, rows as Record<string, unknown>[])
      return
    }

    if (tab === 'teams') {
      const { data: raw, error } = await supabase
        .from('team_season_stats')
        .select('wins, losses, team:teams(name, sport)')
        .eq('season_id', seasonId)
        .order('wins', { ascending: false })

      if (error) return res.status(500).json({ error: error.message })

      let list = raw ?? []
      if (sport) list = list.filter((ts: any) => ts.team?.sport === sport)

      const rows = list.map((ts: any) => {
        const gp = (ts.wins ?? 0) + (ts.losses ?? 0)
        const pct = gp > 0 ? Math.round((ts.wins / gp) * 100) : 0
        return {
          team_name: ts.team?.name ?? '',
          sport: ts.team?.sport ?? '',
          wins: ts.wins ?? 0,
          losses: ts.losses ?? 0,
          games_decided: gp,
          win_pct: pct,
        }
      })

      await writeAuditLog({
        actorId: req.user!.id,
        action: 'analytics_csv_exported',
        entityType: 'season',
        entityId: seasonId,
        details: { tab: 'teams', sport: sport ?? null },
      })
      sendCsv(res, 'analytics-teams.csv', ['team_name', 'sport', 'wins', 'losses', 'games_decided', 'win_pct'], rows)
      return
    }

    if (tab === 'insights') {
      if (!sport) {
        return res.status(400).json({ error: 'Sport is required for the insights export.' })
      }

      const [lbRes, tsRes] = await Promise.all([
        supabase
          .from('player_season_stats')
          .select('*, athlete:athletes(student_id, profile:profiles!athletes_profile_id_fkey(full_name))')
          .eq('season_id', seasonId)
          .eq('sport', sport)
          .order('games_played', { ascending: false })
          .limit(80),
        supabase.from('team_season_stats').select('*, team:teams(name, sport)').eq('season_id', seasonId),
      ])

      if (lbRes.error) return res.status(500).json({ error: lbRes.error.message })
      if (tsRes.error) return res.status(500).json({ error: tsRes.error.message })

      const leaderboard = lbRes.data ?? []
      const teamStatsRaw = tsRes.data ?? []
      const snapshots = buildSeasonAggregateInsights(sport, leaderboard as any, teamStatsRaw as any)

      const snapshotRows: Record<string, unknown>[] = snapshots.map((s) => ({
        kind: 'Season snapshot',
        narrative: aggregateInsightPlainText(s),
        tone: s.tone,
        entity_type: '',
        entity_id: '',
        sport: '',
        insight_type: '',
        created_at: '',
      }))

      let iq = supabase
        .from('insights')
        .select('entity_type, entity_id, sport, insight_type, insight_text, created_at')
        .eq('season_id', seasonId)
        .eq('sport', sport)
        .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(500)

      const { data: insightRows, error: iqErr } = await iq
      if (iqErr) return res.status(500).json({ error: iqErr.message })

      const automatedRows: Record<string, unknown>[] = (insightRows ?? []).map((row: any) => ({
        kind: 'Automated insight',
        narrative: row.insight_text ?? '',
        tone: '',
        entity_type: row.entity_type ?? '',
        entity_id: row.entity_id ?? '',
        sport: row.sport ?? '',
        insight_type: row.insight_type ?? '',
        created_at: row.created_at ?? '',
      }))

      const merged = [...snapshotRows, ...automatedRows]
      await writeAuditLog({
        actorId: req.user!.id,
        action: 'analytics_csv_exported',
        entityType: 'season',
        entityId: seasonId,
        details: { tab: 'insights', sport },
      })
      sendCsv(
        res,
        'analytics-insights.csv',
        ['kind', 'narrative', 'tone', 'entity_type', 'entity_id', 'sport', 'insight_type', 'created_at'],
        merged,
      )
      return
    }

    // tab === 'results'
    let evQuery = supabase
      .from('events')
      .select('id,name')
      .eq('season_id', seasonId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(80)

    if (sport) evQuery = evQuery.eq('sport', sport)

    const { data: doneEv, error: evErr } = await evQuery
    if (evErr) return res.status(500).json({ error: evErr.message })

    const rows: Record<string, unknown>[] = []
    const idsForLabels = new Set<string>()

    for (const ev of doneEv ?? []) {
      const { data: br } = await supabase
        .from('brackets')
        .select('round,match_order,participant_a_id,participant_b_id,winner_id,is_bye,bracket_type')
        .eq('event_id', ev.id)

      const placements = deriveEliminationPodium((br ?? []) as Parameters<typeof deriveEliminationPodium>[0])
      if (!placements) continue

      const champ = placements.find((p) => p.rank === 1)
      const runner = placements.find((p) => p.rank === 2)
      if (champ) idsForLabels.add(champ.participantId)
      if (runner) idsForLabels.add(runner.participantId)

      rows.push({
        event_name: ev.name ?? '',
        champion_participant_id: champ?.participantId ?? '',
        runner_up_participant_id: runner?.participantId ?? '',
      })
    }

    const labelMap = await resolveParticipantLabelMap([...idsForLabels])

    const rowsNamed = rows.map((r) => ({
      event_name: r.event_name,
      champion: labelMap[String(r.champion_participant_id)] ?? String(r.champion_participant_id ?? ''),
      runner_up: labelMap[String(r.runner_up_participant_id)] ?? String(r.runner_up_participant_id ?? ''),
    }))

    await writeAuditLog({
      actorId: req.user!.id,
      action: 'analytics_csv_exported',
      entityType: 'season',
      entityId: seasonId,
      details: { tab: 'results', sport: sport ?? null },
    })
    sendCsv(res, 'analytics-event-results.csv', ['event_name', 'champion', 'runner_up'], rowsNamed)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'CSV export failed'
    res.status(500).json({ error: msg })
  }
})

// Generate season report PDF
router.get('/season/:seasonId/pdf', requireAuth, requireRole('Organizer', 'Admin'), async (req: AuthRequest, res) => {
  const { data: season } = await supabase.from('seasons').select('*').eq('id', req.params.seasonId).single()
  if (!season) return res.status(404).json({ error: 'Season not found' })

  const { data: institution } = await supabase.from('institution').select('name, abbreviation, tagline').single()

  const { data: topPlayers } = await supabase
    .from('player_season_stats')
    .select('*, athlete:athletes(student_id, sport, profile:profiles!athletes_profile_id_fkey(full_name))')
    .eq('season_id', req.params.seasonId)
    .order('games_played', { ascending: false })
    .limit(10)

  const { data: teamStats } = await supabase
    .from('team_season_stats')
    .select('*, team:teams(name, sport)')
    .eq('season_id', req.params.seasonId)
    .order('wins', { ascending: false })

  const doc = new PDFDocument({ margin: 50 })
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${season.name}-report.pdf"`)

  await writeAuditLog({
    actorId: req.user!.id,
    action: 'season_pdf_report_exported',
    entityType: 'season',
    entityId: req.params.seasonId,
    details: { season_name: season.name },
  })

  doc.pipe(res)

  // Header
  doc.fontSize(24).font('Helvetica-Bold').text(institution?.name ?? 'U-Sports', { align: 'center' })
  doc.fontSize(14).font('Helvetica').text(institution?.tagline ?? '', { align: 'center' })
  doc.moveDown()
  doc.fontSize(18).font('Helvetica-Bold').text(`Season Report: ${season.name}`, { align: 'center' })
  doc.fontSize(10).font('Helvetica').text(
    `Generated: ${new Date().toLocaleDateString('en-PH')}`,
    { align: 'center' }
  )
  doc.moveDown(2)

  // Team standings
  if (teamStats && teamStats.length > 0) {
    doc.fontSize(14).font('Helvetica-Bold').text('Team Standings')
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke()
    doc.moveDown(0.5)
    teamStats.forEach((ts: any, i: number) => {
      doc.fontSize(10).font('Helvetica').text(
        `${i + 1}. ${ts.team?.name ?? 'Team'} (${ts.team?.sport}) — W${ts.wins} L${ts.losses}`
      )
    })
    doc.moveDown()
  }

  // Top performers
  if (topPlayers && topPlayers.length > 0) {
    doc.fontSize(14).font('Helvetica-Bold').text('Top Performers')
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke()
    doc.moveDown(0.5)
    topPlayers.forEach((p: any, i: number) => {
      doc.fontSize(10).font('Helvetica').text(
        `${i + 1}. ${p.athlete?.profile?.full_name ?? 'Player'} (${p.sport}) — ${p.games_played} GP`
      )
    })
  }

  doc.end()
})

export default router
