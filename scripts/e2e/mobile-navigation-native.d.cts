export type ControlScenario = 'navigation-only' | 'descendant-popup-closing';
export type ControlFocus = 'opener' | 'controlled-popup' | 'navigation' | 'body' | 'other';
export interface ControlState {
  navigationVisibleCount: number;
  navigationOpenCount: number;
  navigationMotionCount: number;
  popupVisibleCount: number;
  popupMotionCount: number;
  popupClosingCount: number;
  otherPopoverVisibleCount: number;
  otherTooltipVisibleCount: number;
  menuActionHovered: boolean;
  popupOpen: boolean;
  focus: ControlFocus;
}
export interface ControlEvent extends ControlState {
  key: 'enter' | 'escape';
  trusted: boolean;
  composing: boolean;
  recentCompositionEnd: boolean;
  elapsedMs: number;
}
export interface ControlCapture extends ControlState {
  scenario: ControlScenario;
  committed: true;
  overflow: false;
  openerConnected: boolean;
  restoredOpener: boolean;
  compositionEndCount: number;
  events: ControlEvent[];
  collapseCalls: boolean[];
}
export function parse(argv: string[]): {
  execute?: boolean;
  '--expected-head'?: string;
  '--output'?: string;
};
export function sources(expectedHead: string): Record<string, unknown>;
export function validateCapture(value: unknown): ControlCapture;
export const BROWSER_DEFINES: Readonly<Record<string, string>>;
