import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import type { Page } from '@playwright/test';

import {
  BASENAME,
  LIMITS,
  assertReport,
  assertCapture,
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
  let frames: Map<number, FrameRequestCallback>;
  let nextFrame: number;
  const fireEscape = () =>
    document
      .querySelector('button')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  const runFrame = () => {
    const entry = frames.entries().next().value;
    if (!entry) throw new Error('Expected an owned pending frame.');
    frames.delete(entry[0]);
    entry[1](0);
  };
  beforeEach(() => {
    frames = new Map();
    nextFrame = 0;
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const id = nextFrame++;
      frames.set(id, callback);
      return id;
    });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });
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
    expect(capture.compositionPrehistory).toBe('unknown');
    expect(capture.frame).toEqual({ scheduled: 1, completed: 0, cancelled: 1, triggerSequence: 3 });
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

  it('pairs only the selected first Escape with one frame, overlay details and observed composition history', () => {
    let now = 100;
    jest.spyOn(performance, 'now').mockImplementation(() => now);
    document.body.insertAdjacentHTML(
      'beforeend',
      '<div class="ant-popover ant-zoom-big-leave-active">synthetic-private-popover</div>' +
        '<div class="ant-tooltip ant-zoom-big-fast-leave">synthetic-private-tooltip</div>',
    );
    for (const root of document.querySelectorAll('.ant-popover,.ant-tooltip'))
      Object.defineProperty(root, 'getAnimations', { value: () => [{ playState: 'running' }] });
    installMobileNavigationObserver(LIMITS);
    const end = new CompositionEvent('compositionend', {
      bubbles: true,
      data: 'synthetic-private-composition',
    });
    const dataRead = jest.fn(() => {
      throw new Error('Composition data must never be read.');
    });
    Object.defineProperty(end, 'data', { get: dataRead });
    now = 110;
    window.dispatchEvent(end);
    now = 120;
    fireEscape();
    now = 130;
    fireEscape();
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);
    now = 135;
    window.dispatchEvent(end);
    document.querySelector('.ant-drawer')!.classList.remove('ant-drawer-open');
    now = 140;
    runFrame();
    document.querySelector('.ant-drawer')!.classList.add('ant-drawer-open');
    now = 150;
    const result = finishMobileNavigationObserver()!;
    assertCapture(result);
    expect(result.frame).toEqual({ scheduled: 1, completed: 1, cancelled: 0, triggerSequence: 1 });
    expect(result.details.escapeCapture).toMatchObject({
      recordSequence: 1,
      popover: [1, 1, 1],
      tooltip: [1, 1, 1],
      composition: [1, 10],
    });
    expect(result.details.escapeBubble?.recordSequence).toBe(2);
    expect(result.details.frame).toMatchObject({ recordSequence: 5, composition: [2, 35] });
    expect(result.records[5]).toMatchObject({
      stage: 'post-escape-frame',
      key: 'none',
      trusted: false,
      composing: false,
      defaultPrevented: false,
      state: { navigationOpenCount: 0 },
    });
    expect(result.final?.state.navigationOpenCount).toBe(1);
    expect(result.details.final?.composition).toEqual([2, 35]);
    expect(result.compositionPrehistory).toBe('unknown');
    expect(dataRead).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('synthetic-private');
  });

  it('cancels frame ID zero, ignores late work and keeps duplicate finish isolated from a new owner', () => {
    installMobileNavigationObserver(LIMITS);
    const old = (window as any).__tgMobileNavigationDiagnostic;
    fireEscape();
    const late = frames.get(0)!;
    const result = old.finish();
    const raw = JSON.stringify(result);
    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(0);
    expect(result.frame).toEqual({ scheduled: 1, completed: 0, cancelled: 1, triggerSequence: 1 });
    expect(old.finish()).toBe(result);
    installMobileNavigationObserver(LIMITS);
    const current = (window as any).__tgMobileNavigationDiagnostic;
    late(0);
    expect(old.finish()).toBe(result);
    expect((window as any).__tgMobileNavigationDiagnostic).toBe(current);
    expect(JSON.stringify(result)).toBe(raw);
    expect(finishMobileNavigationObserver()?.frame.scheduled).toBe(0);
    assertCapture(result);
  });

  it('retains a frame when the selected Escape never reaches window bubble', () => {
    installMobileNavigationObserver(LIMITS);
    const stop = (event: KeyboardEvent) => event.stopPropagation();
    document.addEventListener('keydown', stop);
    try {
      fireEscape();
      runFrame();
      const result = finishMobileNavigationObserver()!;
      assertCapture(result);
      expect(result.details.escapeCapture?.recordSequence).toBe(1);
      expect(result.details.escapeBubble).toBeNull();
      expect(result.frame.completed).toBe(1);
    } finally {
      document.removeEventListener('keydown', stop);
    }
  });

  it.each(['before-trigger', 'before-frame'] as const)(
    'retains the 48-record limit at %s',
    (point) => {
      installMobileNavigationObserver(LIMITS);
      if (point === 'before-frame') fireEscape();
      for (let index = 0; index < LIMITS.records; index++)
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      if (point === 'before-trigger') fireEscape();
      else runFrame();
      const result = finishMobileNavigationObserver()!;
      assertCapture(result);
      expect(result.records).toHaveLength(48);
      expect(result.recordOverflow).toBe(true);
      expect(result.details.frame).toBeNull();
      expect(result.frame.scheduled).toBe(point === 'before-frame' ? 1 : 0);
      expect(window.requestAnimationFrame).toHaveBeenCalledTimes(point === 'before-frame' ? 1 : 0);
    },
  );

  it('does not retry a failed RAF registration on a later Escape', () => {
    (window.requestAnimationFrame as jest.Mock).mockImplementationOnce(() => {
      throw new Error('register failed');
    });
    installMobileNavigationObserver(LIMITS);
    fireEscape();
    fireEscape();
    const result = finishMobileNavigationObserver()!;
    assertCapture(result);
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(result.frame).toEqual({
      scheduled: 0,
      completed: 0,
      cancelled: 0,
      triggerSequence: null,
    });
    expect(result.observerErrorCount).toBe(1);
  });

  it('records a failed frame attempt without publishing a partial snapshot', () => {
    installMobileNavigationObserver(LIMITS);
    fireEscape();
    Object.defineProperty(Element.prototype, 'getAnimations', {
      configurable: true,
      value: () => {
        throw new Error('frame snapshot failed');
      },
    });
    runFrame();
    Object.defineProperty(Element.prototype, 'getAnimations', {
      configurable: true,
      value: () => [],
    });
    const result = finishMobileNavigationObserver()!;
    assertCapture(result);
    expect(result.frame.completed).toBe(1);
    expect(result.details.frame).toBeNull();
    expect(result.records.some((record) => record.stage === 'post-escape-frame')).toBe(false);
    expect(result.observerErrorCount).toBe(1);
  });

  it('does not claim successful cancellation when the API throws', () => {
    installMobileNavigationObserver(LIMITS);
    fireEscape();
    const late = frames.get(0)!;
    (window.cancelAnimationFrame as jest.Mock).mockImplementationOnce(() => {
      throw new Error('cancel failed');
    });
    const result = finishMobileNavigationObserver()!;
    const raw = JSON.stringify(result);
    late(0);
    assertCapture(result);
    expect(result.frame).toEqual({ scheduled: 1, completed: 0, cancelled: 0, triggerSequence: 1 });
    expect(result.disposed).toBe(false);
    expect(result.observerErrorCount).toBe(1);
    expect(JSON.stringify(result)).toBe(raw);
  });

  it.each(['document-keydown', 'window-keydown', 'window-compositionend'] as const)(
    'attempts independent cleanup after %s removal fails',
    (target) => {
      const addDocument = jest.spyOn(document, 'addEventListener');
      const addWindow = jest.spyOn(window, 'addEventListener');
      const rawDocumentRemove = document.removeEventListener.bind(document);
      const rawWindowRemove = window.removeEventListener.bind(window);
      installMobileNavigationObserver(LIMITS);
      fireEscape();
      const removeDocument = jest
        .spyOn(document, 'removeEventListener')
        .mockImplementation((type, handler, options) => {
          if (target === 'document-keydown' && type === 'keydown') throw new Error('remove failed');
          rawDocumentRemove(type, handler, options);
        });
      const removeWindow = jest
        .spyOn(window, 'removeEventListener')
        .mockImplementation((type, handler, options) => {
          if (`window-${type}` === target) throw new Error('remove failed');
          rawWindowRemove(type, handler, options);
        });
      try {
        const result = finishMobileNavigationObserver()!;
        assertCapture(result);
        expect(removeDocument).toHaveBeenCalledWith('keydown', expect.any(Function), true);
        expect(removeWindow).toHaveBeenCalledWith('keydown', expect.any(Function), false);
        expect(removeWindow).toHaveBeenCalledWith('compositionend', expect.any(Function), false);
        expect(result.disposed).toBe(false);
        expect(result.observerErrorCount).toBe(1);
        expect((window as any).__tgMobileNavigationDiagnostic).toBeUndefined();
      } finally {
        for (const [type, handler] of addDocument.mock.calls.filter(([type]) => type === 'keydown'))
          rawDocumentRemove(type, handler!, true);
        for (const [type, handler] of addWindow.mock.calls.filter(([type]) =>
          ['keydown', 'compositionend'].includes(type),
        ))
          rawWindowRemove(type, handler!, false);
      }
    },
  );

  it('caps observed composition events and elapsed time without inferring private IME state', () => {
    let now = 0;
    jest.spyOn(performance, 'now').mockImplementation(() => now);
    installMobileNavigationObserver(LIMITS);
    now = LIMITS.elapsedMs + 1;
    for (let index = 0; index < 256; index++)
      window.dispatchEvent(new CompositionEvent('compositionend'));
    const result = finishMobileNavigationObserver()!;
    assertCapture(result);
    expect(result.details.final?.composition).toEqual([255, LIMITS.elapsedMs]);
    expect(result.countOverflow).toBe(true);
    expect(result.records).toHaveLength(1);
    expect(result.compositionPrehistory).toBe('unknown');
    expect(JSON.stringify(result)).not.toMatch(/imeBlocked|imeClear|lastCompositionEndTime/u);
  });

  it('retains unknown prehistory when a composition end never reaches window', () => {
    const stop = (event: Event) => event.stopPropagation();
    document.addEventListener('compositionend', stop);
    try {
      installMobileNavigationObserver(LIMITS);
      document
        .querySelector('input')!
        .dispatchEvent(
          new CompositionEvent('compositionend', { bubbles: true, data: 'synthetic-private' }),
        );
      const result = finishMobileNavigationObserver()!;
      assertCapture(result);
      expect(result.details.final?.composition).toEqual([0, null]);
      expect(result.compositionPrehistory).toBe('unknown');
    } finally {
      document.removeEventListener('compositionend', stop);
    }
  });

  it('shares the selected animation inspection cap across navigation, Popovers and Tooltips', () => {
    document.body.insertAdjacentHTML(
      'beforeend',
      '<div class="ant-popover"></div><div class="ant-tooltip"></div>',
    );
    const wrapper = document.querySelector('.ant-drawer-content-wrapper')!;
    Object.defineProperty(wrapper, 'getAnimations', {
      value: () => Array.from({ length: 31 }, () => ({ playState: 'running' })),
    });
    for (const root of document.querySelectorAll('.ant-popover,.ant-tooltip'))
      Object.defineProperty(root, 'getAnimations', {
        value: () => [{ playState: 'running' }, { playState: 'running' }],
      });
    installMobileNavigationObserver(LIMITS);
    const result = finishMobileNavigationObserver()!;
    assertCapture(result);
    expect(result.details.initial?.popover).toEqual([1, 1, 0]);
    expect(result.details.initial?.tooltip).toEqual([1, 0, 0]);
    expect(result.countOverflow).toBe(true);
  });

  it('does not publish a sample from an inconsistent synchronous RAF replacement', () => {
    (window.requestAnimationFrame as jest.Mock).mockImplementationOnce((callback) => {
      callback(0);
      return 0;
    });
    installMobileNavigationObserver(LIMITS);
    fireEscape();
    const result = finishMobileNavigationObserver()!;
    assertCapture(result);
    expect(result.observerErrorCount).toBe(1);
    expect(result.details.frame).toBeNull();
  });

  it('does not delete a replacement owner when the old live handle finishes', () => {
    installMobileNavigationObserver(LIMITS);
    const old = (window as any).__tgMobileNavigationDiagnostic;
    delete (window as any).__tgMobileNavigationDiagnostic;
    installMobileNavigationObserver(LIMITS);
    const current = (window as any).__tgMobileNavigationDiagnostic;
    const result = old.finish();
    expect((window as any).__tgMobileNavigationDiagnostic).toBe(current);
    const raw = JSON.stringify(result);
    window.dispatchEvent(new CompositionEvent('compositionend'));
    expect(JSON.stringify(old.finish())).toBe(raw);
    expect(finishMobileNavigationObserver()?.details.final?.composition[0]).toBe(1);
  });

  it('records global-handle cleanup failure without skipping listener removals', () => {
    installMobileNavigationObserver(LIMITS);
    const handle = (window as any).__tgMobileNavigationDiagnostic;
    const documentRemove = jest.spyOn(document, 'removeEventListener');
    const windowRemove = jest.spyOn(window, 'removeEventListener');
    Object.defineProperty(window, '__tgMobileNavigationDiagnostic', {
      configurable: true,
      get: () => {
        throw new Error('owner lookup failed');
      },
    });
    try {
      const result = handle.finish();
      assertCapture(result);
      expect(result.disposed).toBe(false);
      expect(result.observerErrorCount).toBe(1);
      expect(documentRemove).toHaveBeenCalledWith('keydown', expect.any(Function), true);
      expect(windowRemove).toHaveBeenCalledWith('compositionend', expect.any(Function), false);
    } finally {
      delete (window as any).__tgMobileNavigationDiagnostic;
    }
  });

  it('does not publish a frame after a reentrant finish during its observation', () => {
    installMobileNavigationObserver(LIMITS);
    fireEscape();
    const handle = (window as any).__tgMobileNavigationDiagnostic;
    jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => {
      handle.finish();
      return { width: 10, height: 10 } as DOMRect;
    });
    runFrame();
    const result = handle.finish();
    const raw = JSON.stringify(result);
    assertCapture(result);
    expect(result.details.frame).toBeNull();
    expect(result.observerErrorCount).toBeGreaterThan(0);
    expect(JSON.stringify(handle.finish())).toBe(raw);
  });

  it.each(
    [
      'register',
      'frame-snapshot',
      'cancel',
      'document-remove',
      'window-key-remove',
      'composition-remove',
      'final-snapshot',
    ].flatMap((kind) => ['object', 'undefined'].map((value) => [kind, value])),
  )('preserves exact original %s/%s rejection through new observer faults', async (kind, value) => {
    const fixture = runtimeFixture();
    Object.assign(process.env, fixture.env);
    jest.spyOn(process, 'cwd').mockReturnValue(fixture.root);
    const original = value === 'object' ? new Error('synthetic-private-original') : undefined;
    const fake = inertPage();
    const addDocument = jest.spyOn(document, 'addEventListener');
    const addWindow = jest.spyOn(window, 'addEventListener');
    const rawDocumentRemove = document.removeEventListener.bind(document);
    const rawWindowRemove = window.removeEventListener.bind(window);
    const step = jest.fn(async () => {
      if (kind === 'register')
        (window.requestAnimationFrame as jest.Mock).mockImplementationOnce(() => {
          throw new Error('synthetic-private-register');
        });
      fireEscape();
      if (kind === 'frame-snapshot') {
        Object.defineProperty(Element.prototype, 'getAnimations', {
          configurable: true,
          value: () => {
            throw new Error('synthetic-private-frame');
          },
        });
        runFrame();
        Object.defineProperty(Element.prototype, 'getAnimations', {
          configurable: true,
          value: () => [],
        });
      }
      if (kind === 'cancel')
        (window.cancelAnimationFrame as jest.Mock).mockImplementationOnce(() => {
          throw new Error('synthetic-private-cancel');
        });
      if (kind === 'document-remove')
        jest.spyOn(document, 'removeEventListener').mockImplementationOnce(() => {
          throw new Error('synthetic-private-remove');
        });
      if (kind === 'window-key-remove' || kind === 'composition-remove')
        jest.spyOn(window, 'removeEventListener').mockImplementation((type, handler, options) => {
          if (type === (kind === 'composition-remove' ? 'compositionend' : 'keydown'))
            throw new Error('synthetic-private-remove');
          rawWindowRemove(type, handler, options);
        });
      if (kind === 'final-snapshot')
        Object.defineProperty(Element.prototype, 'getAnimations', {
          configurable: true,
          value: () => {
            throw new Error('synthetic-private-final');
          },
        });
      throw original;
    });
    try {
      await expect(withMobileNavigationDiagnostics(fake.page, step)).rejects.toBe(original);
      expect(step).toHaveBeenCalledTimes(1);
      expect(fake.raw.off).toHaveBeenCalledTimes(2);
      const raw = fs.readFileSync(path.join(fixture.outputDirectory, BASENAME), 'utf8');
      const report = assertReport(JSON.parse(raw));
      expect(report.originalStepOutcome).toBe('failed');
      expect(report.captureStatus).toBe('incomplete');
      expect(raw).not.toContain('synthetic-private');
    } finally {
      for (const [type, handler] of addDocument.mock.calls.filter(([type]) => type === 'keydown'))
        rawDocumentRemove(type, handler!, true);
      for (const [type, handler] of addWindow.mock.calls.filter(([type]) =>
        ['keydown', 'compositionend'].includes(type),
      ))
        rawWindowRemove(type, handler!, false);
      fs.rmSync(fixture.directory, { recursive: true, force: true });
    }
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
