/**
 * EdgeOne Pages deploy-bundle preparation for the public web app.
 *
 * The platform only ships a real 404 when the artifact carries an explicit route table. Without one,
 * a deployment it classifies as a single-page application answers every unknown path — including a
 * missing script — with 200 and the application shell, so the published `404.html` is never reached.
 *
 * The route table is not written by hand. The pinned EdgeOne CLI generates it from the complete
 * bundle layout (`.edgeone/assets/**` — the site — plus `edgeone.json` at the bundle root), and its
 * output is the authority for the compiled filesystem pattern, the embedded `conf` headers and
 * rewrites, and the shape of every entry. This module only:
 *
 *   1. stages that bundle layout from the built site,
 *   2. corrects the one erroneous entry — the CLI's terminal fallback, which serves the 404 document
 *      with a 200 status, or the application shell when the deployment is classified as an SPA —
 *      into an explicit `dest: /404.html` with `status: 404`,
 *   3. verifies the corrected table before it is deployed.
 *
 * Everything else the CLI emitted is preserved byte for byte, so no provider glob or wildcard
 * semantics are re-implemented here. Generation itself runs as `edgeone pages generate-routes` from
 * the bundle root; the corrections below are applied afterwards.
 */
import fs from 'node:fs';
import path from 'node:path';

export const ROUTES_VERSION = 3;
export const ROUTES_RELATIVE_PATH = path.posix.join('.edgeone', 'routes.json');
export const ASSETS_RELATIVE_PATH = path.posix.join('.edgeone', 'assets');
export const HOSTING_CONFIG_NAME = 'edgeone.json';
export const NOT_FOUND_DOCUMENT = '/404.html';
/** The CLI's own terminal fallback pattern; the correction rewrites its target, never its spelling. */
export const FALLBACK_PATTERN = '/.*';
/** Catch-all spellings that must never be left pointing at the application shell. */
const SHELL_DOCUMENT = '/index.html';
/** A terminal catch-all may only target one of these documents, and must not reach a function. */
const FALLBACK_TARGETS = new Set([NOT_FOUND_DOCUMENT, SHELL_DOCUMENT]);
/** Routing files the pinned CLI derives from the assets; they must not survive into a new build. */
const DERIVED_BUNDLE_PATHS = Object.freeze([ROUTES_RELATIVE_PATH]);
const FUNCTION_MARKERS = Object.freeze(['module', 'server-name']);
export const REQUIRED_ARTIFACTS = Object.freeze([
  NOT_FOUND_DOCUMENT,
  SHELL_DOCUMENT,
  '/robots.txt',
  '/oauth-consent-bridge.html',
]);
const CATCH_ALL = new Set([FALLBACK_PATTERN, '^/.*$', '^/(.*)$']);

export function readRouteTable(routesPath) {
  if (!fs.existsSync(routesPath))
    throw new Error(
      `${routesPath} does not exist; run the pinned CLI's \`pages generate-routes\` from the bundle root first`,
    );
  return JSON.parse(fs.readFileSync(routesPath, 'utf8'));
}

export function serializeRouteTable(table) {
  // The pinned CLI writes the table without a trailing newline; preserve that exactly.
  return JSON.stringify(table, null, 2);
}

export const isCatchAll = (route) => typeof route?.src === 'string' && CATCH_ALL.has(route.src);

/**
 * Apply the bounded correction: exactly one *terminal* catch-all must serve the 404 document with a
 * real 404 status. Anything else — several catch-alls, a catch-all that is not last, one that reaches
 * a server function, or one that targets some other document — is refused rather than rewritten, so
 * a shape we do not understand can never be silently deployed. Every other entry, including the
 * CLI's compiled filesystem pattern, its `server-name` marker and the embedded `conf` block, is
 * preserved exactly as generated.
 */
export function correctRouteTable(table) {
  if (!table || typeof table !== 'object' || Array.isArray(table))
    throw new Error('The generated routing table must be a JSON object');
  if (!Array.isArray(table.routes) || table.routes.length === 0)
    throw new Error('The generated routing table has no routes to correct');

  const catchAlls = table.routes
    .map((route, index) => ({ route, index }))
    .filter(({ route }) => isCatchAll(route));
  if (catchAlls.length !== 1)
    throw new Error(`Expected exactly one terminal catch-all route, found ${catchAlls.length}`);
  const [{ route, index }] = catchAlls;
  if (index !== table.routes.length - 1)
    throw new Error(
      `The catch-all route is not terminal: ${table.routes.length - index - 1} route(s) follow it`,
    );
  if (typeof route.dest !== 'string' || !FALLBACK_TARGETS.has(route.dest))
    throw new Error(
      `The catch-all route targets ${JSON.stringify(route.dest)} instead of a known 404 document`,
    );
  for (const marker of FUNCTION_MARKERS)
    if (
      typeof route[marker] === 'string' &&
      !(marker === 'server-name' && route[marker] === 'file')
    )
      throw new Error(`The catch-all route is served by a function (${marker}: ${route[marker]})`);

  const previous = { dest: route.dest, status: route.status };
  const corrected = JSON.parse(JSON.stringify(table));
  corrected.routes[index] = { ...route, dest: NOT_FOUND_DOCUMENT, status: 404 };
  return {
    table: corrected,
    corrected: JSON.stringify(corrected) !== JSON.stringify(table),
    previous,
    index,
  };
}

const matchesPath = (pattern, pathname) => {
  try {
    return new RegExp(pattern, 'u').test(pathname);
  } catch {
    return false;
  }
};

/**
 * Fail closed on a table that would not answer a real 404, or that lost the CLI's compiled config.
 * `conf` is the hosting configuration the platform applies; dropping or rewriting it would change
 * production headers and the OAuth consent rewrite.
 */
export function verifyRouteTable(table, { requiredPaths = REQUIRED_ARTIFACTS } = {}) {
  const problems = [];
  if (table?.version !== ROUTES_VERSION) problems.push(`version must be ${ROUTES_VERSION}`);
  const routes = Array.isArray(table?.routes) ? table.routes : [];
  const handlers = routes.filter((route) => route?.handle === 'filesystem');
  if (handlers.length !== 1)
    problems.push(`expected exactly one filesystem handler, found ${handlers.length}`);
  if (handlers.length === 1 && typeof handlers[0].src !== 'string')
    problems.push('the filesystem handler lost the compiled asset pattern');
  for (const route of routes)
    if (isCatchAll(route) && route.dest === SHELL_DOCUMENT)
      problems.push('a catch-all route still answers with the application shell');
  const terminal = routes.filter(isCatchAll).at(-1);
  if (!terminal) problems.push('no terminal catch-all route');
  else {
    if (terminal.dest !== NOT_FOUND_DOCUMENT)
      problems.push(`terminal catch-all serves ${terminal.dest}`);
    if (terminal.status !== 404) problems.push(`terminal catch-all status is ${terminal.status}`);
  }
  const configuration = table?.conf;
  if (!configuration || typeof configuration !== 'object')
    problems.push('the embedded conf block is missing');
  else {
    if (!Array.isArray(configuration.headers) || configuration.headers.length === 0)
      problems.push('conf.headers is empty');
    if (!Array.isArray(configuration.rewrites)) problems.push('conf.rewrites is missing');
  }
  if (handlers.length === 1 && typeof handlers[0].src === 'string')
    for (const pathname of requiredPaths)
      if (!matchesPath(handlers[0].src, pathname))
        problems.push(`the compiled filesystem pattern does not cover ${pathname}`);
  if (problems.length)
    throw new Error(`EdgeOne routing verification failed: ${problems.join('; ')}`);
  return {
    routes: routes.length,
    headers: configuration.headers.length,
    rewrites: configuration.rewrites.length,
  };
}

const assertNotSymlink = (target, action) => {
  const stats = fs.lstatSync(target, { throwIfNoEntry: false });
  if (stats?.isSymbolicLink())
    throw new Error(`Refusing to ${action} through a symlinked path: ${target}`);
};

/**
 * Public paths of the bundle's own staged assets. The compiled filesystem pattern is derived from the
 * asset names of one build, so verification compares it against *this* bundle's real files: a stale
 * table kept from an earlier build no longer covers the current hashed names and must fail.
 */
export function bundleAssetPaths(bundleDir) {
  const assets = path.join(bundleDir, ASSETS_RELATIVE_PATH);
  if (!fs.existsSync(assets)) return [];
  const found = [];
  const walk = (directory) => {
    for (const entry of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const child = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Refusing a symlinked staged asset: ${child}`);
      if (entry.isDirectory()) {
        walk(child);
        continue;
      }
      if (!entry.isFile()) throw new Error(`Refusing a non-file staged asset: ${child}`);
      found.push(`/${path.relative(assets, child).split(path.sep).join('/')}`);
    }
  };
  walk(assets);
  return found.sort();
}

/** Stage the complete bundle layout the pinned CLI expects: `edgeone.json` plus `.edgeone/assets`. */
export function stageBundle({ distDir, bundleDir, configPath }) {
  const dist = path.resolve(distDir);
  const bundle = path.resolve(bundleDir);
  if (dist === bundle) throw new Error('The bundle directory must differ from the build output');
  const contains = (outer, inner) => inner === outer || inner.startsWith(outer + path.sep);
  if (contains(dist, bundle) || contains(bundle, dist))
    throw new Error(
      `The bundle directory and the build output must not contain one another: ${bundle}`,
    );
  for (const artifact of REQUIRED_ARTIFACTS) {
    const source = path.join(dist, artifact.replace(/^\//u, ''));
    if (!fs.existsSync(source))
      throw new Error(
        `Cannot stage the EdgeOne bundle: ${path.relative(dist, source)} is missing from ${dist}`,
      );
  }
  // Check every staging component before invalidating a file underneath it.
  // Checking only the final file would follow a symlinked bundle or .edgeone parent.
  const assets = path.join(bundle, ASSETS_RELATIVE_PATH);
  for (const target of [bundle, path.dirname(assets), assets])
    assertNotSymlink(target, 'replace the staged assets');
  // The pinned CLI skips generation when a routing file already exists. A table left from an earlier
  // build carries that build's hashed asset pattern and would 404 the current files, so it is removed
  // before staging; generation then runs against this build's assets.
  for (const relative of DERIVED_BUNDLE_PATHS) {
    const target = path.join(bundle, relative);
    assertNotSymlink(target, 'invalidate a derived routing file');
    fs.rmSync(target, { force: true });
  }
  fs.rmSync(assets, { recursive: true, force: true });
  fs.mkdirSync(assets, { recursive: true });
  let staged = 0;
  for (const entry of fs.readdirSync(dist, { withFileTypes: true })) {
    if (entry.name === '.edgeone') continue;
    const from = path.join(dist, entry.name);
    const to = path.join(assets, entry.name);
    fs.cpSync(from, to, { recursive: true, dereference: false });
    staged += 1;
  }
  fs.copyFileSync(configPath, path.join(bundle, HOSTING_CONFIG_NAME));
  return { assets, staged };
}

/**
 * Correct, or verify, the route table the pinned CLI generated in the bundle. `check` never writes,
 * and verification covers the bundle's own assets so a table generated for a different build fails.
 */
export function prepareBundle({ bundleDir, check = false }) {
  const routesPath = path.join(bundleDir, ROUTES_RELATIVE_PATH);
  for (const artifact of REQUIRED_ARTIFACTS) {
    const file = path.join(bundleDir, ASSETS_RELATIVE_PATH, artifact.slice(1));
    if (!fs.lstatSync(file, { throwIfNoEntry: false })?.isFile())
      throw new Error(`The deploy bundle is missing a regular boundary document: ${artifact}`);
  }
  const table = readRouteTable(routesPath);
  const { table: corrected, corrected: changed, previous } = correctRouteTable(table);
  const requiredPaths = [...REQUIRED_ARTIFACTS, ...bundleAssetPaths(bundleDir)];
  if (check) {
    // Verify the table as it exists on disk: a deploy bundle that still needs correction must fail,
    // not pass because a corrected copy would have been acceptable.
    verifyRouteTable(table, { requiredPaths });
    return { routesPath, changed, checked: true, previous };
  }
  verifyRouteTable(corrected, { requiredPaths });
  if (changed) fs.writeFileSync(routesPath, serializeRouteTable(corrected));
  return { routesPath, changed, checked: false, previous };
}
