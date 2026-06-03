import api from './api'

export async function getVerificationSignedUrl(
  fileUrl: string | null | undefined
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const ref = typeof fileUrl === 'string' ? fileUrl.trim() : ''
  if (!ref) return { ok: false, error: 'No file on file' }
  try {
    const { data } = await api.post<{ url: string }>('/documents/verification-signed-url', {
      file_url: ref,
    })
    if (!data?.url) return { ok: false, error: 'Could not get view link' }
    return { ok: true, url: data.url }
  } catch (e: unknown) {
    const msg =
      e && typeof e === 'object' && 'response' in e
        ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
        : undefined
    return { ok: false, error: typeof msg === 'string' ? msg : 'Could not open document' }
  }
}

/** Opens COR / verification uploads from private storage via a signed URL (requires logged-in session). */
export async function openStoredVerificationFile(fileUrl: string | null | undefined): Promise<{ ok: boolean; error?: string }> {
  const r = await getVerificationSignedUrl(fileUrl)
  if (!r.ok) return { ok: false, error: r.error }
  window.open(r.url, '_blank', 'noopener,noreferrer')
  return { ok: true }
}
