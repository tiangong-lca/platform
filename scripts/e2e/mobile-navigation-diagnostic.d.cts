export type FocusCategory =
  | 'none'
  | 'body'
  | 'menu-action'
  | 'language-action'
  | 'avatar-action'
  | 'navigation'
  | 'other-overlay'
  | 'other';
export type NavigationState = {
  navigationCount: number;
  navigationVisibleCount: number;
  navigationHiddenCount: number;
  navigationOpenCount: number;
  navigationMotionCount: number;
  dialogVisibleCount: number;
  modalVisibleCount: number;
  menuVisibleCount: number;
  listboxVisibleCount: number;
  dropdownVisibleCount: number;
};
export type NavigationSnapshot = {
  elapsedMs: number;
  focus: FocusCategory;
  state: NavigationState;
};
export type NavigationRecord = NavigationSnapshot & {
  sequence: number;
  stage: 'initial' | 'document-capture' | 'window-bubble' | 'post-escape-frame';
  key: 'none' | 'enter' | 'escape';
  trusted: boolean;
  composing: boolean;
  defaultPrevented: boolean;
};
export type OverlayCounts = [visible: number, motion: number, closing: number];
export type ObservedComposition = [windowEndCount: number, lastEndElapsedMs: number | null];
export type NavigationDetail = {
  recordSequence: number | null;
  popover: OverlayCounts;
  tooltip: OverlayCounts;
  composition: ObservedComposition;
};
export type NavigationDetails = {
  initial: NavigationDetail | null;
  escapeCapture: NavigationDetail | null;
  escapeBubble: NavigationDetail | null;
  frame: NavigationDetail | null;
  final: NavigationDetail | null;
};
export type FrameLifecycle = {
  scheduled: 0 | 1;
  completed: 0 | 1;
  cancelled: 0 | 1;
  triggerSequence: number | null;
};
export type BrowserCapture = {
  records: NavigationRecord[];
  final: NavigationSnapshot | null;
  recordOverflow: boolean;
  countOverflow: boolean;
  observerErrorCount: number;
  disposed: boolean;
  compositionPrehistory: 'unknown';
  details: NavigationDetails;
  frame: FrameLifecycle;
};
export type SourceBinding = {
  candidateCommit: string;
  candidateTree: string;
  candidateArchiveSha256: string;
  candidateManifestSha256: string;
  e2eTree: string;
  runnerTree: string;
  observerSha256: string;
  contractSha256: string;
};
export type RuntimeBinding = { outputDirectory: string; source: SourceBinding };
export type ErrorCounters = {
  pageErrorCount: number;
  consoleErrorCount: number;
  counterOverflow: boolean;
};
export type DiagnosticReport = {
  kind: 'tiangong.mobile-navigation-diagnostic';
  schemaVersion: 2;
  scope: 'qualification-diagnostic-only';
  case: 'responsive-mobile-navigation';
  browser: 'chromium';
  source: SourceBinding;
  originalStepOutcome: 'passed' | 'failed';
  captureStatus: 'complete' | 'incomplete' | 'invalid';
  pageErrorCount: number;
  consoleErrorCount: number;
  counterOverflow: boolean;
  capture: BrowserCapture;
};
export const BASENAME: 'mobile-navigation-diagnostic.json';
export const LIMITS: Readonly<{
  records: 48;
  bytes: 24576;
  count: 255;
  elapsedMs: 600000;
  nodes: 32;
  animations: 32;
}>;
export const FOCUS: readonly FocusCategory[];
export const STATE_KEYS: readonly (keyof NavigationState)[];
export function assertReport(value: unknown): DiagnosticReport;
export function assertCapture(value: unknown): asserts value is BrowserCapture;
export function buildReport(
  source: SourceBinding,
  capture: unknown,
  counters: ErrorCounters,
  originalStepOutcome: 'passed' | 'failed',
  observerFailed?: boolean,
): DiagnosticReport;
export function readRuntimeBinding(env?: NodeJS.ProcessEnv, root?: string): RuntimeBinding;
export function writeReport(
  binding: RuntimeBinding,
  report: DiagnosticReport,
): { path: string; sha256: string; bytes: number };
