import type { ConsoleMessage, Locator, Page, TestInfo } from '@playwright/test';
import {
  buildReport,
  readRuntimeBinding,
  runObservedStep,
  writeReport,
  type BrowserCapture,
  type EventKind,
  type Identity,
  type Slot,
  type Snapshot,
  type Stage,
  type TargetKind,
} from '../../../scripts/e2e/batch-allocation-diagnostic.cjs';

type ObserverWindow = Window & {
  __tgBatchAllocationDiagnostic?: { ownerToken: string; finish(): BrowserCapture };
};

// Both browser exports are serialized independently. Keep every runtime helper
// inside this function; imports above are host-only (types erase in the fixture).
export function installBatchAllocationObserver(root: HTMLElement): string {
  const owner = window as ObserverWindow;
  if (
    Object.prototype.hasOwnProperty.call(owner, '__tgBatchAllocationDiagnostic') ||
    root.ownerDocument !== document ||
    !root.isConnected
  )
    throw new Error('Batch observer installation failed.');
  // This capability stays in the invoking host's local variable, never in the
  // diagnostic. A failed install cannot acquire a previous instance's token.
  const ownerToken = Array.from(window.crypto.getRandomValues(new Uint32Array(4)), (value) =>
    value.toString(16).padStart(8, '0'),
  ).join('');
  const stages: Stage[] = [
    'initial',
    'first-share-input-capture',
    'first-ok-capture',
    'first-ok-bubble',
    'final',
  ];
  const events: EventKind[] = ['input', 'change', 'blur', 'click', 'pointerdown', 'pointerup'];
  const data: BrowserCapture = {
    rootIdentity: 'original-only',
    popupObservation: 'omitted',
    compositionPrehistory: 'unknown',
    slots: Object.fromEntries(
      stages.map((k) => [k, { status: 'not-observed', snapshot: null, fault: null }]),
    ) as Record<Stage, Slot>,
    records: [],
    counters: {
      callbacks: 0,
      events: { input: 0, change: 0, blur: 0, click: 0, pointerdown: 0, pointerup: 0 },
    },
    overflow: { records: false, counts: false, elapsed: false, eventWork: false, ancestry: false },
    observerErrors: 0,
    disposal: { closed: false, removed: 0, failed: 0, handleDeleted: false },
  };
  const started = performance.now();
  let closed = false,
    disarmed = false,
    finishing = false,
    finished: BrowserCapture | undefined;
  let raw: Element | undefined, add: Element | undefined, ok: Element | undefined;
  const error = () => {
    data.observerErrors = Math.min(255, data.observerErrors + 1);
  };
  const attribute = (element: Element, name: string) => {
    const value = element.getAttribute(name);
    if (value !== null && value.length > 128) throw 'shape-error';
    return value;
  };
  const ancestry = (startNode: Node | null): { inside: boolean; category: TargetKind } => {
    let node = startNode;
    let category: TargetKind = 'other-within-batch';
    for (let depth = 0; node && depth < 32; depth++, node = node.parentNode) {
      if (node === root) return { inside: true, category };
      if (node === raw) category = 'raw-checkbox';
      else if (node === add) category = 'add-allocation';
      else if (node === ok) category = 'ok';
      else if (node.nodeType === 1 && (node as Element).tagName === 'INPUT') {
        const role = attribute(node as Element, 'role'),
          label = attribute(node as Element, 'aria-label');
        if (role === 'combobox' && label === 'Target product') category = 'target-combobox';
        if (role === 'spinbutton' && label === 'Allocated fraction') category = 'share-input';
      }
    }
    if (node) {
      data.overflow.ancestry = true;
      error();
    }
    return { inside: false, category };
  };
  const visible = (element: Element): 'visible' | 'hidden' => {
    const style = getComputedStyle(element),
      box = element.getBoundingClientRect();
    return style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      box.width > 0 &&
      box.height > 0
      ? 'visible'
      : 'hidden';
  };
  const snapshot = (stage: Stage): Snapshot => {
    const connected = root.isConnected;
    const s: Snapshot = {
      rootConnected: connected,
      rootElementVisibility: 'unknown',
      scanStatus: connected ? 'complete' : 'detached',
      counts: {
        rawRow: null,
        rawCheckbox: null,
        add: null,
        target: null,
        share: null,
        ok: null,
        alerts: null,
      },
      controlCoverage: connected ? 'unknown' : 'not-applicable',
      rawSelected: 'unknown',
      targetMatchesB: 'unknown',
      shareMatches100: 'unknown',
      nativeOkDisabled: 'unknown',
      ariaOkDisabled: 'unknown',
      alertVisibility: { invalid: null, loadFailed: null, other: null },
      focus: 'unknown',
    };
    if (!connected) return s;
    const found: Record<keyof Snapshot['counts'], Element[]> = {
      rawRow: [],
      rawCheckbox: [],
      add: [],
      target: [],
      share: [],
      ok: [],
      alerts: [],
    };
    let textUnits = 0,
      textNodes = 0,
      buttons = 0;
    const push = (key: keyof typeof found, element: Element) => {
      if (found[key].length === 8) throw 'match-cap';
      found[key].push(element);
      s.counts[key] = found[key].length;
    };
    const children = (element: Node, maximum: number, budget?: { remaining: number }): Node[] => {
      const result: Node[] = [];
      for (let node = element.firstChild; node; node = node.nextSibling) {
        if (textNodes === 128 || result.length === maximum || budget?.remaining === 0)
          throw 'text-cap';
        textNodes++;
        if (budget) budget.remaining--;
        result.push(node);
      }
      return result;
    };
    const text = (node: Node, maximum: number): string => {
      if (node.nodeType !== 3) throw 'shape-error';
      const value = node as Text;
      if (value.length > maximum || textUnits + value.length > 8192) throw 'text-cap';
      textUnits += value.length;
      return value.data;
    };
    const directText = (
      element: Node,
      maximum: number,
      allowedElement?: Element,
      budget?: { remaining: number },
    ): string => {
      let result = '',
        texts = 0,
        empties = 0,
        admitted = 0;
      for (const child of children(element, 4, budget)) {
        if (allowedElement && child === allowedElement) {
          admitted++;
          continue;
        }
        if (child.nodeType === 8) {
          if (++empties > 2 || (child as Comment).length) throw 'shape-error';
          continue;
        }
        const value = text(child, maximum);
        if (value.length) {
          texts++;
          result = value;
        } else if (++empties > 2) throw 'shape-error';
      }
      if (texts !== 1 || (allowedElement && admitted !== 1)) throw 'shape-error';
      return result;
    };
    const buttonLabel = (element: Element) => {
      if (++buttons > 32) throw 'text-cap';
      const budget = { remaining: 8 };
      let span: Element | undefined,
        empties = 0,
        holder: Element | undefined;
      for (const child of children(element, 4, budget)) {
        if (child.nodeType === 1 && (child as Element).tagName === 'SPAN' && !span)
          span = child as Element;
        else if (child.nodeType === 1 && (child as Element).tagName === 'DIV' && !holder) {
          holder = child as HTMLElement;
          const style = (holder as HTMLElement).style;
          if (
            attribute(holder, 'class') ||
            style.length !== 3 ||
            style.position !== 'absolute' ||
            style.left !== '0px' ||
            style.top !== '0px'
          )
            throw 'shape-error';
          const wave = children(holder, 1, budget);
          if (
            wave.length &&
            (wave[0].nodeType !== 1 ||
              (wave[0] as Element).tagName !== 'DIV' ||
              !(wave[0] as Element).classList.contains('ant-wave') ||
              attribute(wave[0] as Element, 'class') === null ||
              wave[0].firstChild !== null)
          )
            throw 'shape-error';
        } else if (
          (child.nodeType === 3 && (child as Text).length === 0) ||
          (child.nodeType === 8 && (child as Comment).length === 0)
        ) {
          if (++empties > 2) throw 'shape-error';
        } else throw 'shape-error';
      }
      if (!span) throw 'shape-error';
      return directText(span, 64, undefined, budget);
    };
    try {
      for (const key of Object.keys(s.counts) as Array<keyof Snapshot['counts']>) s.counts[key] = 0;
      let node: Node | null = root,
        depth = 0,
        visited = 0,
        rawRowDepth = -1;
      while (node) {
        if (++visited > 2048) throw 'node-cap';
        if (depth > 32) throw 'depth-cap';
        if (depth <= rawRowDepth) rawRowDepth = -1;
        if (node.nodeType === 1) {
          const el = node as Element;
          if (
            el.tagName === 'TR' &&
            el.classList.contains('ant-table-row') &&
            attribute(el, 'data-row-key') === '4'
          ) {
            push('rawRow', el);
            rawRowDepth = depth;
          } else if (el.tagName === 'INPUT') {
            if (rawRowDepth >= 0 && attribute(el, 'type') === 'checkbox') push('rawCheckbox', el);
            const role = attribute(el, 'role'),
              label = attribute(el, 'aria-label');
            if (role === 'combobox' && label === 'Target product') push('target', el);
            if (role === 'spinbutton' && label === 'Allocated fraction') push('share', el);
          } else if (el.tagName === 'BUTTON' && el.classList.contains('ant-btn')) {
            const label = buttonLabel(el);
            if (label === 'Add product allocation') push('add', el);
            if (label === 'OK') push('ok', el);
          } else if (
            el.tagName === 'DIV' &&
            el.classList.contains('ant-alert') &&
            attribute(el, 'role') === 'alert'
          )
            push('alerts', el);
        }
        if (node.firstChild) {
          node = node.firstChild;
          depth++;
        } else {
          while (node && node !== root && !node.nextSibling) {
            node = node.parentNode;
            depth--;
          }
          if (!node || node === root) break;
          node = node.nextSibling;
        }
      }
      const unique = (key: keyof typeof found) =>
        found[key].length === 1 ? found[key][0] : undefined;
      raw = unique('rawCheckbox');
      add = unique('add');
      ok = unique('ok');
      const target = unique('target'),
        share = unique('share');
      const required: Array<keyof typeof found> =
        stage === 'initial'
          ? ['rawRow', 'rawCheckbox', 'add', 'ok']
          : ['rawRow', 'rawCheckbox', 'add', 'ok', 'target', 'share'];
      s.controlCoverage =
        required.some((k) => found[k].length > 1) ||
        found.target.length > 1 ||
        found.share.length > 1
          ? 'ambiguous'
          : required.some((k) => found[k].length === 0) ||
              (stage === 'initial' && (found.target.length !== 0 || found.share.length !== 0))
            ? 'missing'
            : 'expected';
      if (raw) s.rawSelected = (raw as HTMLInputElement).checked ? 'true' : 'false';
      if (ok) {
        s.nativeOkDisabled = (ok as HTMLButtonElement).disabled ? 'true' : 'false';
        const aria = attribute(ok, 'aria-disabled');
        s.ariaOkDisabled =
          aria === null
            ? 'unknown'
            : aria === 'true'
              ? 'true'
              : aria === 'false'
                ? 'false'
                : 'unknown';
      }
      if (share) {
        const value = (share as HTMLInputElement).value;
        if (value.length > 16) throw 'shape-error';
        s.shareMatches100 = value === '100' ? 'true' : 'false';
      }
      if (target) {
        const parent = target.parentElement;
        if (
          !parent ||
          parent.tagName !== 'DIV' ||
          !parent.classList.contains('ant-select-content') ||
          !parent.classList.contains('ant-select-content-has-value') ||
          parent.classList.contains('ant-select-content-has-option-style') ||
          parent.classList.contains('ant-select-content-has-search-value')
        )
          throw 'shape-error';
        const label = directText(parent, 64, target);
        s.targetMatchesB =
          visible(parent) === 'visible'
            ? label === 'Product B (#2)'
              ? 'true'
              : 'false'
            : 'unknown';
      }
      s.alertVisibility = { invalid: 0, loadFailed: 0, other: 0 };
      for (const alert of found.alerts) {
        const section = children(alert, 8).filter(
          (child) =>
            child.nodeType === 1 && (child as Element).classList.contains('ant-alert-section'),
        );
        if (section.length !== 1) throw 'shape-error';
        const title = children(section[0], 8).filter(
          (child) =>
            child.nodeType === 1 && (child as Element).classList.contains('ant-alert-title'),
        );
        if (title.length !== 1) throw 'shape-error';
        const label = directText(title[0], 256),
          category =
            label ===
            'Check allocation targets and shares: each explicit allocation must total 100%, and legacy shares cannot be mixed with targeted allocations.'
              ? 'invalid'
              : label === 'Product targets could not be verified. Reopen to retry.'
                ? 'loadFailed'
                : 'other';
        if (visible(alert) === 'visible') s.alertVisibility[category]!++;
      }
      s.rootElementVisibility = visible(root);
      const active = document.activeElement;
      s.focus = !active
        ? 'none'
        : active === document.body
          ? 'body'
          : active === share
            ? 'share'
            : active === ok
              ? 'ok'
              : ancestry(active).inside
                ? 'other-within-batch'
                : 'outside';
    } catch (reason) {
      s.scanStatus =
        typeof reason === 'string' &&
        ['node-cap', 'depth-cap', 'match-cap', 'text-cap', 'shape-error'].includes(reason)
          ? (reason as Snapshot['scanStatus'])
          : 'read-fault';
      s.controlCoverage = 'unknown';
      error();
    }
    return s;
  };
  const sample = (stage: Stage) => {
    if (data.slots[stage].status !== 'not-observed') return;
    try {
      data.slots[stage] = { status: 'observed', snapshot: snapshot(stage), fault: null };
    } catch {
      error();
      data.slots[stage] = { status: 'observer-fault', snapshot: null, fault: 'read' };
    }
  };
  const listeners: Array<{
    target: Document | Window;
    event: EventKind;
    callback: EventListener;
    capture: boolean;
    removed: boolean;
  }> = [];
  const remove = () => {
    for (const listener of listeners) {
      if (listener.removed) continue;
      try {
        listener.target.removeEventListener(listener.event, listener.callback, listener.capture);
        listener.removed = true;
        data.disposal.removed++;
      } catch {
        data.disposal.failed = Math.min(255, data.disposal.failed + 1);
        error();
      }
    }
  };
  const observe = (event: Event, phase: 'document-capture' | 'window-bubble') => {
    if (closed || disarmed) return;
    if (data.counters.callbacks === 256) {
      data.overflow.eventWork = true;
      disarmed = true;
      remove();
      return;
    }
    data.counters.callbacks++;
    try {
      const classified = ancestry(event.target as Node | null);
      if (!classified.inside) return;
      const kind = event.type as EventKind;
      if (data.counters.events[kind] === 255) data.overflow.counts = true;
      else data.counters.events[kind]++;
      if (kind === 'input' && classified.category === 'share-input' && phase === 'document-capture')
        sample('first-share-input-capture');
      if (kind === 'click' && classified.category === 'ok')
        sample(phase === 'document-capture' ? 'first-ok-capture' : 'first-ok-bubble');
      const elapsed = Math.max(0, Math.floor(performance.now() - started));
      if (elapsed > 120000) data.overflow.elapsed = true;
      if (data.records.length === 48) data.overflow.records = true;
      else
        data.records.push({
          sequence: data.records.length,
          elapsedMs: Math.min(120000, elapsed),
          event: kind,
          target: classified.category,
          phase,
          trusted: event.isTrusted,
          defaultPrevented: event.defaultPrevented,
          composing:
            'isComposing' in event && typeof event.isComposing === 'boolean'
              ? event.isComposing
                ? 'true'
                : 'false'
              : 'unavailable',
        });
    } catch {
      error();
    }
  };
  // Reject hostile descriptors/unknown strings before browser serialization can
  // erase accessors, holes or custom array channels. Host enforces exact schema.
  const seal = (value: unknown, depth = 0): void => {
    if (depth > 12) throw new Error('Batch observer validation failed.');
    if (
      value === null ||
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value))
    )
      return;
    if (typeof value === 'string') {
      if (
        ![
          'original-only',
          'omitted',
          'unknown',
          'not-observed',
          'observed',
          'observer-fault',
          'read',
          'install',
          'shape',
          'finish',
          'validation',
          'visible',
          'hidden',
          'complete',
          'detached',
          'node-cap',
          'depth-cap',
          'match-cap',
          'text-cap',
          'shape-error',
          'read-fault',
          'expected',
          'missing',
          'ambiguous',
          'not-applicable',
          'true',
          'false',
          'none',
          'body',
          'share',
          'ok',
          'other-within-batch',
          'outside',
          'input',
          'change',
          'blur',
          'click',
          'pointerdown',
          'pointerup',
          'raw-checkbox',
          'add-allocation',
          'target-combobox',
          'share-input',
          'document-capture',
          'window-bubble',
          'unavailable',
        ].includes(value)
      )
        throw new Error('Batch observer validation failed.');
      return;
    }
    if (typeof value !== 'object' || Object.getOwnPropertySymbols(value).length)
      throw new Error('Batch observer validation failed.');
    const array = Array.isArray(value),
      names = Object.getOwnPropertyNames(value);
    if (
      (array && (value.length > 48 || names.length !== value.length + 1)) ||
      (!array && ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
    )
      throw new Error('Batch observer validation failed.');
    for (const key of names) {
      if (array && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        !descriptor ||
        !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
        !descriptor.enumerable ||
        (array && !/^(?:0|[1-9][0-9]*)$/u.test(key))
      )
        throw new Error('Batch observer validation failed.');
      seal(descriptor.value, depth + 1);
    }
    Object.freeze(value);
  };
  const handle = {
    ownerToken,
    finish(): BrowserCapture {
      if (finished) return finished;
      if (finishing) throw new Error('Batch observer finish reentered.');
      finishing = true;
      closed = true;
      data.disposal.closed = true;
      remove();
      sample('final');
      try {
        if (owner.__tgBatchAllocationDiagnostic === handle) {
          delete owner.__tgBatchAllocationDiagnostic;
          data.disposal.handleDeleted = !Object.prototype.hasOwnProperty.call(
            owner,
            '__tgBatchAllocationDiagnostic',
          );
        }
      } catch {
        error();
      }
      // Validate exact object channels in this realm before serialization; the
      // host repeats semantic/cross-field validation on the transported value.
      const keys = (value: object, expected: string[]) => {
        if (
          Object.getOwnPropertyNames(value).length !== expected.length ||
          Object.getOwnPropertySymbols(value).length ||
          expected.some((key) => {
            const descriptor = Object.getOwnPropertyDescriptor(value, key);
            return (
              !descriptor ||
              !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
              !descriptor.enumerable
            );
          })
        )
          throw new Error('Batch observer validation failed.');
      };
      keys(data, [
        'rootIdentity',
        'popupObservation',
        'compositionPrehistory',
        'slots',
        'records',
        'counters',
        'overflow',
        'observerErrors',
        'disposal',
      ]);
      keys(data.slots, stages);
      keys(data.counters, ['callbacks', 'events']);
      keys(data.counters.events, events);
      keys(data.overflow, ['records', 'counts', 'elapsed', 'eventWork', 'ancestry']);
      keys(data.disposal, ['closed', 'removed', 'failed', 'handleDeleted']);
      for (const stage of stages) {
        const slot = data.slots[stage];
        keys(slot, ['status', 'snapshot', 'fault']);
        if (slot.snapshot) {
          keys(slot.snapshot, [
            'rootConnected',
            'rootElementVisibility',
            'scanStatus',
            'counts',
            'controlCoverage',
            'rawSelected',
            'targetMatchesB',
            'shareMatches100',
            'nativeOkDisabled',
            'ariaOkDisabled',
            'alertVisibility',
            'focus',
          ]);
          keys(slot.snapshot.counts, [
            'rawRow',
            'rawCheckbox',
            'add',
            'target',
            'share',
            'ok',
            'alerts',
          ]);
          keys(slot.snapshot.alertVisibility, ['invalid', 'loadFailed', 'other']);
        }
      }
      for (const record of data.records)
        keys(record, [
          'sequence',
          'elapsedMs',
          'event',
          'target',
          'phase',
          'trusted',
          'defaultPrevented',
          'composing',
        ]);
      seal(data);
      finished = data;
      return finished;
    },
  };
  Object.freeze(handle);
  Object.defineProperty(owner, '__tgBatchAllocationDiagnostic', {
    configurable: true,
    value: handle,
  });
  try {
    for (const kind of events) {
      const capture: EventListener = (event) => observe(event, 'document-capture');
      listeners.push({
        target: document,
        event: kind,
        callback: capture,
        capture: true,
        removed: false,
      });
      document.addEventListener(kind, capture, { capture: true, passive: true });
      if (kind !== 'blur') {
        const bubble: EventListener = (event) => observe(event, 'window-bubble');
        listeners.push({
          target: window,
          event: kind,
          callback: bubble,
          capture: false,
          removed: false,
        });
        window.addEventListener(kind, bubble, { passive: true });
      }
    }
    sample('initial');
  } catch {
    handle.finish();
    throw new Error('Batch observer installation failed.');
  }
  return ownerToken;
}

export function finishBatchAllocationObserver(ownerToken?: string): BrowserCapture | undefined {
  if (typeof ownerToken !== 'string' || !/^[a-f0-9]{32}$/u.test(ownerToken)) return undefined;
  const handle = (window as ObserverWindow).__tgBatchAllocationDiagnostic;
  return handle?.ownerToken === ownerToken ? handle.finish() : undefined;
}

export async function withBatchAllocationDiagnostics(
  page: Page,
  batch: Locator,
  testInfo: TestInfo,
  browserName: string,
  original: () => Promise<void>,
): Promise<void> {
  if (process.env.E2E_QUALIFICATION !== 'true' || process.env.E2E_RELEASE_MODE !== 'true') {
    await original();
    return;
  }
  const identity = {
    browser: browserName,
    project: testInfo.project.name,
    scope: 'qualification-diagnostic-only',
    control: null,
  } as Identity;
  // Admission is distinct from an in-trajectory installation fault.
  if (testInfo.retry !== 0 || testInfo.repeatEachIndex !== 0)
    throw new Error('Batch observer admission failed.');
  const binding = readRuntimeBinding(undefined, undefined, identity);
  const target = new URL(page.url());
  if (
    !['http:', 'https:'].includes(target.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) ||
    target.username ||
    target.password
  )
    throw new Error('Batch observer admission failed.');
  const counters = { pageErrorCount: 0, consoleErrorCount: 0, counterOverflow: false };
  const increment = (key: 'pageErrorCount' | 'consoleErrorCount') => {
    if (counters[key] === 255) counters.counterOverflow = true;
    else counters[key]++;
  };
  let listenerFailed = false;
  let ownerToken: string | undefined;
  const pageError = () => increment('pageErrorCount');
  const consoleError = (message: ConsoleMessage) => {
    try {
      if (message.type() === 'error') increment('consoleErrorCount');
    } catch {
      listenerFailed = true;
    }
  };
  await runObservedStep({
    install: async () => {
      page.on('pageerror', pageError);
      page.on('console', consoleError);
      ownerToken = await batch.evaluate(installBatchAllocationObserver);
    },
    original,
    finish: () => page.evaluate(finishBatchAllocationObserver, ownerToken),
    removePageError: () => {
      page.off('pageerror', pageError);
    },
    removeConsoleError: () => {
      page.off('console', consoleError);
    },
    publish: (capture, outcome, observerFailed) => {
      const report = buildReport(
        binding.source,
        capture,
        counters,
        outcome,
        identity,
        observerFailed || listenerFailed,
      );
      writeReport(binding, report);
      return report.captureStatus === 'complete';
    },
  });
}
