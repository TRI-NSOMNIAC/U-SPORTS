import { Router } from 'express'
import multer from 'multer'
import { parse } from 'csv-parse/sync'
import { z } from 'zod'
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth'
import supabase from '../utils/supabase'

const router = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
})

const departmentEnum = z.enum(['SBMA', 'SECA', 'SASE', 'SHS'])
const sportEnum = z.enum(['basketball', 'volleyball', 'table-tennis'])

const importRowSchema = z.object({
  full_name: z.string().trim().min(1),
  student_id: z.string().trim().min(1),
  year_level: z.string().trim().optional().default(''),
  course: z.string().trim().optional().default(''),
  department: departmentEnum,
  sport: sportEnum.optional(),
  email: z.string().trim().email().optional(),
  password: z.string().min(8).optional(),
})

function normalizeImportRow(row: Record<string, unknown>) {
  const lowered = new Map<string, unknown>()
  for (const [key, value] of Object.entries(row)) {
    lowered.set(key.trim().toLowerCase().replace(/[\s-]+/g, '_'), value)
  }
  return {
    full_name: lowered.get('full_name') ?? lowered.get('name'),
    student_id: lowered.get('student_id') ?? lowered.get('school_id') ?? lowered.get('id_number'),
    year_level: lowered.get('year_level') ?? lowered.get('year'),
    course: lowered.get('course'),
    department: String(lowered.get('department') ?? '').trim().toUpperCase(),
    sport: lowered.get('sport'),
    email: lowered.get('email'),
    password: lowered.get('password'),
  }
}

function generatedEmail(studentId: string) {
  return `${studentId.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-')}@ursports.local`
}

function generatedPassword(studentId: string) {
  return `UrSports-${studentId.replace(/\s+/g, '')}-2026!`
}

router.post(
  '/import',
  requireAuth,
  requireRole('Coach', 'Admin'),
  upload.single('file'),
  async (req: AuthRequest, res) => {
    const bodySchema = z.object({
      sport: sportEnum.optional(),
      rows: z.union([z.array(z.record(z.unknown())), z.string()]).optional(),
    })

    try {
      const body = bodySchema.parse(req.body)
      let rawRows: Record<string, unknown>[] = Array.isArray(body.rows) ? body.rows : []

      if (req.file?.buffer) {
        rawRows = parse(req.file.buffer, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
        }) as Record<string, unknown>[]
      } else if (typeof body.rows === 'string') {
        rawRows = JSON.parse(body.rows) as Record<string, unknown>[]
      }

      if (rawRows.length === 0) {
        return res.status(400).json({ error: 'Upload a CSV file or provide rows.' })
      }

      const created: Array<{ student_id: string; email: string; athlete_id: string }> = []
      const errors: Array<{ row: number; error: string }> = []

      for (const [idx, raw] of rawRows.entries()) {
        const normalized = normalizeImportRow(raw)
        const parsed = importRowSchema.safeParse({ ...normalized, sport: normalized.sport || body.sport })
        if (!parsed.success) {
          errors.push({ row: idx + 1, error: parsed.error.issues[0]?.message ?? 'Invalid row' })
          continue
        }

        const row = parsed.data
        if (!row.sport) {
          errors.push({ row: idx + 1, error: 'Sport is required either in the file row or request body.' })
          continue
        }
        const email = (row.email ?? generatedEmail(row.student_id)).toLowerCase()
        const password = row.password ?? generatedPassword(row.student_id)

        const { data: existingAthlete } = await supabase
          .from('athletes')
          .select('id')
          .eq('student_id', row.student_id)
          .maybeSingle()
        if (existingAthlete) {
          errors.push({ row: idx + 1, error: `Student ID ${row.student_id} already exists.` })
          continue
        }

        const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            full_name: row.full_name,
            student_id: row.student_id,
            course: row.course,
            year_level: row.year_level,
            department: row.department,
          },
        })
        if (authError || !authUser.user?.id) {
          errors.push({ row: idx + 1, error: authError?.message ?? 'Could not create auth user' })
          continue
        }

        const { error: profileError } = await supabase.from('profiles').upsert({
          id: authUser.user.id,
          email,
          full_name: row.full_name,
          role: null,
          department: row.department,
        })
        if (profileError) {
          errors.push({ row: idx + 1, error: profileError.message })
          continue
        }

        const { data: athlete, error: athleteError } = await supabase
          .from('athletes')
          .insert({
            profile_id: authUser.user.id,
            student_id: row.student_id,
            sport: row.sport,
            year_level: row.year_level,
            department: row.department,
            verification_status: 'approved',
            season_status: 'active',
            medical_cleared: false,
          })
          .select('id')
          .single()
        if (athleteError || !athlete) {
          errors.push({ row: idx + 1, error: athleteError?.message ?? 'Could not create athlete row' })
          continue
        }

        created.push({ student_id: row.student_id, email, athlete_id: athlete.id })
      }

      await supabase.from('audit_logs').insert({
        actor_id: req.user!.id,
        action: 'athletes_imported',
        entity_type: 'athlete',
        entity_id: null,
        details: { created_count: created.length, error_count: errors.length },
      })

      res.status(errors.length > 0 ? 207 : 201).json({ created, errors })
    } catch (err: unknown) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Import failed' })
    }
  },
)

export default router
