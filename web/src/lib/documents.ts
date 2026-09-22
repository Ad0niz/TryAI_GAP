/**
 * Document (evidence) helpers: client-side validation, formatting, icons.
 *
 * Product decision: the UI enforces a 1 GB client-side cap. The current dev
 * backend streams uploads into memory and rejects files > 25 MB
 * (413 FILE_TOO_LARGE) — the UI surfaces that error separately.
 */

/** Client-side upload cap: 1 GB (per product spec). */
export const MAX_DOCUMENT_BYTES = 1024 * 1024 * 1024;

/** Dev-backend hard cap (413 FILE_TOO_LARGE above this). */
export const BACKEND_DOCUMENT_BYTES = 25 * 1024 * 1024;

/** MIME types accepted by the backend (mirror of ALLOWED_TYPES). */
export const ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
] as const;

export const ACCEPT_ATTR =
  '.pdf,.docx,.xlsx,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg,' +
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document,' +
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export type DocumentValidationError = 'too_large' | 'unsupported_type';

export type DocumentValidation =
  | { ok: true }
  | { ok: false; error: DocumentValidationError };

export function validateDocumentFile(file: {
  size: number;
  type: string;
}): DocumentValidation {
  if (file.size > MAX_DOCUMENT_BYTES) return { ok: false, error: 'too_large' };
  if (!(ACCEPTED_MIME_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, error: 'unsupported_type' };
  }
  return { ok: true };
}

/** Whether the dev backend will accept this size (warn the user otherwise). */
export function exceedsBackendCap(size: number): boolean {
  return size > BACKEND_DOCUMENT_BYTES;
}

export type DocumentKind = 'pdf' | 'doc' | 'sheet' | 'image' | 'other';

export function documentKind(mimeType: string): DocumentKind {
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.includes('wordprocessingml')) return 'doc';
  if (mimeType.includes('spreadsheetml')) return 'sheet';
  if (mimeType.startsWith('image/')) return 'image';
  return 'other';
}

/** Human-readable file size (B/KB/MB/GB, one decimal from MB up). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}
