const supabaseEnvOriginalEnv = { ...process.env };

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const OFFICIAL_MAIN = 'https://qgzvkongdjqiiamzbbts.supabase.co';
const OFFICIAL_DEV = 'https://submidrhbtknjxfympna.supabase.co';
const LOCAL_URL = 'http://127.0.0.1:54321';

function writeEnv(root: string, name: string, url: string, key: string): void {
  const file = path.join(root, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `SUPABASE_URL=${url}\nSUPABASE_PUBLISHABLE_KEY=${key}\n`);
}

describe('explicit frontend backend selection', () => {
  let tempDir: string;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...supabaseEnvOriginalEnv };
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'supabase-env-'));
    writeEnv(tempDir, '.env', LOCAL_URL, 'local-placeholder');
    writeEnv(tempDir, '.env.development', LOCAL_URL, 'local-placeholder');
    writeEnv(tempDir, 'config/environments/main.env', OFFICIAL_MAIN, 'official-main-key');
    writeEnv(tempDir, 'config/environments/hosted-dev.env', OFFICIAL_DEV, 'official-dev-key');
  });

  afterEach(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  afterAll(() => {
    process.env = supabaseEnvOriginalEnv;
  });

  it.each([undefined, false, '', 'local', 'dev', 'pre', 'test'])(
    'keeps ordinary %s mode local even when official profiles exist',
    (mode) => {
      const { applySupabaseFrontendEnv } = require('../../../config/supabaseEnv');
      expect(applySupabaseFrontendEnv(tempDir, mode)).toEqual({
        SUPABASE_URL: LOCAL_URL,
        SUPABASE_PUBLISHABLE_KEY: 'local-placeholder',
      });
    },
  );

  it('uses safe defaults when env files are absent in a Docker build context', () => {
    fs.unlinkSync(path.join(tempDir, '.env'));
    fs.unlinkSync(path.join(tempDir, '.env.development'));
    const { applySupabaseFrontendEnv } = require('../../../config/supabaseEnv');
    const result = applySupabaseFrontendEnv(tempDir, undefined);
    expect(result.SUPABASE_URL).toBe(LOCAL_URL);
    expect(result.SUPABASE_PUBLISHABLE_KEY).toBeTruthy();
  });

  it.each(['staging', 'production', 'unknown'])('rejects an unknown selector %s', (mode) => {
    const { applySupabaseFrontendEnv } = require('../../../config/supabaseEnv');
    expect(() => applySupabaseFrontendEnv(tempDir, mode)).toThrow(/Unsupported.*environment/u);
  });

  it.each([
    ['main', OFFICIAL_MAIN, 'official-main-key'],
    ['hosted-dev', OFFICIAL_DEV, 'official-dev-key'],
  ])('selects the official %s profile only explicitly', (mode, url, key) => {
    const { applySupabaseFrontendEnv } = require('../../../config/supabaseEnv');
    // Umi preloads the neutral base file before evaluating config.
    process.env.SUPABASE_URL = LOCAL_URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = 'local-placeholder';
    expect(applySupabaseFrontendEnv(tempDir, mode)).toEqual({
      SUPABASE_URL: url,
      SUPABASE_PUBLISHABLE_KEY: key,
    });
  });

  it.each([OFFICIAL_MAIN, OFFICIAL_DEV, `${OFFICIAL_MAIN.toUpperCase()}.`])(
    'rejects an accidentally copied official URL in ordinary mode: %s',
    (url) => {
      const { applySupabaseFrontendEnv } = require('../../../config/supabaseEnv');
      process.env.SUPABASE_URL = url;
      process.env.SUPABASE_PUBLISHABLE_KEY = 'copied-key';
      expect(() => applySupabaseFrontendEnv(tempDir, 'dev')).toThrow(/explicit.*profile/u);
    },
  );

  it('rejects a copied official URL in a local override file', () => {
    writeEnv(tempDir, '.env.local', OFFICIAL_MAIN, 'copied-key');
    const { applySupabaseFrontendEnv } = require('../../../config/supabaseEnv');
    expect(() => applySupabaseFrontendEnv(tempDir, 'local')).toThrow(/explicit.*profile/u);
  });

  it('preserves custom file ordering and distinct per-key runtime overrides', () => {
    writeEnv(tempDir, '.env.local', 'https://own-project.supabase.co', 'own-key');
    fs.writeFileSync(
      path.join(tempDir, '.env.development.local'),
      'SUPABASE_PUBLISHABLE_KEY=dev-local-key\n',
    );
    process.env.SUPABASE_URL = 'https://explicit-project.supabase.co';
    const { applySupabaseFrontendEnv } = require('../../../config/supabaseEnv');
    expect(applySupabaseFrontendEnv(tempDir, 'dev')).toEqual({
      SUPABASE_URL: 'https://explicit-project.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'dev-local-key',
    });
  });

  it('preserves a custom explicit key while replacing an inherited neutral default', () => {
    process.env.SUPABASE_URL = LOCAL_URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = 'custom-explicit-key';
    const { applySupabaseFrontendEnv } = require('../../../config/supabaseEnv');
    expect(applySupabaseFrontendEnv(tempDir, 'main')).toEqual({
      SUPABASE_URL: OFFICIAL_MAIN,
      SUPABASE_PUBLISHABLE_KEY: 'custom-explicit-key',
    });
  });

  it.each(['main', 'hosted-dev'])('fails if the explicit %s profile is unavailable', (mode) => {
    fs.unlinkSync(path.join(tempDir, `config/environments/${mode}.env`));
    const { applySupabaseFrontendEnv } = require('../../../config/supabaseEnv');
    expect(() => applySupabaseFrontendEnv(tempDir, mode)).toThrow(/profile is unavailable/u);
  });

  it('fails closed when a selected profile is incomplete', () => {
    fs.writeFileSync(path.join(tempDir, 'config/environments/main.env'), 'SUPABASE_URL=\n');
    const { applySupabaseFrontendEnv } = require('../../../config/supabaseEnv');
    expect(() => applySupabaseFrontendEnv(tempDir, 'main')).toThrow(/incomplete/u);
    expect(() => applySupabaseFrontendEnv(tempDir, 'qualification')).toThrow(/unavailable/u);
  });

  it('keeps qualification fixed to its file despite ambient official settings', () => {
    writeEnv(
      tempDir,
      'docker/e2e/qualification.env',
      'https://semantic-harness.invalid',
      'harness-key',
    );
    process.env.SUPABASE_URL = OFFICIAL_MAIN;
    process.env.SUPABASE_PUBLISHABLE_KEY = 'ambient-key';
    const { applySupabaseFrontendEnv } = require('../../../config/supabaseEnv');
    expect(applySupabaseFrontendEnv(tempDir, 'qualification')).toEqual({
      SUPABASE_URL: 'https://semantic-harness.invalid',
      SUPABASE_PUBLISHABLE_KEY: 'harness-key',
    });
  });
});
