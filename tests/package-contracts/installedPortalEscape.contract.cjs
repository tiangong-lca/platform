/* Installed Portal compatibility contract. Native browser proof is separate. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../..');
const req = createRequire(path.join(root, 'package.json'));
const envReq = createRequire(req.resolve('jest-environment-jsdom'));
const { JSDOM } = envReq('jsdom');
const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://127.0.0.1:18987', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'SVGElement', 'Element', 'Node', 'ShadowRoot', 'MutationObserver', 'KeyboardEvent', 'CompositionEvent', 'Event']) global[key] = dom.window[key];
Object.defineProperty(global, 'navigator', { value: window.navigator, configurable: true });
global.getComputedStyle = window.getComputedStyle.bind(window);
global.requestAnimationFrame = window.requestAnimationFrame.bind(window);
global.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
global.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const React = req('react');
const { createRoot } = req('react-dom/client');
const { flushSync } = req('react-dom');
const act = React.act || (async callback => callback());
const antdReq = createRequire(req.resolve('antd/package.json'));
const drawerReq = createRequire(antdReq.resolve('@rc-component/drawer/package.json'));
const portalRoot = path.dirname(drawerReq.resolve('@rc-component/portal/package.json'));
const control = process.env.PORTAL_ESCAPE_NEGATIVE_CONTROL;
let controlSha256;
if (control) {
  assert.equal(control, 'naive-effect', 'Known negative control required');
  const Module = require('node:module');
  const file = path.join(__dirname, 'fixtures/portal-escape-naive-control.cjs');
  const source = fs.readFileSync(file, 'utf8');
  controlSha256 = crypto.createHash('sha256').update(source).digest('hex');
  const target = path.join(portalRoot, 'lib/useEscKeyDown.js');
  const isolated = new Module(target);
  isolated.filename = target;
  isolated.paths = Module._nodeModulePaths(path.dirname(target));
  isolated._compile(source, target);
  req.cache[target] = isolated;
}
const Portal = req(path.join(portalRoot, 'lib')).default;
const hook = req(path.join(portalRoot, 'lib/useEscKeyDown'));
const AntdDrawer = req('antd/lib/drawer').default;
const listeners = new Map([['keydown', new Set()], ['compositionend', new Set()]]);
const add = window.addEventListener.bind(window), remove = window.removeEventListener.bind(window);
window.addEventListener = (type, fn, ...args) => { listeners.get(type)?.add(fn); return add(type, fn, ...args); };
window.removeEventListener = (type, fn, ...args) => { listeners.get(type)?.delete(fn); return remove(type, fn, ...args); };
const h = React.createElement, roots = [], calls = [], commits = new Set();
const delay = () => new Promise(resolve => { setTimeout(resolve, 8); });
function Marker({ name }) { React.useLayoutEffect(() => { commits.add(name); return () => commits.delete(name); }, [name]); return h('span', { 'data-contract-marker': name }); }
const cb = name => ({ top }) => calls.push([name, top]);
function P({ name, open = true, children, onEsc, ...props }) { return h(Portal, { open, getContainer: false, onEsc: onEsc || cb(name), ...props }, h(React.Fragment, null, h(Marker, { name }), children)); }
async function mount(node) { const host = document.createElement('div'); document.body.append(host); const rt = createRoot(host, { onCaughtError() {} }); const entry = { rt, host }; roots.push(entry); await update(entry, node); return entry; }
async function update(entry, node) { await act(async () => { flushSync(() => entry.rt.render(node)); await delay(); }); }
async function transition(entry, node) { await act(async () => { React.startTransition(() => entry.rt.render(node)); await delay(); }); }
async function esc(options = {}) { await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, ...options })); await delay(); }); }
function take(expected) { const byName = (a, b) => a[0].localeCompare(b[0]); assert.deepEqual(calls.splice(0).sort(byName), expected.slice().sort(byName)); }
const keyed = (name, open = true, onEsc) => h(P, { name, key: name, open, onEsc });
function Pending({ signal }) { signal.rendered++; throw signal.promise; }
function signal() { return { rendered: 0, promise: new Promise(() => {}) }; }
class Boundary extends React.Component { constructor(props) { super(props); this.state = { failed: false }; } static getDerivedStateFromError() { return { failed: true }; } render() { return this.state.failed ? h('i') : this.props.children; } }
const cases = {
  async 'closing-render-retained'() {
    const tree = active => h(P, { name: 'parent' }, h(P, { name: 'popup', open: true, escapeActive: active }));
    const e = await mount(tree(true));
    await esc(); take([['popup', true], ['parent', false]]);
    await update(e, tree(false));
    assert.ok(commits.has('popup'), 'Exit animation DOM must remain mounted');
    await esc(); take([['parent', true]]);
    await update(e, tree(true));
    await esc(); take([['popup', true], ['parent', false]]);
  },
  async 'aborted-escape-close'() {
    const pending = signal();
    const tree = closing => h(React.Suspense, { fallback: h('b') }, h(P, { name: 'parent' },
      h(P, { name: 'popup', open: true, escapeActive: !closing }), closing && h(Pending, { signal: pending })));
    const e = await mount(tree(false)); await transition(e, tree(true));
    assert.ok(pending.rendered);
    await esc(); take([['popup', true], ['parent', false]]);
  },
  async 'ordered-fanout'() { await mount(h(React.Fragment, null, keyed('A'), keyed('B'), keyed('C'))); await esc(); assert.deepEqual(calls.splice(0), [['C', true], ['B', false], ['A', false]]); },
  async 'strict-isolated-replay'() { assert.ok(React.Activity, 'Activity is required for state-preserving effect replay'); const count = { a: 0, b: 0 }; function Count({ name }) { React.useLayoutEffect(() => { count[name]++; }, []); return null; } const tree = mode => h(React.StrictMode, null, h(React.Activity, { mode }, h(P, { name: 'A' }, h(Count, { name: 'a' })))); const a = await mount(tree('visible')); await mount(h(P, { name: 'B' }, h(Count, { name: 'b' }))); const before = { ...count }; await update(a, tree('hidden')); await update(a, tree('visible')); assert.ok(count.a > before.a); assert.equal(count.b, before.b); await esc(); take([['B', true], ['A', false]]); },
  async 'aborted-reparent'() { const nodes = {}, pending = signal(); function Capture({ name }) { const node = React.useContext(hook.EscapeContext); React.useLayoutEffect(() => { nodes[name] = node; }); return null; } const tree = (parent, aOpen, suspend = false) => h(React.Fragment, null, h(P, { name: 'A', key: 'A', open: aOpen }, h(Capture, { name: 'A' })), h(P, { name: 'B', key: 'B' }, h(Capture, { name: 'B' })), parent && h(React.Suspense, { fallback: h('b'), key: 'pending' }, h(React.Fragment, null, h(hook.EscapeContext.Provider, { value: nodes[parent] }, keyed('child')), suspend && h(Pending, { signal: pending })))); const e = await mount(tree(null, true)); await update(e, tree('A', true)); await update(e, tree('A', false)); await update(e, tree('A', true)); await transition(e, tree('B', true, true)); assert.ok(pending.rendered); await esc(); take([['child', true], ['A', false], ['B', false]]); },
  async siblings() { const tree = b => h(React.Fragment, null, keyed('A'), keyed('B', b)); const e = await mount(tree(false)); await esc(); take([['A', true]]); await update(e, tree(true)); await esc(); take([['B', true], ['A', false]]); await update(e, tree(false)); await esc(); take([['A', true]]); await update(e, tree(true)); await esc(); take([['B', true], ['A', false]]); },
  async 'reopen-over-new-sibling'() { const tree = (b, c) => h(React.Fragment, null, keyed('A'), keyed('B', b), c && keyed('C')); const e = await mount(tree(true, false)); await update(e, tree(false, true)); await esc(); take([['C', true], ['A', false]]); await update(e, tree(true, true)); await esc(); take([['B', true], ['C', false], ['A', false]]); },
  async nested() { await mount(h(P, { name: 'parent' }, h(P, { name: 'child' }))); await esc(); take([['child', true], ['parent', false]]); },
  async 'nested-strict'() { await mount(h(React.StrictMode, null, h(P, { name: 'parent' }, h(P, { name: 'child' })))); await esc(); take([['child', true], ['parent', false]]); },
  async mixed() { const tree = (child, other) => h(React.Fragment, null, h(P, { name: 'parent', key: 'parent' }, child && keyed('child')), other && keyed('other')); const e = await mount(tree(false, false)); await update(e, tree(false, true)); await esc(); take([['other', true], ['parent', false]]); await update(e, tree(true, true)); await esc(); take([['child', true], ['parent', false], ['other', false]]); await update(e, tree(false, true)); await esc(); take([['other', true], ['parent', false]]); },
  async 'aborted-open'() { const s = signal(); await mount(h(React.Fragment, null, keyed('visible'), h(React.Suspense, { fallback: h('b') }, h(P, { name: 'pending' }, h(Pending, { signal: s }))))); assert.ok(s.rendered); assert.equal(commits.has('pending'), false); await esc(); take([['visible', true]]); },
  async 'aborted-error'() { function Bomb() { throw Error('Synthetic render abort'); } await mount(h(React.Fragment, null, keyed('visible'), h(Boundary, null, h(P, { name: 'failed' }, h(Bomb))))); assert.equal(commits.has('failed'), false); await esc(); take([['visible', true]]); },
  async 'aborted-close'() { const s = signal(); const tree = pending => h(React.Suspense, { fallback: h('b') }, h(React.Fragment, null, keyed('A', !pending), pending && h(Pending, { signal: s }))); const e = await mount(tree(false)); await transition(e, tree(true)); assert.ok(s.rendered); await esc(); take([['A', true]]); },
  async 'aborted-callback'() { const s = signal(), a = cb('committed'), b = cb('abandoned'); const tree = pending => h(React.Suspense, { fallback: h('b') }, h(React.Fragment, null, keyed('A', true, pending ? b : a), pending && h(Pending, { signal: s }))); const e = await mount(tree(false)); await transition(e, tree(true)); assert.ok(s.rendered); await esc(); take([['committed', true]]); },
  async callback() { const e = await mount(keyed('A', true, cb('old'))); await update(e, keyed('A', true, cb('new'))); await esc(); take([['new', true]]); },
  async 'callback-epoch-strict'() { const b = cb('B'); const tree = a => h(React.StrictMode, null, h(Portal, { key: 'A', open: true, getContainer: false, onEsc: a }, h('i')), h(Portal, { key: 'B', open: true, getContainer: false, onEsc: b }, h('i'))); const e = await mount(tree(cb('oldA'))); await update(e, tree(cb('newA'))); await esc(); take([['B', true], ['newA', false]]); },
  async omitted() { await mount(h(React.Fragment, null, keyed('A'), h(Portal, { open: true, getContainer: false }, h('i')))); await esc(); take([['A', false]]); },
  async 'keyboard-false'() { let a = 0, b = 0; const tree = other => h(React.Fragment, null, h(AntdDrawer, { open: true, getContainer: false, onClose: () => a++ }, 'A'), h(AntdDrawer, { open: other, keyboard: false, getContainer: false, onClose: () => b++ }, 'B')); const e = await mount(tree(true)); await esc(); assert.equal(a, 0); assert.equal(b, 0); await update(e, tree(false)); await esc(); assert.equal(a, 1); },
  async composing() { await mount(keyed('A')); await esc({ isComposing: true }); take([]); await esc(); take([['A', true]]); },
  async 'composition-window'() { const original = Date.now; let now = 1000; try { Date.now = () => now; await mount(keyed('A')); window.dispatchEvent(new CompositionEvent('compositionend')); now = 1199; await esc(); take([]); now = 1200; await esc(); take([['A', true]]); now = 1201; await esc(); take([['A', true]]); } finally { Date.now = original; } },
  async inactive() { const tree = parentOpen => h(P, { name: 'parent', open: parentOpen, autoDestroy: false }, keyed('child')); const e = await mount(tree(true)); await update(e, tree(false)); await esc(); take([['child', true]]); },
  async reparent() { assert.ok(hook.EscapeContext, 'Separate Escape context required'); const oldContext = req(path.join(portalRoot, 'lib/Context')).default; assert.notEqual(hook.EscapeContext, oldContext); const nodes = {}; function Capture({ name }) { const value = React.useContext(hook.EscapeContext); React.useLayoutEffect(() => { nodes[name] = value; }); return null; } const tree = (parent, aOpen = true) => h(React.Fragment, null, h(P, { name: 'A', key: 'A', open: aOpen }, h(Capture, { name: 'A' })), h(P, { name: 'B', key: 'B' }, h(Capture, { name: 'B' })), parent && h(hook.EscapeContext.Provider, { value: nodes[parent], key: 'provider' }, keyed('child'))); const e = await mount(tree(null)); await update(e, tree('A')); await esc(); take([['child', true], ['A', false], ['B', false]]); await update(e, tree('B')); await esc(); take([['child', true], ['B', false], ['A', false]]); await update(e, tree('B', false)); await update(e, tree('B', true)); await esc(); take([['A', true], ['child', false], ['B', false]]); },
};
async function main() {
  const name = process.argv[2], receiptPath = process.argv[3]; assert.ok(cases[name], 'Known contract case required');
  const result = { negativeControl: control || null, negativeControlSha256: controlSha256 || null, browserBundleExecution: 'pending-separate-stage', schema: 'platform.portal-escape-contract.v1', case: name, mode: process.env.NODE_ENV, assertions: 'pending', cleanup: 'pending', source: { node: process.version, react: req('react/package.json').version, portal: req(path.join(portalRoot, 'package.json')).version, portalRoot: fs.realpathSync(portalRoot), files: {} }, errors: [] };
  for (const rel of ['package.json', 'lib/useEscKeyDown.js', 'es/useEscKeyDown.js', 'lib/Portal.js', 'es/Portal.js', 'lib/Context.js', 'es/Context.js']) result.source.files[rel] = crypto.createHash('sha256').update(fs.readFileSync(path.join(portalRoot, rel))).digest('hex');
  try { await cases[name](); result.assertions = 'passed'; } catch (error) { result.assertions = 'failed'; result.errors.push({ phase: 'assertion', name: error.name, message: error.message }); }
  if (['keydown', 'compositionend'].includes(process.env.PORTAL_ESCAPE_INJECT_CLEANUP_FAILURE)) window.addEventListener(process.env.PORTAL_ESCAPE_INJECT_CLEANUP_FAILURE, () => {});
  try { for (const entry of roots.splice(0)) { await act(async () => { flushSync(() => entry.rt.unmount()); await delay(); }); entry.host.remove(); } await delay(); result.remainingListeners = Object.fromEntries(Array.from(listeners, ([name, entries]) => [name, entries.size])); assert.deepEqual(result.remainingListeners, { keydown: 0, compositionend: 0 }); assert.equal(document.body.childElementCount, 0); result.cleanup = 'passed'; } catch (error) { result.cleanup = 'failed'; result.errors.push({ phase: 'cleanup', name: error.name, message: error.message }); }
  dom.window.close(); result.runtimeWindowDisposed = true; result.passed = result.assertions === 'passed' && result.cleanup === 'passed';
  if (receiptPath) fs.writeFileSync(receiptPath, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result)); process.exitCode = result.passed ? 0 : 1;
}
const deadline = setTimeout(() => { console.error('Contract timed out'); dom.window.close(); process.exit(124); }, 15000); deadline.unref(); main().catch(error => { console.error(error.stack); dom.window.close(); process.exitCode = 1; });
