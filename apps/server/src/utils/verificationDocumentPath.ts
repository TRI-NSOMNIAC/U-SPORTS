const BUCKET = 'verification-documents'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Resolve object path inside verification-documents from a stored URL or raw path. */
export function objectPathFromStoredFileReference(ref: string): string | null {
  const trimmed = ref.trim()
  if (!trimmed) return null

  if (!/^https?:\/\//i.test(trimmed)) {
    const owner = trimmed.split('/')[0] ?? ''
    if (!UUID_RE.test(owner)) return null
    return trimmed
  }

  try {
    const u = new URL(trimmed)
    const segments = u.pathname.split('/').filter(Boolean)
    const idx = segments.indexOf(BUCKET)
    if (idx === -1 || idx >= segments.length - 1) return null
    const sub = segments
      .slice(idx + 1)
      .map((s) => decodeURIComponent(s))
      .join('/')
    const first = sub.split('/')[0] ?? ''
    if (!UUID_RE.test(first)) return null
    return sub
  } catch {
    return null
  }
}
