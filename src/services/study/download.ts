import { expectType, review, StudyRequestError } from './api';

/** Download current server-authorized frozen bytes; do not present a local authenticity claim. */
export async function downloadStudyExport(kind: 'export' | 'share', id: string) {
  const response =
    kind === 'share'
      ? expectType(await review({ operation: 'share.download', shareId: id }), 'download')
      : expectType(await review({ operation: 'export.download', exportId: id }), 'exportDownload');
  const reference =
    response.type === 'download' ? response.share.bundleRef : response.export.bundleRef;
  const bytes = Uint8Array.from(atob(response.bytes), (character) => character.charCodeAt(0));
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  if (bytes.length !== reference.byteSize || digest !== reference.contentHash)
    throw new StudyRequestError('REFERENCE_MISMATCH', false);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `study-${kind}-${id}.zip`;
  try {
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
