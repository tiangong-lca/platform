import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EVENT_TYPES = new Set([
  'pointerdown',
  'mousedown',
  'mouseup',
  'click',
  'input',
  'change',
  'blur',
]);
const BROWSERS = new Set(['chromium', 'firefox', 'webkit']);
const numericValue = (value: unknown) =>
  typeof value === 'string' && /^\d{0,3}(?:\.\d{0,3})?$/.test(value) ? value : '[invalid]';
const count = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 100
    ? value
    : null;
const nullableBoolean = (value: unknown) => (typeof value === 'boolean' ? value : null);
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

// This sanitizer is the artifact boundary. Never serialize browser objects directly.
export function sanitizeSyntheticAllocationDiagnostic(value: unknown) {
  const source = record(value);
  if (source.captureError !== undefined) return { captureError: 'DOM_CAPTURE_FAILED' };
  return {
    events: (Array.isArray(source.events) ? source.events.slice(0, 40) : []).flatMap((raw) => {
      const event = record(raw);
      if (
        typeof event.type !== 'string' ||
        !EVENT_TYPES.has(event.type) ||
        (event.control !== 'fraction' && event.control !== 'ok')
      )
        return [];
      return [
        {
          type: event.type,
          control: event.control,
          ...(event.control === 'fraction' ? { value: numericValue(event.value) } : {}),
          trusted: event.trusted === true,
        },
      ];
    }),
    modalAttached: nullableBoolean(source.modalAttached),
    modalHidden: nullableBoolean(source.modalHidden),
    fractionDomValue:
      source.fractionDomValue === null ? null : numericValue(source.fractionDomValue),
    okDisabled: nullableBoolean(source.okDisabled),
    errorAlertCount: count(source.errorAlertCount),
    checkedRowCount: count(source.checkedRowCount),
    modalMotion: [
      ...new Set(
        (Array.isArray(source.modalMotion) ? source.modalMotion.slice(0, 10) : []).flatMap(
          (raw) => {
            const match = typeof raw === 'string' ? /-(appear|enter|leave)(?:-|$)/.exec(raw) : null;
            return match ? [match[1]] : [];
          },
        ),
      ),
    ],
    committedReactValue: 'not-observed',
    handlerStages: 'not-observed',
  };
}

export async function writeSyntheticAllocationDiagnostic({
  qualification,
  backendOrigin,
  frontendUrl,
  browser,
  outputDirectory,
  diagnostic,
}: {
  qualification: string | undefined;
  backendOrigin: string;
  frontendUrl: string;
  browser: string;
  outputDirectory: string;
  diagnostic: unknown;
}) {
  const frontend = new URL(frontendUrl);
  if (
    qualification !== 'true' ||
    backendOrigin !== 'https://semantic-harness.invalid' ||
    frontend.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(frontend.hostname) ||
    frontend.username ||
    frontend.password ||
    !BROWSERS.has(browser)
  )
    throw new Error('Synthetic allocation diagnostic boundary required.');
  const body = JSON.stringify(
    {
      schemaVersion: 'tiangong.synthetic-allocation-diagnostic.v1',
      browser,
      scope: 'reserved-origin-synthetic-process-allocation',
      diagnostic: sanitizeSyntheticAllocationDiagnostic(diagnostic),
    },
    null,
    2,
  );
  if (Buffer.byteLength(body) > 12_000)
    throw new Error('Synthetic allocation diagnostic too large.');
  await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
  await writeFile(
    path.join(outputDirectory, `process-allocation-diagnostics-${browser}.json`),
    body,
    {
      encoding: 'utf8',
      mode: 0o600,
    },
  );
}
