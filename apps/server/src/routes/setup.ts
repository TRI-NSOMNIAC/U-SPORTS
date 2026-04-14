import { Router } from 'express'
import { z } from 'zod'
import supabase from '../utils/supabase'

const router = Router()

const setupSchema = z.object({
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

// Check if setup is needed
router.get('/status', async (_req, res) => {
  const { data } = await supabase.from('institution').select('is_setup_complete').single()
  res.json({ setupComplete: data?.is_setup_complete ?? false })
})

// Complete initial setup
router.post('/complete', async (req, res) => {
  try {
    // Check not already setup
    const { data: existing } = await supabase.from('institution').select('is_setup_complete').single()
    if (existing?.is_setup_complete) {
      return res.status(400).json({ error: 'Platform is already set up' })
    }

    const body = setupSchema.parse(req.body)

    // 1. Create super admin auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: body.superAdmin.email,
      password: body.superAdmin.password,
      email_confirm: true,
      user_metadata: { full_name: body.superAdmin.full_name, role: 'super_admin' },
    })
    if (authError) throw new Error(authError.message)

    // 2. Upsert profile with super_admin role
    await supabase.from('profiles').upsert({
      id: authData.user.id,
      email: body.superAdmin.email,
      full_name: body.superAdmin.full_name,
      role: 'super_admin',
    })

    // 3. Upsert institution
    const { error: instError } = await supabase.from('institution').upsert({
      ...body.institution,
      is_setup_complete: true,
    })
    if (instError) throw new Error(instError.message)

    // 4. Activate selected sports
    await supabase.from('sports_config').update({ is_active: false }).neq('slug', 'NONE')
    await supabase.from('sports_config').update({ is_active: true }).in('slug', body.activeSports)

    // 5. Create first season
    await supabase.from('seasons').insert({
      name: body.season.name,
      status: 'active',
      start_date: body.season.start_date,
      end_date: body.season.end_date,
      created_by: authData.user.id,
    })

    res.json({ success: true, message: 'Platform setup complete' })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Setup failed'
    res.status(400).json({ error: message })
  }
})

export default router
