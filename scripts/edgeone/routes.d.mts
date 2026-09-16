export interface Route {
  src?: string;
  dest?: string;
  status?: number;
  handle?: string;
  'server-name'?: string;
  headers?: Record<string, string>;
}

export interface EmbeddedConfiguration {
  headers?: unknown[];
  redirects?: unknown[];
  rewrites?: unknown[];
  caches?: unknown[];
}

export interface RouteTable {
  version: number;
  routes: Route[];
  conf?: EmbeddedConfiguration;
}

export interface CorrectionResult {
  readonly table: RouteTable;
  readonly corrected: boolean;
  readonly previous: Readonly<{ dest?: string; status?: number }>;
  readonly index: number;
}

export interface VerificationResult {
  readonly routes: number;
  readonly headers: number;
  readonly rewrites: number;
}

export interface PrepareResult {
  readonly routesPath: string;
  readonly changed: boolean;
  readonly checked: boolean;
  readonly previous: Readonly<{ dest?: string; status?: number }>;
}

export declare const ROUTES_VERSION: 3;
export declare const ROUTES_RELATIVE_PATH: string;
export declare const ASSETS_RELATIVE_PATH: string;
export declare const HOSTING_CONFIG_NAME: 'edgeone.json';
export declare const NOT_FOUND_DOCUMENT: '/404.html';
export declare const FALLBACK_PATTERN: '/.*';
export declare const REQUIRED_ARTIFACTS: readonly string[];

export declare function readRouteTable(routesPath: string): RouteTable;
export declare function serializeRouteTable(table: RouteTable): string;
export declare function isCatchAll(route: Route | undefined): boolean;
export declare function correctRouteTable(table: RouteTable): CorrectionResult;
export declare function verifyRouteTable(
  table: RouteTable,
  options?: { requiredPaths?: readonly string[] },
): VerificationResult;
export declare function stageBundle(options: {
  distDir: string;
  bundleDir: string;
  configPath: string;
}): { assets: string; staged: number };
export declare function prepareBundle(options: { bundleDir: string; check?: boolean }): PrepareResult;
