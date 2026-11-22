import { generateKeyPairSync, sign } from 'node:crypto';

import type { BrowserContext, Page, Request, Route } from '@playwright/test';

import {
  SEMANTIC_HARNESS_USER_ID,
  semanticPersonaRoleProjection,
  createControlledResponseGate,
  type HarnessPersona,
} from './harness-contract';
import { readVerifiedProductionBackendTarget } from './production-backend-target';
import { makeMinimalProcessJson, readProductionDataLedger } from './production-data-ledger';
import { classifyProductionRequest, type ProductionRequestGuard } from './production-request-guard';
import {
  assertExactReadOnlyProcessValidationDraft,
  PROCESS_SAVE_DRAFT_PATH,
} from './typed-view-readonly-fixture';

export const SYNTHETIC_ACTOR_B = '70400000-0000-4000-8000-000000000705';

const SIMULATED_USER_ID = SEMANTIC_HARNESS_USER_ID;
const SIMULATED_EMAIL = 'semantic-harness@example.invalid';
const SIMULATED_KEY_ID = 'semantic-harness-qualification-key';
const WELCOME_VIDEO_SIGN_PATH =
  '/storage/v1/object/sign/sys-files/video/platform_usage_process_first_matched.mp4';
const SEMANTIC_REST_QUERY_KEYS = {
  processes: new Set([
    'id',
    'json_ordered->processDataSet->modellingAndValidation->LCIMethodAndAllocation->>typeOfDataSet',
    'limit',
    'modified_at',
    'offset',
    'order',
    'owner_id',
    'or',
    'review_id',
    'reviews',
    'rule_verification',
    'select',
    'state_code',
    'team_id',
    'user_id',
    'version',
  ]),
  roles: new Set([
    'and',
    'created_at',
    'id',
    'limit',
    'modified_at',
    'order',
    'or',
    'role',
    'select',
    'team_id',
    'user_id',
  ]),
  teams: new Set([
    'created_at',
    'id',
    'is_public',
    'limit',
    'offset',
    'order',
    'owner_id',
    'rank',
    'select',
  ]),
} as const;
const { privateKey: simulatedPrivateKey, publicKey: simulatedPublicKey } = generateKeyPairSync(
  'rsa',
  { modulusLength: 2048 },
);
const simulatedPublicJwk = {
  ...(simulatedPublicKey.export({ format: 'jwk' }) as JsonWebKey),
  alg: 'RS256',
  kid: SIMULATED_KEY_ID,
  use: 'sig',
};

function base64Url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function simulatedAccessToken(
  issuer: string,
  subject = SIMULATED_USER_ID,
  expiresAt = 4_102_444_800,
): string {
  const unsigned = [
    base64Url({ alg: 'RS256', kid: SIMULATED_KEY_ID, typ: 'JWT' }),
    base64Url({
      aud: 'authenticated',
      email: SIMULATED_EMAIL,
      exp: expiresAt,
      iat: 1_775_000_000,
      iss: `${issuer}/auth/v1`,
      role: 'authenticated',
      sub: subject,
      user_metadata: {},
    }),
  ].join('.');
  return `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), simulatedPrivateKey).toString(
    'base64url',
  )}`;
}

async function responseFor(
  route: Route,
  persona: HarnessPersona,
  backendOrigin: string,
  processState: { json: Record<string, unknown> },
  authRace?: SyntheticAuthRace,
): Promise<unknown> {
  const target = new URL(route.request().url());
  if (target.pathname === '/auth/v1/.well-known/jwks.json') {
    return { keys: [simulatedPublicJwk] };
  }
  if (target.pathname === '/auth/v1/token') {
    const body = JSON.parse(route.request().postData() ?? '{}');
    const refresh = target.searchParams.get('grant_type') === 'refresh_token';
    const subject =
      body.email === 'actor-b@example.invalid' ? SYNTHETIC_ACTOR_B : SIMULATED_USER_ID;
    if (refresh && authRace) {
      authRace.refresh.markStarted();
      await authRace.refresh.released;
    }
    const expiresAt = authRace ? Math.floor(Date.now() / 1000) + 3600 : 4_102_444_800;
    const accessToken = simulatedAccessToken(backendOrigin, subject, expiresAt);
    return {
      access_token: accessToken,
      expires_in: 3600,
      expires_at: expiresAt,
      refresh_token: `qualification-refresh-${subject}`,
      token_type: 'bearer',
      user: {
        app_metadata: { provider: 'email', providers: ['email'] },
        aud: 'authenticated',
        email: SIMULATED_EMAIL,
        id: subject,
        role: 'authenticated',
        user_metadata: {},
      },
    };
  }
  if (target.pathname === '/auth/v1/user') {
    const bearer = route.request().headers().authorization?.split(' ')[1];
    const subject: string = bearer
      ? JSON.parse(Buffer.from(bearer.split('.')[1], 'base64url').toString()).sub
      : SIMULATED_USER_ID;
    return {
      app_metadata: { provider: 'email', providers: ['email'] },
      aud: 'authenticated',
      email: SIMULATED_EMAIL,
      id: subject,
      role: 'authenticated',
      user_metadata: {},
    };
  }
  if (target.pathname.startsWith('/storage/v1/object/sign/')) {
    return {
      signedURL: `${target.pathname.replace(/^\/storage\/v1/u, '')}?token=semantic-harness-qualification`,
    };
  }
  if (target.pathname === '/rest/v1/roles') {
    return semanticPersonaRoleProjection(persona);
  }
  if (target.pathname === '/rest/v1/processes') {
    const ledger = await readProductionDataLedger();
    if (!ledger) return [];
    return [
      {
        id: ledger.id,
        json: processState.json,
        modified_at: '2026-07-29T00:00:00.000Z',
        reviews: [],
        rule_verification: false,
        state_code: 0,
        team_id: null,
        version: ledger.version,
      },
    ];
  }
  if (target.pathname === '/rest/v1/teams') {
    return [];
  }
  if (target.pathname.startsWith('/functions/v1/')) {
    const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
    if (target.pathname === '/functions/v1/app_data_product_commands') {
      return body.action === 'list_task_feed'
        ? { data: { items: [] }, ok: true }
        : { data: [], ok: true };
    }
    if (target.pathname === '/functions/v1/app_worker_jobs' && body.action === 'list') {
      return { command: 'worker_jobs_list', data: [] };
    }
    if (target.pathname === '/functions/v1/lca_release_results') {
      return {
        code: 'publication_not_found',
        message: 'No deterministic release fixture is selected.',
        ok: false,
        status: 404,
      };
    }
    return { data: [], success: true };
  }
  if (target.pathname.startsWith('/rest/v1/rpc/')) {
    if (
      [
        '/rest/v1/rpc/list_dataset_display_candidates_filtered',
        '/rest/v1/rpc/list_displayed_datasets_filtered',
      ].includes(target.pathname)
    )
      return { data: [], total: 0 };
    return [];
  }
  if (route.request().method() === 'OPTIONS') {
    return {};
  }
  throw new Error(
    `Semantic backend simulator has no response contract for ${route.request().method()} ${
      target.pathname
    }.`,
  );
}

/** Opt-in synthetic Auth transport controls; never replaces the browser SDK or its events. */
export function createSyntheticAuthRace() {
  const taskRequests: { subject: string | null; path: string }[] = [];
  return { refresh: createControlledResponseGate(), taskRequests };
}
type SyntheticAuthRace = ReturnType<typeof createSyntheticAuthRace>;

export type SemanticBackendSimulator = ProductionRequestGuard & {
  externalRequests: number;
  fulfilledRequests: number;
  productionWrites: number;
  requestCounts: Record<string, number>;
  simulatedMutations: number;
};

function assertKnownSemanticBackendRequest(request: Request) {
  const target = new URL(request.url());
  const method = request.method();
  if (method === 'OPTIONS' || target.pathname.startsWith('/auth/v1/')) return;
  if (target.pathname.startsWith('/storage/v1/object/sign/')) {
    if (target.pathname !== WELCOME_VIDEO_SIGN_PATH) {
      throw new Error(`Unexpected semantic storage request: ${method} ${target.pathname}.`);
    }
    return;
  }
  const restMatch = /^\/rest\/v1\/(processes|roles|teams)$/u.exec(target.pathname);
  if (restMatch) {
    const table = restMatch[1] as keyof typeof SEMANTIC_REST_QUERY_KEYS;
    const keys = [...target.searchParams.keys()];
    const allowed: ReadonlySet<string> = SEMANTIC_REST_QUERY_KEYS[table];
    if (
      method !== 'GET' ||
      keys.length !== new Set(keys).size ||
      keys.some((key) => !allowed.has(key))
    ) {
      throw new Error(
        `Unexpected semantic REST request: ${method} ${target.pathname}; query-keys=${[
          ...new Set(keys),
        ]
          .sort()
          .join(',')}.`,
      );
    }
    return;
  }
  if (target.pathname.startsWith('/rest/v1/rpc/') || target.pathname.startsWith('/functions/v1/')) {
    return;
  }
  throw new Error(`Unexpected semantic backend request: ${method} ${target.pathname}.`);
}

export async function installSemanticBackendSimulator(
  target: BrowserContext | Page,
  persona: HarnessPersona = 'standard_user',
  options: { allowLedgerControlledProcessSaveDraft?: boolean; authRace?: SyntheticAuthRace } = {},
): Promise<SemanticBackendSimulator> {
  const backend = readVerifiedProductionBackendTarget();
  const semanticLedger = await readProductionDataLedger();
  if (!semanticLedger) {
    throw new Error('Semantic backend simulator requires its deterministic Process fixture.');
  }
  const processState = { json: makeMinimalProcessJson(semanticLedger) };
  const guard: SemanticBackendSimulator = {
    allowedLedgerControlledSaveDraftRequests: 0,
    blockedRequests: [],
    expectedLedgerControlledSaveDraftRequests: options.allowLedgerControlledProcessSaveDraft
      ? 1
      : 0,
    externalRequests: 0,
    fulfilledRequests: 0,
    productionWrites: 0,
    requestCounts: {},
    simulatedMutations: 0,
  };
  await target.route('**/*', async (route) => {
    const request = route.request();
    const requestTarget = new URL(request.url());
    const requestKey = `${request.method()} ${requestTarget.pathname}`;
    guard.requestCounts[requestKey] = (guard.requestCounts[requestKey] ?? 0) + 1;
    if (requestTarget.origin !== backend.origin) {
      if (requestTarget.hostname === '127.0.0.1' || requestTarget.hostname === 'localhost') {
        await route.fallback();
        return;
      }
      guard.externalRequests += 1;
      guard.blockedRequests.push(`${request.method()} [external-origin]`);
      await route.abort('blockedbyclient');
      return;
    }
    if (request.method() === 'POST' && requestTarget.pathname === PROCESS_SAVE_DRAFT_PATH) {
      if (!options.allowLedgerControlledProcessSaveDraft) {
        guard.blockedRequests.push(`${request.method()} ${requestTarget.pathname}`);
        await route.abort('blockedbyclient');
        return;
      }
      assertExactReadOnlyProcessValidationDraft({
        expectedOrigin: backend.origin,
        expectedPublishableKey: backend.publishableKey,
        ledger: semanticLedger,
        request,
      });
      const body = JSON.parse(request.postData() ?? '') as { jsonOrdered: Record<string, unknown> };
      processState.json = body.jsonOrdered;
      guard.simulatedMutations += 1;
      guard.allowedLedgerControlledSaveDraftRequests += 1;
      await route.fulfill({
        body: JSON.stringify({ data: { id: SIMULATED_USER_ID }, success: true }),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }
    if (
      options.authRace &&
      requestTarget.pathname === '/auth/v1/logout' &&
      request.method() === 'POST'
    ) {
      guard.fulfilledRequests += 1;
      await route.fulfill({ status: 204 });
      return;
    }
    const decision = classifyProductionRequest(
      request.method(),
      request.url(),
      backend.origin,
      request.postData(),
      request.headers(),
      backend.publishableKey,
    );
    if (decision !== 'allow') {
      guard.blockedRequests.push(`${request.method()} ${requestTarget.pathname}`);
      await route.abort('blockedbyclient');
      return;
    }
    assertKnownSemanticBackendRequest(request);
    if (options.authRace && requestTarget.pathname.startsWith('/functions/v1/')) {
      const bearer = request.headers().authorization?.split(' ')[1];
      options.authRace.taskRequests.push({
        subject: bearer
          ? JSON.parse(Buffer.from(bearer.split('.')[1], 'base64url').toString()).sub
          : null,
        path: requestTarget.pathname,
      });
    }
    guard.fulfilledRequests += 1;
    await route.fulfill({
      body: JSON.stringify(
        await responseFor(route, persona, backend.origin, processState, options.authRace),
      ),
      contentType: 'application/json',
      headers: {
        'access-control-allow-origin': '*',
        'content-range': '*/0',
      },
      status: 200,
    });
  });
  return guard;
}

export function assertSemanticBackendSimulatorClosed(
  guard: ProductionRequestGuard & Record<'externalRequests' | 'productionWrites', unknown>,
): void {
  const externalRequests = guard.externalRequests;
  const productionWrites = guard.productionWrites;
  if (
    guard.blockedRequests.length > 0 ||
    externalRequests !== 0 ||
    productionWrites !== 0 ||
    guard.allowedLedgerControlledSaveDraftRequests !==
      guard.expectedLedgerControlledSaveDraftRequests
  ) {
    throw new Error(
      `Semantic backend simulator did not close safely: blocked=${guard.blockedRequests.join(
        ',',
      )}; external=${String(externalRequests)}; writes=${String(
        productionWrites,
      )}; simulated-mutations=${guard.allowedLedgerControlledSaveDraftRequests}/${
        guard.expectedLedgerControlledSaveDraftRequests
      }.`,
    );
  }
}
