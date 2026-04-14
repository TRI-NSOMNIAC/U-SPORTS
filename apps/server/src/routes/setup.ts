import { Router } from 'express'
import { z } from 'zod'
import supabase from '../utils/supabase'

const router = Router()

const setupSchema = z
  .object({
    institution: z.object({
      name: z.string().min(1),
      abbreviation: z.string().min(1),
      tagline: z.string().default(''),
      primary_color: z.string().default('#002D62'),
      secondary_color: z.string().default('#FFD700'),
      address: z.string().default(''),
      region: z.string().default(''),
      staff_email_domain: z.string().min(1),
      student_email_domain: z.string().min(1),
    }),
    superAdmin: z.object({
      full_name: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(8),
    }),
    activeSports: z.array(z.string()).min(1),
    season: z.object({
      name: z.string().min(1),
      start_date: z.string(),
      end_date: z.string(),
    }),
  })
  .transform((b) => {
    const staff = b.institution.staff_email_domain.trim().toLowerCase()
    const student = b.institution.student_email_domain.trim().toLowerCase()
    const email = b.superAdmin.email.trim().toLowerCase()
    return {
      ...b,
      institution: { ...b.institution, staff_email_domain: staff, student_email_domain: student },
      superAdmin: { ...b.superAdmin, email },
    }
  })

// Check if setup is needed
router.get('/status', async (_req, res) => {
  const { data } = await supabase.from('institution').select('is_setup_complete').maybeSingle()
  res.json({ setupComplete: data?.is_setup_complete ?? false })
})

// Complete initial setup
router.post('/complete', async (req, res) => {
  try {
    const { data: existing, error: existingErr } = await supabase
      .from('institution')
      .select('is_setup_complete')
      .maybeSingle()
    if (existingErr) {
      return res.status(400).json({ error: existingErr.message })
    }
    if (existing?.is_setup_complete) {
      return res.status(400).json({ error: 'Platform is already set up' })
    }

    const body = setupSchema.parse(req.body)

    const staffDomain = body.institution.staff_email_domain
    const studentDomain = body.institution.student_email_domain
    const adminEmail = body.superAdmin.email

    if (!adminEmail.endsWith(`@${staffDomain}`)) {
      return res.status(400).json({
        error: `Super admin must use a staff email (@${staffDomain}). Student emails (@${studentDomain}) are for athlete registration only.`,
      })
    }
    if (adminEmail.endsWith(`@${studentDomain}`)) {
      return res.status(400).json({
        error: `Use your staff account (@${staffDomain}) for the super admin, not @${studentDomain}.`,
      })
    }
    if (body.season.end_date < body.season.start_date) {
      return res.status(400).json({ error: 'Season end date must be on or after the start date.' })
    }

    // 1. Create super admin auth user (role in app_metadata so DB trigger picks it reliably)
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: body.superAdmin.email,
      password: body.superAdmin.password,
      email_confirm: true,
      app_metadata: { role: 'super_admin' },
      user_metadata: { full_name: body.superAdmin.full_name },
    })
    if (authError || !authData?.user) {
      const msg = authError?.message ?? 'Could not create admin account'
      if (/already registered|already exists/i.test(msg)) {
        return res.status(400).json({
          error:
            'An account with this email already exists. Log in, or delete that user in Supabase Auth (Dashboard → Authentication) before running setup again.',
        })
      }
      return res.status(400).json({ error: msg })
    }

    const { error: profileError } = await supabase.from('profiles').upsert({
      id: authData.user.id,
      email: body.superAdmin.email,
      full_name: body.superAdmin.full_name,
      role: 'super_admin',
    })
    if (profileError) {
      return res.status(400).json({ error: profileError.message })
    }

    const { data: existingInst } = await supabase.from('institution').select('id').limit(1).maybeSingle()
    const institutionPayload = { ...body.institution, is_setup_complete: true }
    const { error: instError } = existingInst?.id
      ? await supabase.from('institution').update(institutionPayload).eq('id', existingInst.id)
      : await supabase.from('institution').insert(institutionPayload)
    if (instError) {
      return res.status(400).json({ error: instError.message })
    }

    const { error: sportsOffError } = await supabase.from('sports_config').update({ is_active: false }).neq('slug', 'NONE')
    if (sportsOffError) {
      return res.status(400).json({ error: sportsOffError.message })
    }
    const { error: sportsOnError } = await supabase
      .from('sports_config')
      .update({ is_active: true })
      .in('slug', body.activeSports)
    if (sportsOnError) {
      return res.status(400).json({ error: sportsOnError.message })
    }

    const { error: seasonError } = await supabase.from('seasons').insert({
      name: body.season.name,
      status: 'active',
      start_date: body.season.start_date,
      end_date: body.season.end_date,
      created_by: authData.user.id,
    })
    if (seasonError) {
      return res.status(400).json({ error: seasonError.message })
    }

    res.json({ success: true, message: 'Platform setup complete' })
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      const first = err.issues[0]
      return res.status(400).json({ error: first?.message ?? 'Invalid setup payload' })
    }
    const message = err instanceof Error ? err.message : 'Setup failed'
    res.status(400).json({ error: message })
  }
})

export default router
