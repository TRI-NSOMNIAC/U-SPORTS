import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth'
import supabase from '../utils/supabase'

const router = Router()

router.get('/', async (req, res) => {
  let query = supabase
    .from('insights')
    .select('*')
    .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
    .order('created_at', { ascending: false })

  if (req.query.sport) query = query.eq('sport', req.query.sport as string)
  if (req.query.entity_type) query = query.eq('entity_type', req.query.entity_type as string)
  if (req.query.entity_id) query = query.eq('entity_id', req.query.entity_id as string)

  const { data, error } = await query.limit(20)
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

export default router
