import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

const SUPABASE_FRONTEND_KEYS = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'] as const;
const LOCAL_SUPABASE_ENV = {
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_PUBLISHABLE_KEY: 'local-development-publishable-key',
};
const OFFICIAL_BACKEND_HOSTS = [
  'qgzvkongdjqiiamzbbts.supabase.co',
  'submidrhbtknjxfympna.supabase.co',
];
const SUPABASE_ENV_FILE_ORDER = {
  local: ['.env', '.env.local'],
  dev: ['.env', '.env.development', '.env.local', '.env.development.local'],
  pre: ['.env', '.env.local', '.env.pre.local'],
  test: ['.env', '.env.local', '.env.test.local'],
  main: ['.env', 'config/environments/main.env', '.env.local'],
  'hosted-dev': ['.env', 'config/environments/hosted-dev.env', '.env.local'],
  qualification: ['docker/e2e/qualification.env'],
} as const;

type FrontendSupabaseTarget = keyof typeof SUPABASE_ENV_FILE_ORDER;
type FrontendRuntimeEnv = string | false | undefined;
type SupabaseFrontendEnv = Record<(typeof SUPABASE_FRONTEND_KEYS)[number], string | undefined>;

const hasEnvValue = (value: string | undefined): value is string => Boolean(value);
const readMergedEnvFiles = (
  rootDir: string,
  files: readonly string[],
): Record<string, string | undefined> =>
  files.reduce<Record<string, string | undefined>>((merged, file) => {
    const filePath = join(rootDir, file);
    return existsSync(filePath)
      ? { ...merged, ...parseEnv(readFileSync(filePath, 'utf8')) }
      : merged;
  }, {});

export const resolveSupabaseFrontendTarget = (
  appEnv: FrontendRuntimeEnv,
): FrontendSupabaseTarget => {
  const target = appEnv || 'local';
  if (!Object.prototype.hasOwnProperty.call(SUPABASE_ENV_FILE_ORDER, target)) {
    throw new Error('Unsupported frontend environment; select a documented backend profile.');
  }
  return target as FrontendSupabaseTarget;
};

export const getSupabaseFrontendEnv = (
  rootDir: string,
  appEnv: FrontendRuntimeEnv,
): SupabaseFrontendEnv => {
  const target = resolveSupabaseFrontendTarget(appEnv);
  if (
    (target === 'main' || target === 'hosted-dev') &&
    !existsSync(join(rootDir, `config/environments/${target}.env`))
  ) {
    throw new Error('The explicitly selected official backend profile is unavailable.');
  }
  const env = readMergedEnvFiles(rootDir, SUPABASE_ENV_FILE_ORDER[target]);
  if (target === 'main' || target === 'hosted-dev' || target === 'qualification') {
    const profile = readMergedEnvFiles(rootDir, [
      target === 'qualification'
        ? 'docker/e2e/qualification.env'
        : `config/environments/${target}.env`,
    ]);
    if (!hasEnvValue(profile.SUPABASE_URL) || !hasEnvValue(profile.SUPABASE_PUBLISHABLE_KEY)) {
      throw new Error('The explicitly selected backend profile is unavailable or incomplete.');
    }
  }
  return {
    SUPABASE_URL: env.SUPABASE_URL || LOCAL_SUPABASE_ENV.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY:
      env.SUPABASE_PUBLISHABLE_KEY || LOCAL_SUPABASE_ENV.SUPABASE_PUBLISHABLE_KEY,
  };
};

export const applySupabaseFrontendEnv = (
  rootDir: string,
  appEnv: FrontendRuntimeEnv,
): SupabaseFrontendEnv => {
  const target = resolveSupabaseFrontendTarget(appEnv);
  const fileEnv = getSupabaseFrontendEnv(rootDir, appEnv);
  const baseFileEnv = readMergedEnvFiles(rootDir, ['.env']);
  const merged = SUPABASE_FRONTEND_KEYS.reduce<SupabaseFrontendEnv>((result, key) => {
    const runtimeValue = process.env[key];
    // Umi preloads the neutral base `.env` before config evaluation. Replace
    // only that exact inherited default; distinct per-key build overrides win.
    const inheritedBase = hasEnvValue(runtimeValue) && runtimeValue === baseFileEnv[key];
    result[key] =
      target === 'qualification' || inheritedBase || !hasEnvValue(runtimeValue)
        ? fileEnv[key]
        : runtimeValue;
    return result;
  }, {} as SupabaseFrontendEnv);

  let host: string;
  try {
    const url = new URL(merged.SUPABASE_URL!);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('protocol');
    host = url.hostname.toLowerCase().replace(/\.$/u, '');
  } catch {
    throw new Error('Frontend backend URL must be an absolute HTTP(S) URL.');
  }
  if (OFFICIAL_BACKEND_HOSTS.includes(host) && target !== 'main' && target !== 'hosted-dev') {
    throw new Error('An official backend requires an explicit main or hosted-dev profile.');
  }
  // Refuse unsafe configuration before changing the process environment.
  SUPABASE_FRONTEND_KEYS.forEach((key) => {
    if (hasEnvValue(merged[key])) process.env[key] = merged[key];
  });
  return merged;
};
