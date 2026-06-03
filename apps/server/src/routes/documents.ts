import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, AuthRequest } from '../middleware/auth'
import supabase from '../utils/supabase'
import { writeAuditLog } from '../utils/writeAuditLog'
import { objectPathFromStoredFileReference } from '../utils/verificationDocumentPath'

const router = Router()

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Short-lived signed URL for private COR / medical uploads in verification-documents. */
router.post('/verification-signed-url', requireAuth, async (req: AuthRequest, res) => {
  const parsed = z.object({ file_url: z.string().min(1) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'file_url required' })

  const storagePath = objectPathFromStoredFileReference(parsed.data.file_url)
  if (!storagePath) return res.status(400).json({ error: 'Unrecognized file reference' })

  const ownerId = storagePath.split('/')[0]
  if (!ownerId || !UUID_RE.test(ownerId)) {
    return res.status(400).json({ error: 'Invalid storage path' })
  }

  const staff = req.user!.role === 'Organizer' || req.user!.role === 'Admin' || req.user!.role === 'Coach'
  const own = req.user!.id === ownerId
  if (!staff && !own) {
    return res.status(403).json({ error: 'You can only open your own documents' })
  }

  const { data, error } = await supabase.storage.from('verification-documents').createSignedUrl(storagePath, 600)
  if (error || !data?.signedUrl) {
    return res.status(500).json({ error: error?.message ?? 'Could not create view link' })
  }

  if (staff && !own) {
    await writeAuditLog({
      actorId: req.user!.id,
      action: 'verification_document_view_link_issued',
      entityType: 'profile',
      entityId: ownerId,
      details: {},
    })
  }

  res.json({ url: data.signedUrl })
})

export default router
