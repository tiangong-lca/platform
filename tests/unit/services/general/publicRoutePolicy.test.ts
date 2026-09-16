import {
  ANONYMOUS_ROUTE_PATHS,
  isAnonymousAllowedPath,
  LOGIN_PATH,
  OAUTH_CONSENT_PATH,
  resolveSafeLoginRedirect,
} from '@/services/general/publicRoutePolicy';
import fs from 'node:fs';
import path from 'node:path';
import appRoutes from '../../../../config/routes';

type RouteNode = {
  path?: string;
  redirect?: string;
  routes?: readonly RouteNode[];
};

const collectConfiguredPaths = (routes: readonly RouteNode[]): readonly string[] =>
  routes.flatMap((route) => [
    ...(route.path ? [route.path] : []),
    ...collectConfiguredPaths(route.routes ?? []),
  ]);

const anonymousRoutePathSet = new Set<string>(ANONYMOUS_ROUTE_PATHS);
const configuredProtectedPaths = [...new Set(collectConfiguredPaths(appRoutes as RouteNode[]))]
  .filter((path) => path !== '*')
  .filter((path) => !anonymousRoutePathSet.has(path));
const caseVariantProtectedPaths = configuredProtectedPaths
  .map((path) => path.replace(/[a-z]/u, (character) => character.toUpperCase()))
  .filter((path, index) => path !== configuredProtectedPaths[index]);

const publicRoot = path.resolve(process.cwd(), 'public');
const collectPublicHtmlPaths = (directory: string): readonly string[] =>
  fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return collectPublicHtmlPaths(absolutePath);
      }
      return entry.name.endsWith('.html')
        ? [`/${path.relative(publicRoot, absolutePath).split(path.sep).join('/')}`]
        : [];
    })
    .sort();

describe('anonymous route policy', () => {
  it('keeps anonymous entry limited to login/recovery and the self-verifying consent route', () => {
    expect(ANONYMOUS_ROUTE_PATHS).toEqual([
      LOGIN_PATH,
      '/user/login/password_forgot',
      '/user/login/password_reset',
      OAUTH_CONSENT_PATH,
    ]);
  });

  it.each(ANONYMOUS_ROUTE_PATHS)('allows the explicit anonymous entry route %s', (pathname) => {
    expect(isAnonymousAllowedPath(pathname)).toBe(true);
  });

  it.each(configuredProtectedPaths)('protects the configured application route %s', (pathname) => {
    expect(isAnonymousAllowedPath(pathname)).toBe(false);
  });

  it.each(caseVariantProtectedPaths)(
    'protects the case-variant configured application route %s',
    (pathname) => {
      expect(isAnonymousAllowedPath(pathname)).toBe(false);
    },
  );

  it.each([
    '/missing-page',
    '/umi/plugin/openapi',
    '/Review',
    '/Tgdata/processes',
    '/User/Login',
    '/user/login/',
    '/user/login///',
  ])('fails closed for unmatched or case-variant route %s', (pathname) => {
    expect(isAnonymousAllowedPath(pathname)).toBe(false);
  });

  it('keeps the root redirect query contract explicit without making root anonymous', () => {
    expect(appRoutes.find(({ path }) => path === '/')).toEqual(
      expect.objectContaining({ redirect: '/welcome', keepQuery: true }),
    );
    expect(isAnonymousAllowedPath('/')).toBe(false);
    expect(isAnonymousAllowedPath('/welcome')).toBe(false);
  });

  it.each([
    [
      '/oauth/consent?authorization_id=jteae32pgurfg3oqqppq2yravsyh4ezw',
      '/oauth/consent?authorization_id=jteae32pgurfg3oqqppq2yravsyh4ezw',
    ],
    ['/welcome#section', '/welcome#section'],
    ['https://evil.example/callback', '/'],
    ['//evil.example/callback', '/'],
    ['/\\evil.example/callback', '/'],
    ['/\t/evil.example/callback', '/'],
    ['javascript:alert(1)', '/'],
    [null, '/'],
  ] as const)('resolves post-login redirect %s to %s', (redirect, expected) => {
    expect(resolveSafeLoginRedirect(redirect)).toBe(expected);
  });

  it('keeps SPA-external HTML limited to error, maintenance, consent and legal documents', () => {
    expect(collectPublicHtmlPaths(publicRoot)).toEqual([
      '/404.html',
      '/maintenance.html',
      '/oauth-consent-bridge.html',
      '/privacy_notice.html',
      '/terms_of_use.html',
    ]);
  });
});
