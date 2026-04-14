import { Router } from 'express'
import supabase from '../utils/supabase'

const router = Router()

// Validate email domain
router.post('/validate-domain', async (req, res) => {
  const { email } = req.body
  if (!email) return res.status(400).json({ error: 'Email required' })

  const { data: institution } = await supabase.from('institution').select('staff_email_domain, student_email_domain').single()
  if (!institution) return res.status(500).json({ error: 'Institution not configured' })

  const isStaff = email.endsWith(`@${institution.staff_email_domain}`)
  const isStudent = email.endsWith(`@${institution.student_email_domain}`)

  if (!isStaff && !isStudent) {
    return res.status(400).json({
      error: `Invalid email domain. Use @${institution.student_email_domain} for athletes or @${institution.staff_email_domain} for staff.`,
    })
  }

  res.json({ valid: true, type: isStaff ? 'staff' : 'athlete' })
})

export default router
