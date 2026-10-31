import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import type { Page } from '@playwright/test';

import {
  BASENAME,
  LIMITS,
  assertReport,
} from '../../../scripts/e2e/mobile-navigation-diagnostic.cjs';
import ts from '../../../scripts/typescript-native-parser.mjs';
import {
  finishMobileNavigationObserver,
  installMobileNavigationObserver,
  withMobileNavigationDiagnostics,
} from '../../e2e/i18n/mobile-navigation-observer';
import { runtimeFixture } from './fixtures/mobileNavigationRuntime';

function inertPage() {
  const listeners = new Map<string, Set<(...args: any[]) => void>>();
  const page = {
    url: jest.fn(() => 'http://127.0.0.1:8000/#/mydata/processes'),
    on: jest.fn((event: string, handler: (...args: any[]) => void) => {
      const set = listeners.get(event) || new Set();
      set.add(handler);
      listeners.set(event, set);
    }),
    off: jest.fn((event: string, handler: (...args: any[]) => void) => {
      listeners.get(event)?.delete(handler);
    }),
    evaluate: jest.fn(async (fn: (arg?: any) => any, arg?: any) => fn(arg)),
  };
  return {
    page: page as unknown as Page,
    raw: page,
    listeners,
    emit(event: string, value: unknown) {
      listeners.get(event)?.forEach((handler) => handler(value));
    },
  };
}

const ENV_KEYS = [
  'E2E_QUALIFICATION',
  'E2E_RELEASE_MODE',
  'E2E_ALLOW_PRODUCTION_DATA',
  'E2E_WRITE_VERIFIED_EVIDENCE',
  'E2E_CANDIDATE_MANIFEST_PATH',
  'E2E_ENVIRONMENT_CONTRACT_PATH',
  'E2E_OUTPUT_PATH',
];

describe('mobile navigation observer inert privacy and error-precedence controls', () => {
  let originalEnvironment: Record<string, string | undefined>;
  let animationDescriptor: PropertyDescriptor | undefined;
  beforeEach(() => {
    originalEnvironment = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
    ENV_KEYS.forEach((key) => delete process.env[key]);
    animationDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'getAnimations');
    Object.defineProperty(Element.prototype, 'getAnimations', {
      configurable: true,
      value: () => [],
    });
    jest
      .spyOn(HTMLElement.prototype, 'getClientRects')
      .mockReturnValue([{}] as unknown as DOMRectList);
    jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 10,
      bottom: 10,
      width: 10,
      height: 10,
    } as DOMRect);
    document.body.innerHTML =
      '<button class="tg-pro-layout-mobile-menu-action">synthetic-private-text</button>' +
      '<input value="synthetic-private-input" aria-label="https://synthetic.invalid/private">' +
      '<div class="ant-drawer ant-drawer-open" tabindex="-1"><div class="ant-drawer-content-wrapper"><section class="ant-pro-drawer-sider" role="dialog" tabindex="-1"></section></div></div>';
  });
  afterEach(() => {
    finishMobileNavigationObserver();
    if (animationDescriptor)
      Object.defineProperty(Element.prototype, 'getAnimations', animationDescriptor);
    else delete (Element.prototype as any).getAnimations;
    jest.restoreAllMocks();
    document.body.innerHTML = '';
    for (const key of ENV_KEYS) {
      if (originalEnvironment[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnvironment[key];
    }
  });

  it('observes synthetic Enter/Escape phases without changing their default or persisting private content', () => {
    const button = document.querySelector('button')!;
    button.focus();
    const documentAdd = jest.spyOn(document, 'addEventListener');
    const windowAdd = jest.spyOn(window, 'addEventListener');
    const documentRemove = jest.spyOn(document, 'removeEventListener');
    const windowRemove = jest.spyOn(window, 'removeEventListener');
    installMobileNavigationObserver(LIMITS);
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    const escape = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
      isComposing: true,
    });
    button.dispatchEvent(enter);
    button.dispatchEvent(escape);
    button.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'synthetic-private-key', bubbles: true }),
    );
    const capture = finishMobileNavigationObserver()!;
    expect(capture.disposed).toBe(true);
    expect(capture.records.map(({ stage, key }) => [stage, key])).toEqual([
      ['initial', 'none'],
      ['document-capture', 'enter'],
      ['window-bubble', 'enter'],
      ['document-capture', 'escape'],
      ['window-bubble', 'escape'],
    ]);
    expect(capture.records.slice(1).every((entry) => entry.trusted === false)).toBe(true);
    expect(capture.records.slice(-2).every((entry) => entry.composing)).toBe(true);
    expect(capture.final?.focus).toBe('menu-action');
    expect(capture.final?.state).toMatchObject({
      navigationCount: 1,
      navigationVisibleCount: 1,
      navigationOpenCount: 1,
      navigationMotionCount: 0,
    });
    expect(enter.defaultPrevented || escape.defaultPrevented).toBe(false);
    const serialized = JSON.stringify(capture);
    expect(serialized).not.toMatch(/synthetic-private|https:|aria-label|input|innerHTML/u);
    expect(documentAdd).toHaveBeenCalledWith('keydown', expect.any(Function), {
      capture: true,
      passive: true,
    });
    expect(windowAdd).toHaveBeenCalledWith('keydown', expect.any(Function), { passive: true });
    expect(documentRemove).toHaveBeenCalledWith('keydown', expect.any(Function), true);
    expect(windowRemove).toHaveBeenCalledWith('keydown', expect.any(Function), false);
    expect(finishMobileNavigationObserver()).toBeUndefined();
  });

  it.each([
    ['transparent-positive-box', 0, 10, 10, 'visible', 1],
    ['zero-width-with-client-rect', 1, 0, 10, 'visible', 0],
    ['zero-height-with-client-rect', 1, 10, 0, 'visible', 0],
    ['hidden-positive-box', 1, 10, 10, 'hidden', 0],
  ] as const)(
    'uses the bounded overlay-box metric for %s',
    (_label, opacity, width, height, visibility, expected) => {
      const section = document.querySelector<HTMLElement>('.ant-pro-drawer-sider')!;
      section.style.opacity = String(opacity);
      section.style.visibility = visibility;
      jest.spyOn(section, 'getBoundingClientRect').mockReturnValue({ width, height } as DOMRect);
      installMobileNavigationObserver(LIMITS);
      expect(finishMobileNavigationObserver()?.final?.state.navigationVisibleCount).toBe(expected);
    },
  );

  it('takes navigation open state from its own nearest drawer root', () => {
    document.body.innerHTML =
      '<div class="ant-drawer ant-drawer-open"><div class="ant-drawer"><section class="ant-pro-drawer-sider" role="dialog"></section></div></div>';
    installMobileNavigationObserver(LIMITS);
    expect(finishMobileNavigationObserver()?.final?.state.navigationOpenCount).toBe(0);
  });

  it.each([
    ['owned-root', 'navigation'],
    ['section', 'navigation'],
    ['section-child', 'navigation'],
    ['unrelated-outer', 'other'],
    ['unrelated-nested', 'other-overlay'],
  ])('classifies native-shaped focus on %s without adopting unrelated drawers', (id, expected) => {
    document.body.innerHTML =
      '<div class="ant-drawer ant-drawer-open" id="unrelated-outer" tabindex="-1">' +
      '<div class="ant-drawer ant-drawer-open" id="owned-root" tabindex="-1"><div class="ant-drawer-content-wrapper">' +
      '<section class="ant-pro-drawer-sider" role="dialog" id="section" tabindex="-1"><button id="section-child"></button>' +
      '<div class="ant-drawer" id="unrelated-nested" tabindex="-1"></div></section></div></div></div>';
    document.getElementById(id)!.focus();
    installMobileNavigationObserver(LIMITS);
    expect(finishMobileNavigationObserver()?.final?.focus).toBe(expected);
  });

  it.each([
    ['http-ipv4', 'http://127.0.0.1:8000/#/synthetic-private-url'],
    ['https-localhost', 'https://localhost:8443/#/synthetic-private-url'],
    ['http-ipv6', 'http://[::1]:8000/#/synthetic-private-url'],
  ])('checks supported %s Page.url before attaching any listener', async (_label, url) => {
    const fixture = runtimeFixture();
    Object.assign(process.env, fixture.env);
    jest.spyOn(process, 'cwd').mockReturnValue(fixture.root);
    const fake = inertPage();
    fake.raw.url.mockReturnValue(url);
    try {
      await withMobileNavigationDiagnostics(fake.page, async () => undefined);
      expect(fake.raw.url.mock.invocationCallOrder[0]).toBeLessThan(
        fake.raw.on.mock.invocationCallOrder[0],
      );
      const report = assertReport(
        JSON.parse(fs.readFileSync(path.join(fixture.outputDirectory, BASENAME), 'utf8')),
      );
      expect(report.captureStatus).toBe('complete');
      expect(JSON.stringify(report)).not.toContain('synthetic-private-url');
    } finally {
      fs.rmSync(fixture.directory, { recursive: true, force: true });
    }
  });

  it.each([
    ['external-host', 'https://shared.invalid/synthetic-private-url'],
    ['host-spoof', 'http://127.0.0.1.external.invalid/synthetic-private-url'],
    ['credentials', 'http://synthetic:synthetic@localhost/synthetic-private-url'],
    ['file-scheme', 'file:///synthetic-private-url'],
    ['blank-page', 'about:blank'],
    ['data-scheme', 'data:text/html,synthetic-private-url'],
    ['invalid-url', 'synthetic-private-url'],
  ])(
    'rejects %s capture without attaching listeners or replacing the original failure',
    async (_label, url) => {
      const fixture = runtimeFixture();
      Object.assign(process.env, fixture.env);
      jest.spyOn(process, 'cwd').mockReturnValue(fixture.root);
      const fake = inertPage();
      fake.raw.url.mockReturnValue(url);
      const original = new Error('original-step-error');
      const step = jest.fn(async () => {
        throw original;
      });
      try {
        await expect(withMobileNavigationDiagnostics(fake.page, step)).rejects.toBe(original);
        expect(step).toHaveBeenCalledTimes(1);
        expect(fake.raw.on).not.toHaveBeenCalled();
        expect(fake.raw.evaluate).not.toHaveBeenCalled();
        const report = assertReport(
          JSON.parse(fs.readFileSync(path.join(fixture.outputDirectory, BASENAME), 'utf8')),
        );
        expect(report.captureStatus).toBe('invalid');
        expect(JSON.stringify(report)).not.toContain(url);
      } finally {
        fs.rmSync(fixture.directory, { recursive: true, force: true });
      }
    },
  );

  it('fails closed when an otherwise passing step has a rejected Page.url', async () => {
    const fixture = runtimeFixture();
    Object.assign(process.env, fixture.env);
    jest.spyOn(process, 'cwd').mockReturnValue(fixture.root);
    const fake = inertPage();
    fake.raw.url.mockReturnValue('https://shared.invalid/synthetic-private-url');
    const step = jest.fn(async () => undefined);
    try {
      await expect(withMobileNavigationDiagnostics(fake.page, step)).rejects.toThrow(
        'Mandatory mobile navigation diagnostic capture failed.',
      );
      expect(step).toHaveBeenCalledTimes(1);
      expect(fake.raw.on).not.toHaveBeenCalled();
      expect(fake.raw.evaluate).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(fixture.directory, { recursive: true, force: true });
    }
  });

  it('bounds event storage, inspected overlays and animation enumeration without polling or mutation observers', () => {
    installMobileNavigationObserver(LIMITS);
    for (let index = 0; index < 30; index++)
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const limited = finishMobileNavigationObserver()!;
    expect(limited.records).toHaveLength(48);
    expect(limited.recordOverflow).toBe(true);
    for (let index = 0; index <= LIMITS.nodes; index++) {
      const element = document.createElement('div');
      element.setAttribute('role', 'dialog');
      document.body.appendChild(element);
    }
    Object.defineProperty(Element.prototype, 'getAnimations', {
      configurable: true,
      value: () => Array.from({ length: 33 }, () => ({ playState: 'running' })),
    });
    installMobileNavigationObserver(LIMITS);
    const nodes = finishMobileNavigationObserver()!;
    expect(nodes.countOverflow).toBe(true);
    expect(nodes.final?.state.dialogVisibleCount).toBe(32);
    expect(nodes.final?.state.navigationMotionCount).toBe(1);
    const observerSource = fs.readFileSync(
      path.join(process.cwd(), 'tests/e2e/i18n/mobile-navigation-observer.ts'),
      'utf8',
    );
    expect(observerSource).not.toMatch(
      /MutationObserver|setTimeout|setInterval|waitFor|preventDefault\(|stopPropagation\(/u,
    );
  });

  it('serializes the browser functions without relying on Node or module closures', () => {
    const context = vm.createContext({
      window,
      document,
      performance,
      getComputedStyle: window.getComputedStyle.bind(window),
      limits: LIMITS,
    });
    vm.runInContext(`(${installMobileNavigationObserver.toString()})(limits)`, context, {
      timeout: 1000,
    });
    const observed = vm.runInContext(`(${finishMobileNavigationObserver.toString()})()`, context, {
      timeout: 1000,
    });
    const capture = JSON.parse(JSON.stringify(observed));
    expect(capture.disposed).toBe(true);
    expect(capture.records[0].stage).toBe('initial');
    expect(capture.final.state.navigationCount).toBe(1);
    expect(finishMobileNavigationObserver()).toBeUndefined();
  });

  it('runs the original step only once and preserves its exact error despite capture failure', async () => {
    const fixture = runtimeFixture();
    Object.assign(process.env, fixture.env);
    jest.spyOn(process, 'cwd').mockReturnValue(fixture.root);
    const fake = inertPage();
    fake.raw.evaluate.mockRejectedValue(new Error('synthetic-private-observer-error'));
    const original = new Error('original-step-error');
    const step = jest.fn(async () => {
      throw original;
    });
    try {
      await expect(withMobileNavigationDiagnostics(fake.page, step)).rejects.toBe(original);
      expect(step).toHaveBeenCalledTimes(1);
      const report = assertReport(
        JSON.parse(fs.readFileSync(path.join(fixture.outputDirectory, BASENAME), 'utf8')),
      );
      expect(report.originalStepOutcome).toBe('failed');
      expect(report.captureStatus).toBe('invalid');
      expect(JSON.stringify(report)).not.toContain('synthetic-private');
      expect([...fake.listeners.values()].every((set) => set.size === 0)).toBe(true);
    } finally {
      fs.rmSync(fixture.directory, { recursive: true, force: true });
    }
  });

  it('retains the failed-step snapshot and only counts errors without reading their messages', async () => {
    const fixture = runtimeFixture();
    Object.assign(process.env, fixture.env);
    jest.spyOn(process, 'cwd').mockReturnValue(fixture.root);
    const fake = inertPage();
    const original = new Error('original-step-error');
    const message = {
      type: () => 'error',
      text: () => {
        throw new Error('must-not-read-text');
      },
    };
    const pageError = Object.defineProperty({}, 'message', {
      get: () => {
        throw new Error('must-not-read-error');
      },
    });
    try {
      await expect(
        withMobileNavigationDiagnostics(fake.page, async () => {
          fake.emit('console', message);
          fake.emit('pageerror', pageError);
          throw original;
        }),
      ).rejects.toBe(original);
      const report = assertReport(
        JSON.parse(fs.readFileSync(path.join(fixture.outputDirectory, BASENAME), 'utf8')),
      );
      expect(report).toMatchObject({
        originalStepOutcome: 'failed',
        captureStatus: 'complete',
        pageErrorCount: 1,
        consoleErrorCount: 1,
      });
      expect(report.capture.final?.state.navigationVisibleCount).toBe(1);
      expect([...fake.listeners.values()].every((set) => set.size === 0)).toBe(true);
    } finally {
      fs.rmSync(fixture.directory, { recursive: true, force: true });
    }
  });

  it.each(['console-kind', 'listener-cleanup'])(
    'preserves the original failure when %s observation fails',
    async (kind) => {
      const fixture = runtimeFixture();
      Object.assign(process.env, fixture.env);
      jest.spyOn(process, 'cwd').mockReturnValue(fixture.root);
      const fake = inertPage();
      const original = new Error('original-step-error');
      if (kind === 'listener-cleanup')
        fake.raw.off.mockImplementationOnce(() => {
          throw new Error('observer-cleanup-error');
        });
      try {
        await expect(
          withMobileNavigationDiagnostics(fake.page, async () => {
            if (kind === 'console-kind')
              fake.emit('console', {
                type: () => {
                  throw new Error('observer-kind-error');
                },
              });
            throw original;
          }),
        ).rejects.toBe(original);
        const report = assertReport(
          JSON.parse(fs.readFileSync(path.join(fixture.outputDirectory, BASENAME), 'utf8')),
        );
        expect(report).toMatchObject({
          originalStepOutcome: 'failed',
          captureStatus: 'incomplete',
        });
        expect(fake.raw.off).toHaveBeenCalledTimes(2);
      } finally {
        fake.listeners.clear();
        fs.rmSync(fixture.directory, { recursive: true, force: true });
      }
    },
  );

  it.each(['capture', 'counter-cap', 'manifest', 'write'])(
    'fails closed after an otherwise passing original step when %s diagnostics are invalid',
    async (kind) => {
      const fixture = runtimeFixture();
      Object.assign(process.env, fixture.env);
      jest.spyOn(process, 'cwd').mockReturnValue(fixture.root);
      const fake = inertPage();
      const step = jest.fn(async () => {
        if (kind === 'counter-cap')
          for (let index = 0; index < 260; index++) fake.emit('console', { type: () => 'error' });
      });
      if (kind === 'capture') fake.raw.evaluate.mockRejectedValue(new Error('unavailable'));
      if (kind === 'manifest') fs.writeFileSync(fixture.manifestPath, '{}');
      if (kind === 'write')
        fs.writeFileSync(path.join(fixture.outputDirectory, BASENAME), 'retained');
      try {
        await expect(withMobileNavigationDiagnostics(fake.page, step)).rejects.toThrow(
          'Mandatory mobile navigation diagnostic capture failed.',
        );
        expect(step).toHaveBeenCalledTimes(1);
        expect([...fake.listeners.values()].every((set) => set.size === 0)).toBe(true);
        const counterReport =
          kind === 'counter-cap'
            ? assertReport(
                JSON.parse(fs.readFileSync(path.join(fixture.outputDirectory, BASENAME), 'utf8')),
              )
            : null;
        expect(
          counterReport && {
            captureStatus: counterReport.captureStatus,
            consoleErrorCount: counterReport.consoleErrorCount,
            counterOverflow: counterReport.counterOverflow,
          },
        ).toEqual(
          kind === 'counter-cap'
            ? {
                captureStatus: 'incomplete',
                consoleErrorCount: 255,
                counterOverflow: true,
              }
            : null,
        );
        expect(
          kind === 'write'
            ? fs.readFileSync(path.join(fixture.outputDirectory, BASENAME), 'utf8')
            : null,
        ).toBe(kind === 'write' ? 'retained' : null);
      } finally {
        fs.rmSync(fixture.directory, { recursive: true, force: true });
      }
    },
  );

  it('does not instrument nonqualification or nonrelease executions', async () => {
    const fake = inertPage();
    const step = jest.fn(async () => undefined);
    await withMobileNavigationDiagnostics(fake.page, step);
    process.env.E2E_QUALIFICATION = 'true';
    await withMobileNavigationDiagnostics(fake.page, step);
    expect(step).toHaveBeenCalledTimes(2);
    expect(fake.raw.evaluate).not.toHaveBeenCalled();
    expect(fake.raw.on).not.toHaveBeenCalled();
  });

  it('preserves the original mobile action/assertion AST and existing artifact privacy allowlists', () => {
    const relative = 'tests/e2e/i18n/responsive-layout.spec.ts';
    const source = ts.createSourceFile(
      relative,
      fs.readFileSync(path.join(process.cwd(), relative), 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const original = ts.createSourceFile(
      'original.ts',
      `async function originalStep() {${fs.readFileSync(path.join(__dirname, 'fixtures/mobile-navigation-original-step.fixture'), 'utf8')}}`,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    expect(source.parseDiagnostics).toEqual([]);
    expect(original.parseDiagnostics).toEqual([]);
    const callbacks: any[] = [];
    const visit = (node: any) => {
      if (
        ts.isCallExpression(node) &&
        node.expression.getText(source) === 'withMobileNavigationDiagnostics'
      ) {
        callbacks.push(node.arguments[1]);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    const fingerprint = (node: any, file: any): any => {
      const children: any[] = [];
      ts.forEachChild(node, (child) => {
        children.push(fingerprint(child, file));
      });
      return [node.kind, ...(children.length ? children : [node.getText(file)])];
    };
    expect(callbacks).toHaveLength(1);
    expect(ts.isArrowFunction(callbacks[0])).toBe(true);
    expect(ts.isBlock(callbacks[0].body)).toBe(true);
    expect(fingerprint(callbacks[0].body, source)).toEqual(
      fingerprint((original.statements[0] as any).body, original),
    );
    for (const workflow of ['dependency-pr.yml', 'i18n-semantic-e2e.yml']) {
      const text = fs.readFileSync(path.join(process.cwd(), '.github/workflows', workflow), 'utf8');
      expect(
        text.match(/\.local\/e2e-release\/runs\/\*\*\/mobile-navigation-diagnostic\.json/gu),
      ).toHaveLength(1);
      expect(text).not.toMatch(
        /runs\/\*\*\/\*\.json|test-results|error-context|\.png|\.webm|trace\.zip/u,
      );
    }
  });
});
