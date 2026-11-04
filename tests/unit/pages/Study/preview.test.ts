import { createHash, webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';
import view from '../../../fixtures/study-report/view-v1.json';
import context from '../../../fixtures/study-report/context-v1.json';
import { renderStudyPreview } from '@/pages/Study/preview';
import { renderReport } from '@/standalone/studyReport';

beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  Object.defineProperty(globalThis, 'TextEncoder', { value: TextEncoder, configurable: true });
});
it('shares validated exact content while framing online previews without invented export identity or receipt', () => {
  const html = renderStudyPreview(view);
  expect(html).toContain('Online report preview');
  expect(html).toContain('not an exported or verified reading copy');
  expect(html).toContain(view.report.contentHash);
  expect(html).not.toContain('Export ' + context.exportId);
  expect(html).not.toContain('exporter recorded verification');
  expect(html).not.toContain('Projection SHA-256');
  expect(html).toContain('lang="en-US"');
  expect(html).toContain('Unknown');
  expect(html).toContain('Characterized subtotal');
  const changed = JSON.parse(JSON.stringify(view));
  changed.report.title = '<script>literal</script>';
  expect(renderStudyPreview(changed)).toContain('&lt;script&gt;literal&lt;/script&gt;');
  expect(() => renderStudyPreview({ ...view, extra: 'rejected' })).toThrow();
});
it('preserves exact pre-P3 export HTML bytes for the frozen baseline fixture', async () => {
  const html = await renderReport(view, context);
  expect(Buffer.byteLength(html)).toBe(16233);
  expect(createHash('sha256').update(html).digest('hex')).toBe(
    '0f90d5ef51adc47a78f1bfdd0e6ce4fba23b9f01e1224d1df3709e0286b2a4b6',
  );
});
