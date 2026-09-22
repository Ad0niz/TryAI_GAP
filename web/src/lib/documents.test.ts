import { describe, expect, it } from 'vitest';
import {
  BACKEND_DOCUMENT_BYTES,
  documentKind,
  exceedsBackendCap,
  formatBytes,
  MAX_DOCUMENT_BYTES,
  validateDocumentFile,
} from './documents';

const PDF = 'application/pdf';
const PNG = 'image/png';

describe('document validation (1 GB client-side cap)', () => {
  it('accepts a file exactly at the 1 GB limit', () => {
    expect(validateDocumentFile({ size: MAX_DOCUMENT_BYTES, type: PDF })).toEqual({ ok: true });
  });

  it('rejects a file one byte over the 1 GB limit', () => {
    expect(validateDocumentFile({ size: MAX_DOCUMENT_BYTES + 1, type: PDF })).toEqual({
      ok: false,
      error: 'too_large',
    });
  });

  it('rejects unsupported mime types regardless of size', () => {
    expect(validateDocumentFile({ size: 100, type: 'text/plain' })).toEqual({
      ok: false,
      error: 'unsupported_type',
    });
    expect(validateDocumentFile({ size: 100, type: '' })).toEqual({
      ok: false,
      error: 'unsupported_type',
    });
  });

  it('accepts every backend-supported type', () => {
    const types = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/png',
      'image/jpeg',
    ];
    for (const type of types) {
      expect(validateDocumentFile({ size: 1024, type })).toEqual({ ok: true });
    }
  });

  it('flags files above the dev-backend 25 MB cap for the warning hint', () => {
    expect(exceedsBackendCap(BACKEND_DOCUMENT_BYTES)).toBe(false);
    expect(exceedsBackendCap(BACKEND_DOCUMENT_BYTES + 1)).toBe(true);
    expect(exceedsBackendCap(10 * 1024 * 1024)).toBe(false);
  });
});

describe('documentKind', () => {
  it('maps mime types to icon kinds', () => {
    expect(documentKind(PDF)).toBe('pdf');
    expect(documentKind('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('doc');
    expect(documentKind('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('sheet');
    expect(documentKind(PNG)).toBe('image');
    expect(documentKind('application/zip')).toBe('other');
  });
});

describe('formatBytes', () => {
  it('formats across units', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(25 * 1024 * 1024)).toBe('25.0 MB');
    expect(formatBytes(MAX_DOCUMENT_BYTES)).toBe('1.00 GB');
    expect(formatBytes(-5)).toBe('—');
  });
});
