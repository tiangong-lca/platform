import type { ConsoleMessage, Page } from '@playwright/test';

import {
  LIMITS,
  buildReport,
  readRuntimeBinding,
  writeReport,
  type BrowserCapture,
  type ErrorCounters,
  type FocusCategory,
  type NavigationRecord,
  type NavigationSnapshot,
  type NavigationDetail,
  type NavigationDetails,
  type OverlayCounts,
  type FrameLifecycle,
  type RuntimeBinding,
} from '../../../scripts/e2e/mobile-navigation-diagnostic.cjs';

type ObserverWindow = Window & { __tgMobileNavigationDiagnostic?: { finish(): BrowserCapture } };

// Serialized by Playwright: keep the browser observer closure-free. No text,
// attribute values, input values, URLs or event payloads cross this boundary.
export function installMobileNavigationObserver(limits: typeof LIMITS): void {
  const owner = window as ObserverWindow;
  if (Object.prototype.hasOwnProperty.call(owner, '__tgMobileNavigationDiagnostic'))
    throw new Error('Observer already installed.');
  const records: NavigationRecord[] = [];
  const details: NavigationDetails = {
    initial: null,
    escapeCapture: null,
    escapeBubble: null,
    frame: null,
    final: null,
  };
  const frame: FrameLifecycle = { scheduled: 0, completed: 0, cancelled: 0, triggerSequence: null };
  const started = performance.now();
  let recordOverflow = false;
  let countOverflow = false;
  let observerErrorCount = 0;
  let closed = false;
  let finishing = false;
  let finished: BrowserCapture | undefined;
  let escapeAttempted = false;
  let selectedEscape: KeyboardEvent | null = null;
  let pendingFrame: number | null = null;
  let compositionCount = 0;
  let lastCompositionElapsed: number | null = null;
  const fault = () => {
    observerErrorCount = Math.min(limits.count, observerErrorCount + 1);
  };
  const elapsed = () => {
    const value = Math.max(0, Math.floor(performance.now() - started));
    if (value > limits.elapsedMs) countOverflow = true;
    return Math.min(limits.elapsedMs, value);
  };
  const nodes = (selector: string) => {
    const found = document.querySelectorAll<HTMLElement>(selector);
    if (found.length > limits.nodes) countOverflow = true;
    return Array.from({ length: Math.min(found.length, limits.nodes) }, (_, index) => found[index]);
  };
  const visible = (element: HTMLElement) => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    // Selected box metric, not the complete Playwright visibility algorithm.
    return style.visibility === 'visible' && box.width > 0 && box.height > 0;
  };
  const focus = (navigation: HTMLElement[]): FocusCategory => {
    const active = document.activeElement;
    if (!active) return 'none';
    if (active === document.body || active === document.documentElement) return 'body';
    for (const [selector, category] of [
      ['.tg-pro-layout-mobile-menu-action', 'menu-action'],
      ['.tg-global-language-action', 'language-action'],
      ['.tg-global-header-avatar-trigger', 'avatar-action'],
    ] as const)
      if (active.closest(selector)) return category;
    const nearestDrawer = active.closest('.ant-drawer');
    if (
      nearestDrawer &&
      navigation.some((section) => section.closest('.ant-drawer') === nearestDrawer)
    )
      return 'navigation';
    if (active.closest('[role="dialog"],.ant-modal,[role="menu"],[role="listbox"],.ant-dropdown'))
      return 'other-overlay';
    return 'other';
  };
  const observe = (
    selected: boolean,
    sequence: number | null,
  ): { snapshot: NavigationSnapshot; detail: NavigationDetail | null } => {
    const navigation = nodes('.ant-pro-drawer-sider');
    let animationVisits = 0;
    const moving = (element: HTMLElement) => {
      const animations = element.getAnimations({ subtree: true });
      if (animationVisits + animations.length > limits.animations) countOverflow = true;
      const inspected = animations.slice(0, Math.max(0, limits.animations - animationVisits));
      animationVisits += inspected.length;
      return inspected.some((animation) => animation.playState === 'running' || animation.pending);
    };
    const state = {
      navigationCount: navigation.length,
      navigationVisibleCount: navigation.filter(visible).length,
      navigationHiddenCount: 0,
      navigationOpenCount: navigation.filter(
        (element) => element.closest('.ant-drawer')?.classList.contains('ant-drawer-open') === true,
      ).length,
      navigationMotionCount: navigation.filter((element) =>
        moving(element.closest<HTMLElement>('.ant-drawer-content-wrapper') || element),
      ).length,
      dialogVisibleCount: nodes('[role="dialog"]').filter(visible).length,
      modalVisibleCount: nodes('.ant-modal').filter(visible).length,
      menuVisibleCount: nodes('[role="menu"]').filter(visible).length,
      listboxVisibleCount: nodes('[role="listbox"]').filter(visible).length,
      dropdownVisibleCount: nodes('.ant-dropdown').filter(visible).length,
    };
    state.navigationHiddenCount = state.navigationCount - state.navigationVisibleCount;
    const overlay = (selector: string, leave: string): OverlayCounts => {
      const roots = nodes(selector);
      return [
        roots.filter(visible).length,
        roots.filter(moving).length,
        roots.filter(
          (element) =>
            element.classList.contains(leave) || element.classList.contains(`${leave}-active`),
        ).length,
      ];
    };
    // No private Portal/IME state is read. Each category is sampled only at a
    // fixed selected point, sharing the navigation animation inspection budget.
    const popover = selected ? overlay('.ant-popover', 'ant-zoom-big-leave') : null;
    const tooltip = selected ? overlay('.ant-tooltip', 'ant-zoom-big-fast-leave') : null;
    const snapshot: NavigationSnapshot = { elapsedMs: elapsed(), focus: focus(navigation), state };
    const detail: NavigationDetail | null =
      popover && tooltip
        ? {
            recordSequence: sequence,
            popover,
            tooltip,
            composition: [compositionCount, lastCompositionElapsed],
          }
        : null;
    return { snapshot, detail };
  };
  const capture = (
    stage: NavigationRecord['stage'],
    event?: KeyboardEvent,
    slot?: Exclude<keyof NavigationDetails, 'final'>,
  ): number | null => {
    if (closed || (event && event.key !== 'Enter' && event.key !== 'Escape')) return null;
    if (records.length >= limits.records) {
      recordOverflow = true;
      return null;
    }
    try {
      const sequence = records.length;
      const observation = observe(slot !== undefined, sequence);
      if (closed) return null;
      records.push({
        sequence,
        ...observation.snapshot,
        stage,
        key: event ? (event.key === 'Enter' ? 'enter' : 'escape') : 'none',
        trusted: Boolean(event?.isTrusted),
        composing: Boolean(event?.isComposing),
        defaultPrevented: Boolean(event?.defaultPrevented),
      });
      if (slot) details[slot] = observation.detail;
      return sequence;
    } catch {
      fault();
      return null;
    }
  };
  const scheduleFrame = (sequence: number) => {
    try {
      pendingFrame = window.requestAnimationFrame(() => {
        if (closed) return;
        // Native RAF cannot run before registration returns. An inconsistent
        // replacement is a fault, not permission to publish an unbound sample.
        if (frame.scheduled !== 1) {
          fault();
          return;
        }
        pendingFrame = null;
        frame.completed = 1;
        capture('post-escape-frame', undefined, 'frame');
      });
      frame.scheduled = 1;
      frame.triggerSequence = sequence;
    } catch {
      pendingFrame = null;
      fault();
    }
  };
  const documentCapture = (event: KeyboardEvent) => {
    if (closed) return;
    const selected = event.key === 'Escape' && !escapeAttempted;
    if (selected) escapeAttempted = true;
    const sequence = capture('document-capture', event, selected ? 'escapeCapture' : undefined);
    if (selected && sequence !== null && !closed) {
      selectedEscape = event;
      scheduleFrame(sequence);
    }
  };
  const windowBubble = (event: KeyboardEvent) => {
    if (closed) return;
    const selected = event === selectedEscape;
    capture('window-bubble', event, selected ? 'escapeBubble' : undefined);
    if (selected) selectedEscape = null;
  };
  const compositionEnd = () => {
    if (closed) return;
    if (compositionCount === limits.count) {
      countOverflow = true;
      return;
    }
    compositionCount++;
    lastCompositionElapsed = elapsed();
  };
  const handle = {
    finish(): BrowserCapture {
      if (finished) return finished;
      if (finishing) throw new Error('Observer finish is already in progress.');
      finishing = true;
      closed = true;
      selectedEscape = null;
      let disposed = true;
      const cleanup = (operation: () => void) => {
        try {
          operation();
        } catch {
          disposed = false;
          fault();
        }
      };
      if (pendingFrame !== null) {
        const id = pendingFrame;
        pendingFrame = null;
        cleanup(() => {
          window.cancelAnimationFrame(id);
          frame.cancelled = 1;
        });
      }
      cleanup(() => document.removeEventListener('keydown', documentCapture, true));
      cleanup(() => window.removeEventListener('keydown', windowBubble, false));
      cleanup(() => window.removeEventListener('compositionend', compositionEnd, false));
      let final: NavigationSnapshot | null = null;
      try {
        const observation = observe(true, null);
        final = observation.snapshot;
        details.final = observation.detail;
      } catch {
        fault();
      }
      cleanup(() => {
        if (owner.__tgMobileNavigationDiagnostic === handle)
          delete owner.__tgMobileNavigationDiagnostic;
      });
      finished = {
        records,
        final,
        recordOverflow,
        countOverflow,
        observerErrorCount,
        disposed,
        compositionPrehistory: 'unknown',
        details,
        frame,
      };
      return finished;
    },
  };
  Object.defineProperty(owner, '__tgMobileNavigationDiagnostic', {
    configurable: true,
    value: handle,
  });
  try {
    document.addEventListener('keydown', documentCapture, { capture: true, passive: true });
    window.addEventListener('keydown', windowBubble, { passive: true });
    window.addEventListener('compositionend', compositionEnd, { passive: true });
    capture('initial', undefined, 'initial');
  } catch {
    handle.finish();
    throw new Error('Observer installation failed.');
  }
}

export function finishMobileNavigationObserver(): BrowserCapture | undefined {
  return (window as ObserverWindow).__tgMobileNavigationDiagnostic?.finish();
}

export async function withMobileNavigationDiagnostics(
  page: Page,
  originalStep: () => Promise<void>,
): Promise<void> {
  if (process.env.E2E_QUALIFICATION !== 'true' || process.env.E2E_RELEASE_MODE !== 'true') {
    await originalStep();
    return;
  }
  const counters: ErrorCounters = {
    pageErrorCount: 0,
    consoleErrorCount: 0,
    counterOverflow: false,
  };
  let observerFailed = false;
  const increment = (key: 'pageErrorCount' | 'consoleErrorCount') => {
    if (counters[key] === LIMITS.count) counters.counterOverflow = true;
    else counters[key] += 1;
  };
  const pageError = () => increment('pageErrorCount');
  const consoleError = (message: ConsoleMessage) => {
    try {
      if (message.type() === 'error') increment('consoleErrorCount');
    } catch {
      observerFailed = true;
    }
  };
  let binding: RuntimeBinding | undefined;
  let installed = false;
  let originalFailed = false;
  let originalError: unknown;
  try {
    binding = readRuntimeBinding();
    const target = new URL(page.url());
    if (
      !['http:', 'https:'].includes(target.protocol) ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) ||
      target.username ||
      target.password
    ) {
      throw new Error('Mobile navigation diagnostics require a loopback frontend.');
    }
    page.on('pageerror', pageError);
    page.on('console', consoleError);
    await page.evaluate(installMobileNavigationObserver, LIMITS);
    installed = true;
  } catch {
    observerFailed = true;
  }
  try {
    await originalStep();
  } catch (error) {
    originalFailed = true;
    originalError = error;
  }
  let capture: BrowserCapture | undefined;
  try {
    capture = installed ? await page.evaluate(finishMobileNavigationObserver) : undefined;
  } catch {
    observerFailed = true;
  } finally {
    try {
      page.off('pageerror', pageError);
    } catch {
      observerFailed = true;
    }
    try {
      page.off('console', consoleError);
    } catch {
      observerFailed = true;
    }
  }
  try {
    const report = buildReport(
      binding!.source,
      capture,
      counters,
      originalFailed ? 'failed' : 'passed',
      observerFailed,
    );
    writeReport(binding!, report);
    if (report.captureStatus !== 'complete') observerFailed = true;
  } catch {
    observerFailed = true;
  }
  if (originalFailed) throw originalError;
  if (observerFailed) throw new Error('Mandatory mobile navigation diagnostic capture failed.');
}
