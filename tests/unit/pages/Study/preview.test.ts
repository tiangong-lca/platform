import { webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';
import view from '../../../fixtures/study-report/view-v1.json';
import currentView from '../../../fixtures/study-report/view-v2.json';
import advancedView from '../../../fixtures/study-report/view-advanced-v2.json';
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
it('dispatches old and new previews without relabelling either projection or export artifact', async () => {
  const original = JSON.stringify(view);
  expect(renderStudyPreview(view)).toContain('Cement at the factory gate');
  expect(JSON.stringify(view)).toBe(original);
  expect(renderStudyPreview(currentView)).toContain('Cement at the factory gate');
  expect(renderStudyPreview(advancedView)).toContain('No LCIA method');
  expect(() => renderStudyPreview({ ...view, rendererVersion: '99' })).toThrow();
  for (const invalid of [null, 'not a projection', {}]) {
    expect(() => renderStudyPreview(invalid)).toThrow();
  }
  await expect(renderReport(view, context)).rejects.toThrow('/version');
  expect(await renderReport(currentView, context)).toContain('Renderer 2.0.0');
});

it('binds online chapter navigation to srcdoc while preserving portable links and trust controls', async () => {
  for (const projection of [view, currentView, advancedView]) {
    const original = JSON.stringify(projection);
    const html = renderStudyPreview(projection);
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const links = [...parsed.querySelectorAll('nav a')];
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      'about:srcdoc#scope',
      'about:srcdoc#results',
      'about:srcdoc#evidence',
      'about:srcdoc#identity',
    ]);
    for (const link of links)
      expect(parsed.getElementById(link.getAttribute('href')!.split('#')[1])).not.toBeNull();
    expect(parsed.querySelector('base')).toBeNull();
    expect(
      parsed.querySelector('meta[http-equiv="Content-Security-Policy"]')!.getAttribute('content'),
    ).toContain("base-uri 'none'; form-action 'none'");
    expect(JSON.stringify(projection)).toBe(original);
  }
  const portable = await renderReport(currentView, context);
  expect(portable).toContain('href="#results"');
  expect(portable).not.toContain('about:srcdoc');
});
