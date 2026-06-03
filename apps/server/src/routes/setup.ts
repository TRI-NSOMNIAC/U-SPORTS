import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import supabase from '../utils/supabase'
import {
  INSTITUTION_LOGO_ALLOWED_MIMES,
  INSTITUTION_LOGO_MAX_BYTES,
  uploadInstitutionLogoBuffer,
} from '../utils/institutionLogoStorage'

const router = Router()

const setupLogoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: INSTITUTION_LOGO_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (INSTITUTION_LOGO_ALLOWED_MIMES.has(file.mimetype)) cb(null, true)
    else cb(new Error('Only JPEG, PNG, WebP, or SVG images are allowed'))
  },
})

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
      logo_url: z
        .union([z.string().url(), z.literal(''), z.null()])
        .optional()
        .transform((v) => (v === '' || v === null || v === undefined ? null : v)),
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
    /** When API server has SETUP_SECRET set, must match to complete first-time setup. */
    setupSecret: z.string().optional(),
  })
  .transform((b) => {
    const email = b.superAdmin.email.trim().toLowerCase()
    return {
      ...b,
      superAdmin: { ...b.superAdmin, email },
    }
  })

/** Logo during wizard — unauthenticated; uses service role. Allowed only before setup completes. */
router.post('/logo', (req, res, next) => {
  setupLogoUpload.single('file')(req, res, (err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Upload failed'
    if (err) return res.status(400).json({ error: msg })
    next()
  })
}, async (req, res) => {
  try {
    const { data: existing } = await supabase.from('institution').select('is_setup_complete').maybeSingle()
    if (existing?.is_setup_complete) {
      return res.status(403).json({ error: 'Setup already completed' })
    }

    const expectedSecret = process.env.SETUP_SECRET?.trim()
    if (expectedSecret) {
      const provided = String(req.body?.setupSecret ?? '').trim()
      if (provided !== expectedSecret) {
        return res.status(403).json({ error: 'Invalid or missing setup key. It must match SETUP_SECRET on the API server.' })
      }
    }

    const file = req.file
    if (!file?.buffer) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    const { publicUrl } = await uploadInstitutionLogoBuffer({
      buffer: file.buffer,
      mimetype: file.mimetype,
      folder: 'setup',
    })
    res.json({ logo_url: publicUrl })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Upload failed'
    res.status(400).json({ error: message })
  }
})

// Check if setup is needed (does not reveal SETUP_SECRET value)
router.get('/status', async (_req, res) => {
  const { data } = await supabase.from('institution').select('is_setup_complete').maybeSingle()
  const requiresSetupSecret = Boolean(process.env.SETUP_SECRET?.trim())
  res.json({
    setupComplete: data?.is_setup_complete ?? false,
    requiresSetupSecret,
  })
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

    const expectedSecret = process.env.SETUP_SECRET?.trim()
    if (expectedSecret) {
      const provided = (body.setupSecret ?? '').trim()
      if (provided !== expectedSecret) {
        return res.status(403).json({ error: 'Invalid or missing setup key. It must match SETUP_SECRET on the API server.' })
      }
    }

    if (body.season.end_date < body.season.start_date) {
      return res.status(400).json({ error: 'Season end date must be on or after the start date.' })
    }

    // 1. Create the first admin auth user.
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: body.superAdmin.email,
      password: body.superAdmin.password,
      email_confirm: true,
      app_metadata: { role: 'Admin' },
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
      role: 'Admin',
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
