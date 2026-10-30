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
  const started = performance.now();
  let recordOverflow = false;
  let countOverflow = false;
  let observerErrorCount = 0;
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
    // Bounded overlay-box metric, not the complete Playwright locator engine.
    // Transparent boxes still count, matching the ordinary computeBox case.
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
  const snapshot = (): NavigationSnapshot => {
    const navigation = nodes('.ant-pro-drawer-sider');
    const navigationVisibleCount = navigation.filter(visible).length;
    let animationVisits = 0;
    const navigationMotionCount = navigation.filter((element) => {
      const wrapper = element.closest<HTMLElement>('.ant-drawer-content-wrapper') || element;
      const animations = wrapper.getAnimations({ subtree: true });
      if (animationVisits + animations.length > limits.animations) countOverflow = true;
      const inspected = animations.slice(0, Math.max(0, limits.animations - animationVisits));
      animationVisits += inspected.length;
      return inspected.some((animation) => animation.playState === 'running' || animation.pending);
    }).length;
    return {
      elapsedMs: elapsed(),
      focus: focus(navigation),
      state: {
        navigationCount: navigation.length,
        navigationVisibleCount,
        navigationHiddenCount: navigation.length - navigationVisibleCount,
        navigationOpenCount: navigation.filter(
          (element) =>
            element.closest('.ant-drawer')?.classList.contains('ant-drawer-open') === true,
        ).length,
        navigationMotionCount,
        dialogVisibleCount: nodes('[role="dialog"]').filter(visible).length,
        modalVisibleCount: nodes('.ant-modal').filter(visible).length,
        menuVisibleCount: nodes('[role="menu"]').filter(visible).length,
        listboxVisibleCount: nodes('[role="listbox"]').filter(visible).length,
        dropdownVisibleCount: nodes('.ant-dropdown').filter(visible).length,
      },
    };
  };
  const capture = (stage: NavigationRecord['stage'], event?: KeyboardEvent) => {
    if (event && event.key !== 'Enter' && event.key !== 'Escape') return;
    if (records.length >= limits.records) {
      recordOverflow = true;
      return;
    }
    try {
      records.push({
        sequence: records.length,
        ...snapshot(),
        stage,
        key: event ? (event.key === 'Enter' ? 'enter' : 'escape') : 'none',
        trusted: Boolean(event?.isTrusted),
        composing: Boolean(event?.isComposing),
        defaultPrevented: Boolean(event?.defaultPrevented),
      });
    } catch {
      fault();
    }
  };
  const documentCapture = (event: KeyboardEvent) => capture('document-capture', event);
  const windowBubble = (event: KeyboardEvent) => capture('window-bubble', event);
  Object.defineProperty(owner, '__tgMobileNavigationDiagnostic', {
    configurable: true,
    value: {
      finish(): BrowserCapture {
        let final: NavigationSnapshot | null = null;
        let disposed = false;
        try {
          final = snapshot();
        } catch {
          fault();
        }
        try {
          document.removeEventListener('keydown', documentCapture, true);
          window.removeEventListener('keydown', windowBubble, false);
          delete owner.__tgMobileNavigationDiagnostic;
          disposed = true;
        } catch {
          fault();
        }
        return { records, final, recordOverflow, countOverflow, observerErrorCount, disposed };
      },
    },
  });
  try {
    document.addEventListener('keydown', documentCapture, { capture: true, passive: true });
    window.addEventListener('keydown', windowBubble, { passive: true });
    capture('initial');
  } catch {
    owner.__tgMobileNavigationDiagnostic?.finish();
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
