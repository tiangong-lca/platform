export type BrowserName = 'chromium' | 'firefox' | 'webkit';
export type Control = 'valid' | 'missing-share' | 'total-99' | 'cancel';
export type Identity = {
  browser: BrowserName;
  project: BrowserName;
  scope: 'qualification-diagnostic-only' | 'native-control';
  control: Control | null;
};
export type Tri = 'true' | 'false' | 'unknown';
export type Stage =
  'initial' | 'first-share-input-capture' | 'first-ok-capture' | 'first-ok-bubble' | 'final';
export type Snapshot = {
  rootConnected: boolean;
  rootElementVisibility: 'visible' | 'hidden' | 'unknown';
  scanStatus:
    | 'complete'
    | 'detached'
    | 'node-cap'
    | 'depth-cap'
    | 'match-cap'
    | 'text-cap'
    | 'shape-error'
    | 'read-fault';
  counts: Record<
    'rawRow' | 'rawCheckbox' | 'add' | 'target' | 'share' | 'ok' | 'alerts',
    number | null
  >;
  controlCoverage: 'expected' | 'missing' | 'ambiguous' | 'not-applicable' | 'unknown';
  rawSelected: Tri;
  targetMatchesB: Tri;
  shareMatches100: Tri;
  nativeOkDisabled: Tri;
  ariaOkDisabled: Tri;
  alertVisibility: Record<'invalid' | 'loadFailed' | 'other', number | null>;
  focus: 'none' | 'body' | 'share' | 'ok' | 'other-within-batch' | 'outside' | 'unknown';
};
export type Slot = {
  status: 'not-observed' | 'observed' | 'observer-fault';
  snapshot: Snapshot | null;
  fault: 'install' | 'read' | 'shape' | 'finish' | 'validation' | null;
};
export type EventKind = 'input' | 'change' | 'blur' | 'click' | 'pointerdown' | 'pointerup';
export type TargetKind =
  | 'raw-checkbox'
  | 'add-allocation'
  | 'target-combobox'
  | 'share-input'
  | 'ok'
  | 'other-within-batch';
export type BrowserCapture = {
  rootIdentity: 'original-only';
  popupObservation: 'omitted';
  compositionPrehistory: 'unknown';
  slots: Record<Stage, Slot>;
  records: Array<{
    sequence: number;
    elapsedMs: number;
    event: EventKind;
    target: TargetKind;
    phase: 'document-capture' | 'window-bubble';
    trusted: boolean;
    defaultPrevented: boolean;
    composing: 'true' | 'false' | 'unavailable';
  }>;
  counters: { callbacks: number; events: Record<EventKind, number> };
  overflow: Record<'records' | 'counts' | 'elapsed' | 'eventWork' | 'ancestry', boolean>;
  observerErrors: number;
  disposal: { closed: boolean; removed: number; failed: number; handleDeleted: boolean };
};
export type SourceBinding = {
  mode: 'archived-candidate' | 'controlled-native';
  historicalCommit: string;
  historicalTree: string;
  executedHead: string;
  executedTree: string;
  candidateArchiveSha256: string | null;
  candidateManifestSha256: string | null;
  e2eTree: string | null;
  runnerTree: string | null;
  environmentSha256: string;
  observerSha256: string;
  contractSha256: string;
  testSha256: string;
  installedControlsSha256: string;
  browserRuntimeSha256: string;
};
export type ErrorCounters = {
  pageErrorCount: number;
  consoleErrorCount: number;
  counterOverflow: boolean;
};
export type DiagnosticReport = Identity & {
  kind: 'tiangong.batch-allocation-diagnostic';
  schemaVersion: 1;
  case: 'process-allocation-batch';
  source: SourceBinding;
  originalStepOutcome: 'passed' | 'failed';
  captureStatus: 'complete' | 'incomplete' | 'invalid';
  capture: BrowserCapture;
} & ErrorCounters;
export type RuntimeBinding = { outputDirectory: string; source: SourceBinding; identity: Identity };
export const LIMITS: Readonly<{
  records: 48;
  bytes: 24576;
  count: 255;
  elapsedMs: 120000;
  nodes: 2048;
  depth: 32;
  matches: 8;
  callbacks: 256;
}>;
export const BROWSERS: readonly BrowserName[];
export const CONTROLS: readonly Control[];
export const SLOTS: readonly Stage[];
export const EVENTS: readonly EventKind[];
export const TARGETS: readonly TargetKind[];
export const COUNT_KEYS: readonly (keyof Snapshot['counts'])[];
export const FLAGS: readonly (keyof BrowserCapture['overflow'])[];
export const HISTORICAL_COMMIT: string;
export const HISTORICAL_TREE: string;
export function assertCapture(value: unknown): BrowserCapture;
export function captureComplete(value: BrowserCapture): boolean;
export function assertSource(value: unknown): void;
export function assertIdentity(value: unknown): void;
export function assertReport(value: unknown): DiagnosticReport;
export function emptyCapture(): BrowserCapture;
export function buildReport(
  source: SourceBinding,
  capture: unknown,
  counters: ErrorCounters,
  outcome: 'passed' | 'failed',
  identity: Identity,
  observerFailed?: boolean,
): DiagnosticReport;
export function readRuntimeBinding(
  env: NodeJS.ProcessEnv | undefined,
  root: string | undefined,
  identity: Identity,
): RuntimeBinding;
export function validateRuntimeAdmission(
  env: NodeJS.ProcessEnv | undefined,
  root: string | undefined,
  identity: Identity,
): RuntimeBinding;
export function admitNativeBinding(options: {
  outputDirectory: string;
  source: SourceBinding;
  identity: Identity;
  stableFiles: Array<[string, string]>;
}): RuntimeBinding;
export function writeReport(
  binding: RuntimeBinding,
  report: DiagnosticReport,
): { path: string; sha256: string; bytes: number };
export function runObservedStep(options: {
  install(): Promise<void>;
  original(): Promise<void>;
  finish(): Promise<unknown>;
  removePageError(): void | Promise<void>;
  removeConsoleError(): void | Promise<void>;
  publish(
    capture: unknown,
    outcome: 'passed' | 'failed',
    observerFailed: boolean,
  ): boolean | Promise<boolean>;
}): Promise<void>;
