const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const test = require('node:test');
const { mergeContract } = require('./mockjsMergeFixture.cjs');
const { repositoryRoot, onePackage, packageFromParent } = require('./auditPackageResolution.cjs');

const plugin = onePackage('@umijs/max-plugin-openapi');
const openapi = packageFromParent(plugin, '@umijs/openapi');
const installed = packageFromParent(openapi, 'mockjs');
const argument = process.argv.indexOf('--package');
const directory =
  process.env.MOCKJS_CONTRACT_PACKAGE ||
  (argument === -1 ? installed.directory : process.argv[argument + 1]);
const external = Boolean(process.env.MOCKJS_CONTRACT_PACKAGE) || argument !== -1;
const baseline =
  process.env.MOCKJS_CONTRACT_BASELINE === 'true' || process.argv.includes('--baseline');
const surfaces = ['src/mock/util.js', 'src/mock.js', 'dist/mock.js', 'dist/mock-min.js'];

if (process.argv.includes('--child')) {
  const surface = process.argv[process.argv.indexOf('--child') + 1];
  const filename = path.join(directory, surface);
  const exported = require(filename);
  const result = mergeContract(exported.Util || exported, baseline);
  if (exported.Random) {
    exported.Random.extend({
      owned1384() {
        return 'maintained';
      },
    });
    assert.equal(exported.mock('@OWNED1384'), 'maintained');
    assert.deepEqual(exported.mock({ 'list|2': [{ value: 1 }] }), {
      list: [{ value: 1 }, { value: 1 }],
    });
  }
  console.log(JSON.stringify({ surface, ...result }));
} else {
  test('parent-bound exact maintained patch and four native package surfaces', () => {
    assert.equal(plugin.manifest.version, '2.0.3');
    assert.equal(openapi.manifest.version, '1.14.1');
    assert.equal(installed.manifest.version, '1.1.0');
    if (!external) {
      const patch = fs.readFileSync(path.join(repositoryRoot, 'patches/mockjs@1.1.0.patch'));
      const digest = createHash('sha256').update(patch).digest('hex');
      assert.ok(installed.directory.includes('patch_hash=' + digest));
      assert.ok(
        fs
          .readFileSync(path.join(repositoryRoot, 'pnpm-lock.yaml'), 'utf8')
          .includes('mockjs@1.1.0: ' + digest),
      );
    }
    for (const surface of surfaces) {
      const result = spawnSync(
        process.execPath,
        [
          __filename,
          '--package',
          directory,
          '--child',
          surface,
          ...(baseline ? ['--baseline'] : []),
        ],
        { cwd: repositoryRoot, encoding: 'utf8', timeout: 10_000 },
      );
      assert.equal(result.error, undefined, surface);
      assert.equal(result.signal, null, surface);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const receipt = JSON.parse(result.stdout.trim());
      assert.ok(receipt.checks === (baseline ? 36 : 41) && receipt.prototypesRestored);
      console.log(JSON.stringify(receipt));
    }
  });

  test('unaltered UMD exports execute merge contracts in isolated AMD and browser-global realms', () => {
    for (const surface of surfaces.slice(2)) {
      for (const mode of ['amd', 'browser']) {
        const sandbox = { console, setTimeout, clearTimeout, setInterval, clearInterval };
        if (mode === 'amd') {
          sandbox.define = (_dependencies, factory) => {
            sandbox.exported = factory();
          };
          sandbox.define.amd = {};
        }
        sandbox.window = sandbox;
        vm.createContext(sandbox);
        vm.runInContext(fs.readFileSync(path.join(directory, surface), 'utf8'), sandbox, {
          timeout: 2000,
        });
        const receipt = vm.runInContext(
          `(${mergeContract.toString()})((this.exported || this.Mock).Util, ${baseline})`,
          sandbox,
          { timeout: 2000 },
        );
        assert.ok(receipt.checks === (baseline ? 36 : 41) && receipt.prototypesRestored);
        console.log(JSON.stringify({ surface, mode, ...receipt }));
      }
    }
  });

  test(
    'actual installed OpenAPI initialization and local example-file generation',
    { skip: external },
    async () => {
      const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'tiangong-mockjs-1384-'));
      try {
        // Loading the actual public parent performs its published Random.extend registration.
        openapi.require('@umijs/openapi');
        const Mock = installed.require('mockjs');
        assert.equal(typeof Mock.Random.phone, 'function');
        assert.match(Mock.mock('@PHONE'), /^11[124]\d{8}$/u);
        assert.ok(
          ['success', 'error', 'default', 'processing', 'warning'].includes(Mock.mock('@STATUS')),
        );
        const { mockGenerator } = openapi.require(
          path.join(openapi.directory, 'dist/mockGenerator.js'),
        );
        await mockGenerator({
          openAPI: {
            swagger: '2.0',
            info: { title: 'Owned finite fixture', version: '1' },
            paths: {
              '/owned': {
                get: {
                  operationId: 'owned',
                  responses: {
                    200: {
                      description: 'owned',
                      schema: {
                        type: 'object',
                        properties: { value: { type: 'string', example: 'maintained' } },
                      },
                      example: { value: 'maintained' },
                    },
                  },
                },
              },
            },
          },
          mockFolder: folder,
          mockConfig: {},
        });
        const files = fs.readdirSync(folder);
        assert.equal(files.length, 1);
        const content = fs.readFileSync(path.join(folder, files[0]), 'utf8');
        assert.match(content, /GET \/owned/u);
        assert.match(content, /maintained/u);
      } finally {
        fs.rmSync(folder, { recursive: true, force: true });
        assert.equal(fs.existsSync(folder), false);
      }
    },
  );
}
