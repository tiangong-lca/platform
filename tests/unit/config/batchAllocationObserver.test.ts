import {
  finishBatchAllocationObserver,
  installBatchAllocationObserver,
} from '../../e2e/i18n/batch-allocation-observer';
import {
  assertCapture,
  captureComplete,
  runObservedStep,
} from '../../../scripts/e2e/batch-allocation-diagnostic.cjs';

let ownerToken: string | undefined;
const install = (root: HTMLElement) => {
  ownerToken = installBatchAllocationObserver(root);
  return ownerToken;
};

// Inert DOM only: no product modules, native browser, network or server.
const initial = () => {
  document.body.innerHTML =
    '<div role="dialog"><table><tbody><tr class="ant-table-row" data-row-key="4"><td><input type="checkbox"></td><td>PRIVATE ROW BAIT</td></tr></tbody></table><button class="ant-btn" id="add"><span>Add product allocation</span></button><button class="ant-btn" id="ok"><span>OK</span></button></div>';
  return document.body.firstElementChild as HTMLElement;
};
const addEntry = (root: HTMLElement, value = '100') => {
  const editor = document.createElement('div');
  editor.innerHTML =
    '<div class="ant-select-content ant-select-content-has-value">Product B (#2)<input role="combobox" aria-label="Target product"></div><input role="spinbutton" aria-label="Allocated fraction">';
  root.append(editor);
  (root.querySelector('[role=spinbutton]') as HTMLInputElement).value = value;
};
const finish = () => {
  const value = finishBatchAllocationObserver(ownerToken)!;
  assertCapture(value);
  return value;
};
beforeEach(() => {
  ownerToken = undefined;
  jest
    .spyOn(Element.prototype, 'getBoundingClientRect')
    .mockReturnValue({ width: 10, height: 10 } as DOMRect);
});
afterEach(() => {
  try {
    finishBatchAllocationObserver(ownerToken);
  } finally {
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  }
});

it('admits initial absent entries and detached success while preserving exact public event slots', () => {
  const root = initial();
  install(root);
  addEntry(root);
  root.querySelector('[role=spinbutton]')!.dispatchEvent(new Event('input', { bubbles: true }));
  root.querySelector('#ok')!.addEventListener('click', () => root.remove());
  root.querySelector('#ok')!.dispatchEvent(new Event('click', { bubbles: true }));
  const value = finish();
  expect(value.slots.initial.snapshot?.counts.target).toBe(0);
  expect(value.slots.initial.snapshot?.targetMatchesB).toBe('unknown');
  expect(value.slots['first-share-input-capture'].snapshot?.targetMatchesB).toBe('true');
  expect(value.slots['first-share-input-capture'].snapshot?.shareMatches100).toBe('true');
  expect(value.slots.final.snapshot?.rootConnected).toBe(false);
  expect(value.slots.final.snapshot?.rootElementVisibility).toBe('unknown');
  expect(value.slots.final.snapshot?.counts.ok).toBeNull();
  expect(captureComplete(value)).toBe(true);
  expect(JSON.stringify(value)).not.toMatch(/PRIVATE|Product B|"100"|aria-label/);
});

it('keeps public rejection distinct from private value, and does not require share delivery', () => {
  const root = initial();
  install(root);
  addEntry(root, '');
  const alert = document.createElement('div');
  alert.className = 'ant-alert';
  alert.setAttribute('role', 'alert');
  alert.innerHTML =
    '<div class="ant-alert-section"><div class="ant-alert-title">Check allocation targets and shares: each explicit allocation must total 100%, and legacy shares cannot be mixed with targeted allocations.</div></div>';
  root.append(alert);
  root.querySelector('#ok')!.dispatchEvent(new Event('click', { bubbles: true }));
  const value = finish();
  expect(value.slots['first-share-input-capture']).toEqual({
    status: 'not-observed',
    snapshot: null,
    fault: null,
  });
  expect(value.slots.final.snapshot?.alertVisibility.invalid).toBe(1);
  expect(value.slots.final.snapshot?.shareMatches100).toBe('false');
  expect(captureComplete(value)).toBe(true);
});

it('never rebinds a replaced root and permits cancel with no OK observations', () => {
  const root = initial();
  install(root);
  addEntry(root);
  const replacement = root.cloneNode(true);
  root.replaceWith(replacement);
  const value = finish();
  expect(document.querySelector('[role=dialog]')).toBe(replacement);
  expect(value.slots.final.snapshot?.rootConnected).toBe(false);
  expect(value.slots['first-ok-capture'].status).toBe('not-observed');
  expect(captureComplete(value)).toBe(true);
});

it('records missing bubble without concluding that the application handler was absent', () => {
  const root = initial();
  install(root);
  addEntry(root);
  root.querySelector('#ok')!.addEventListener('click', (event) => event.stopPropagation());
  root.querySelector('#ok')!.dispatchEvent(new Event('click', { bubbles: true }));
  const value = finish();
  expect(value.slots['first-ok-capture'].status).toBe('observed');
  expect(value.slots['first-ok-bubble'].status).toBe('not-observed');
  expect(captureComplete(value)).toBe(true);
});

it.each(['nested', 'duplicate', 'long', 'node-cap', 'depth-cap'])(
  'fails closed on %s permitted-control bait',
  (kind) => {
    const root = initial();
    install(root);
    addEntry(root);
    if (kind === 'nested')
      root
        .querySelector('.ant-select-content')!
        .firstChild!.replaceWith(document.createElement('strong'));
    if (kind === 'duplicate') root.append(root.querySelector('[role=spinbutton]')!.cloneNode());
    if (kind === 'long')
      (root.querySelector('[role=spinbutton]') as HTMLInputElement).value = 'PRIVATE'.repeat(1000);
    if (kind === 'node-cap')
      for (let i = 0; i < 2050; i++) root.append(document.createElement('i'));
    if (kind === 'depth-cap') {
      let node: Element = root;
      for (let i = 0; i < 34; i++) {
        const child = document.createElement('i');
        node.append(child);
        node = child;
      }
    }
    const value = finish();
    expect(captureComplete(value)).toBe(false);
    expect(JSON.stringify(value)).not.toContain('PRIVATE');
  },
);

it('disarms at the callback work cap and never resumes snapshot discovery in late callbacks', () => {
  const root = initial();
  install(root);
  addEntry(root);
  const input = root.querySelector('[role=spinbutton]')!;
  for (let i = 0; i < 140; i++) input.dispatchEvent(new Event('input', { bubbles: true }));
  const value = finish();
  expect(value.counters.callbacks).toBe(256);
  expect(value.overflow.eventWork).toBe(true);
  expect(value.records).toHaveLength(48);
  expect(value.overflow.records).toBe(true);
  expect(captureComplete(value)).toBe(false);
});

it('attempts independent listener removals, freezes cached capture and leaves newer ownership intact', () => {
  const root = initial();
  install(root);
  const handle = (window as any).__tgBatchAllocationDiagnostic;
  const remove = jest.spyOn(document, 'removeEventListener').mockImplementationOnce(() => {
    throw new Error('PRIVATE');
  });
  const value = handle.finish();
  assertCapture(value);
  expect(value.disposal.failed).toBe(1);
  expect(value.disposal.removed).toBe(10);
  expect(Object.isFrozen(value)).toBe(true);
  const failedRemoval = remove.mock.calls[0];
  remove.mockRestore();
  // Recover the deliberately failed inert removal without changing its failed
  // receipt, so this test leaves no listener in the suite's shared document.
  document.removeEventListener(...failedRemoval);
  install(root);
  const newer = (window as any).__tgBatchAllocationDiagnostic;
  expect(handle.finish()).toBe(value);
  expect((window as any).__tgBatchAllocationDiagnostic).toBe(newer);
  expect(captureComplete(value)).toBe(false);
});

it('failed invocation never finishes a preexisting owner, and an old token never finishes a new owner', async () => {
  const root = initial();
  const first = install(root);
  const previous = (window as any).__tgBatchAllocationDiagnostic;
  let failedInvocationToken: string | undefined,
    calls = 0;
  await expect(
    runObservedStep({
      install: async () => {
        failedInvocationToken = installBatchAllocationObserver(root);
      },
      original: async () => {
        calls++;
      },
      finish: async () => finishBatchAllocationObserver(failedInvocationToken),
      removePageError: () => {},
      removeConsoleError: () => {},
      publish: () => false,
    }),
  ).rejects.toThrow('Mandatory batch allocation diagnostic capture failed.');
  expect(calls).toBe(1);
  expect((window as any).__tgBatchAllocationDiagnostic).toBe(previous);
  expect(finishBatchAllocationObserver(undefined)).toBeUndefined();
  expect((window as any).__tgBatchAllocationDiagnostic).toBe(previous);
  finishBatchAllocationObserver(first);
  const second = install(root),
    newer = (window as any).__tgBatchAllocationDiagnostic;
  expect(second).not.toBe(first);
  expect(finishBatchAllocationObserver(first)).toBeUndefined();
  expect((window as any).__tgBatchAllocationDiagnostic).toBe(newer);
  const capture = finishBatchAllocationObserver(second)!;
  expect(JSON.stringify(capture)).not.toContain(first);
  expect(JSON.stringify(capture)).not.toContain(second);
});

it.each(['empty', 'mounted'])(
  'admits the actual installed %s Wave holder without reading its text or waiting',
  (shape) => {
    const root = initial();
    install(root);
    addEntry(root);
    for (const button of [root.querySelector('#add')!, root.querySelector('#ok')!]) {
      const holder = document.createElement('div');
      holder.style.position = 'absolute';
      holder.style.left = '0px';
      holder.style.top = '0px';
      if (shape === 'mounted') {
        const wave = document.createElement('div');
        wave.className = 'ant-wave css-fixture wave-motion-appear';
        holder.append(wave);
      }
      button.prepend(holder);
    }
    const value = finish();
    expect(value.slots.final.snapshot?.scanStatus).toBe('complete');
    expect(captureComplete(value)).toBe(true);
  },
);

it.each(['duplicate', 'unrelated', 'classed', 'position', 'nested', 'text'])(
  'rejects %s Wave-holder bait within the original budgets',
  (kind) => {
    const root = initial();
    install(root);
    addEntry(root);
    const holder = document.createElement('div');
    holder.style.position = 'absolute';
    holder.style.left = '0px';
    holder.style.top = '0px';
    root.querySelector('#ok')!.prepend(holder);
    if (kind === 'duplicate') holder.after(holder.cloneNode());
    if (kind === 'unrelated') holder.append(document.createElement('i'));
    if (kind === 'classed') holder.className = 'unrelated';
    if (kind === 'position') holder.style.left = '1px';
    if (kind === 'nested') {
      const wave = document.createElement('div');
      wave.className = 'ant-wave';
      wave.append(document.createElement('i'));
      holder.append(wave);
    }
    if (kind === 'text') holder.append(document.createTextNode('SECRET WAVE PAYLOAD'));
    const value = finish();
    expect(captureComplete(value)).toBe(false);
    expect(JSON.stringify(value)).not.toContain('SECRET WAVE');
  },
);

it('admits exactly eight button child visits and faults before reading a ninth child', () => {
  const root = initial();
  install(root);
  addEntry(root);
  const button = root.querySelector('#ok')!,
    span = button.querySelector('span')!;
  const holder = document.createElement('div');
  holder.style.position = 'absolute';
  holder.style.left = '0px';
  holder.style.top = '0px';
  const wave = document.createElement('div');
  wave.className = 'ant-wave';
  holder.append(wave);
  button.prepend(holder);
  button.append(document.createTextNode(''), document.createComment(''));
  span.append(document.createTextNode(''), document.createComment(''));
  button.dispatchEvent(new Event('click', { bubbles: true }));
  const handle = (window as any).__tgBatchAllocationDiagnostic;
  // OK capture/bubble have read the legitimate maximal eight-visit shape.
  const ninth = document.createTextNode(''),
    readNinth = jest.fn(() => 0);
  Object.defineProperty(ninth, 'length', { get: readNinth });
  span.append(ninth);
  const value = handle.finish();
  assertCapture(value);
  expect(value.slots['first-ok-capture'].snapshot?.scanStatus).toBe('complete');
  expect(value.slots.final.snapshot?.scanStatus).toBe('text-cap');
  expect(readNinth).not.toHaveBeenCalled();
  expect(captureComplete(value)).toBe(false);
});
