import { supabase } from './supabase'

const MAX_COR_BYTES = 5 * 1024 * 1024

/** Upload or replace enrollment COR in Storage + `student_documents` (student's own session / RLS). */
export async function uploadEnrollmentCor(profileId: string, file: File): Promise<{ file_url: string; uploaded_at: string | null }> {
  if (file.size > MAX_COR_BYTES) throw new Error('Document must be 5MB or smaller')
  const ext = file.name.includes('.') ? (file.name.split('.').pop() ?? 'pdf') : 'pdf'
  const path = `${profileId}/cor.${ext}`
  const { error: uploadError } = await supabase.storage.from('verification-documents').upload(path, file, { upsert: true })
  if (uploadError) throw new Error(uploadError.message)
  const { data: urlData } = supabase.storage.from('verification-documents').getPublicUrl(path)
  const publicUrl = urlData.publicUrl

  const { data: existingCor } = await supabase
    .from('student_documents')
    .select('id')
    .eq('profile_id', profileId)
    .eq('document_type', 'cor')
    .maybeSingle()

  const uploaded_at = new Date().toISOString()
  if (existingCor?.id) {
    const { error: docUp } = await supabase
      .from('student_documents')
      .update({ file_url: publicUrl, uploaded_at })
      .eq('id', existingCor.id)
    if (docUp) throw new Error(docUp.message)
  } else {
    const { error: docError } = await supabase.from('student_documents').insert({
      profile_id: profileId,
      document_type: 'cor',
      file_url: publicUrl,
      uploaded_at,
    })
    if (docError) throw new Error(docError.message)
  }

  return { file_url: publicUrl, uploaded_at }
}
