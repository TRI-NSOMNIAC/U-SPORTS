import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth'
import supabase from '../utils/supabase'
import PDFDocument from 'pdfkit'

const router = Router()

// Export analytics as CSV
router.get('/analytics/csv', requireAuth, requireRole('organizer', 'super_admin'), async (req, res) => {
  const { seasonId } = req.query
  if (!seasonId) return res.status(400).json({ error: 'seasonId required' })

  const { data: stats } = await supabase
    .from('player_season_stats')
    .select('*, athlete:athletes(student_id, sport, position, profile:profiles(full_name))')
    .eq('season_id', seasonId as string)

  if (!stats) return res.status(404).json({ error: 'No stats found' })

  const rows = stats.map((s: any) => {
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

  const headers = Object.keys(rows[0] ?? {})
  const csv = [
    headers.join(','),
    ...rows.map((r: any) => headers.map((h) => `"${r[h] ?? ''}"`).join(',')),
  ].join('\n')

  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', 'attachment; filename="analytics.csv"')
  res.send(csv)
})

// Generate season report PDF
router.get('/season/:seasonId/pdf', requireAuth, requireRole('organizer', 'super_admin'), async (req, res) => {
  const { data: season } = await supabase.from('seasons').select('*').eq('id', req.params.seasonId).single()
  if (!season) return res.status(404).json({ error: 'Season not found' })

  const { data: institution } = await supabase.from('institution').select('name, abbreviation, tagline').single()

  const { data: topPlayers } = await supabase
    .from('player_season_stats')
    .select('*, athlete:athletes(student_id, sport, profile:profiles(full_name))')
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
