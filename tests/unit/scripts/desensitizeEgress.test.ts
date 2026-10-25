import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const sourceRoot = process.cwd();
const official = 'https://qgzvkongdjqiiamzbbts.supabase.co';

function sanitize(input: string, options: { inPlace?: boolean; strict?: boolean } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sql-egress-'));
  const docker = path.join(root, 'docker');
  fs.mkdirSync(path.join(docker, 'scripts'), { recursive: true });
  fs.copyFileSync(
    path.join(sourceRoot, 'docker/desensitize_data.sql.sh'),
    path.join(docker, 'desensitize_data.sql.sh'),
  );
  const validator = path.join(sourceRoot, 'docker/scripts/validate-sql-egress.cjs');
  if (fs.existsSync(validator))
    fs.copyFileSync(validator, path.join(docker, 'scripts/validate-sql-egress.cjs'));
  const inputPath = path.join(root, 'input.sql');
  const outputPath = options.inPlace ? inputPath : path.join(root, 'output.sql');
  fs.writeFileSync(inputPath, input);
  if (!options.inPlace) fs.writeFileSync(outputPath, 'unchanged output\n');
  const args = [path.join(docker, 'desensitize_data.sql.sh'), '--input', inputPath, '--no-backup'];
  args.push(...(options.inPlace ? ['--in-place'] : ['--output', outputPath]));
  if (options.strict !== false) args.push('--strict');
  const result = spawnSync('bash', args, { encoding: 'utf8' });
  const output = fs.readFileSync(outputPath, 'utf8');
  fs.rmSync(root, { recursive: true, force: true });
  return { ...result, output };
}

describe('SQL artifact outbound-target safety', () => {
  it.each([true, false])(
    'rejects a Production URL before replacing output (strict=%s)',
    (strict) => {
      const result = sanitize(
        `select net.http_post(url := '${official}/functions/v1/webhook_flow_embedding', headers := '{"apikey":"sb_secret_SYNTHETIC_TEST"}');`,
        { strict },
      );
      expect(result.status).not.toBe(0);
      expect(result.output).toBe('unchanged output\n');
      expect(result.stdout + result.stderr).not.toContain('sb_secret_SYNTHETIC_TEST');
      expect(result.stdout + result.stderr).not.toContain(official);
    },
  );

  it.each([
    "select net.http_post(url := 'https:\\/\\/qgzvkongdjqiiamzbbts.supabase.co/functions/v1/current');",
    "select net.http_post(url := 'https://' || 'submidrhbtknjxfympna.supabase.co/functions/v1/current');",
    "create trigger old_hook after insert on public.flows for each row execute function util.invoke_edge_webhook('webhook_flow_embedding','1000');",
    "select util.invoke_edge_function(name => 'webhook_process_embedding', body => '{}');",
  ])('rejects a known unsafe executable target: %s', (input) => {
    const result = sanitize(input);
    expect(result.status).not.toBe(0);
    expect(result.output).toBe('unchanged output\n');
  });

  it('preserves an input file on an in-place rejection', () => {
    const input = `select net.http_post(url := '${official}');\n`;
    const result = sanitize(input, { inPlace: true });
    expect(result.status).not.toBe(0);
    expect(result.output).toBe(input);
  });

  it('permits comments, metadata and a bare production-identity refusal constant', () => {
    const input = `-- ${official}/functions/v1/webhook_flow_embedding\n/* old ${official} */\nCOMMENT ON FUNCTION f() IS '${official}/functions/v1/webhook_process_embedding';\nselect case when project_ref = 'qgzvkongdjqiiamzbbts' then 'production' end; -- ${official}\n`;
    const result = sanitize(input);
    expect(result.status).toBe(0);
    expect(result.output).toBe(input);
  });

  it('sanitizes a custom FT target without changing its URL or safe SQL', () => {
    const input = `select net.http_post(url := 'http://kong:8000/functions/v1/webhook_flow_embedding_ft', headers := '{"x_key":"fixture-value","apikey":"sb_secret_SYNTHETIC_TEST"}');\n`;
    const result = sanitize(input);
    expect(result.status).toBe(0);
    expect(result.output).toContain('http://kong:8000/functions/v1/webhook_flow_embedding_ft');
    expect(result.output).toContain('"x_key":"edge-functions-key"');
    expect(result.output).not.toContain('SYNTHETIC_TEST');
  });

  it('accepts the complete current generated initializer without changing bytes', () => {
    const input = fs.readFileSync(path.join(sourceRoot, 'docker/volumes/db/init/data.sql'), 'utf8');
    const result = sanitize(input);
    expect(result.status).toBe(0);
    expect(result.output).toBe(input);
  });
});
