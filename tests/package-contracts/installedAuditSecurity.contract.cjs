const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const {
  repositoryRoot,
  rootRequire,
  packageCopies,
  onePackage,
  loadPackage,
  packageFromParent,
} = require('./auditPackageResolution.cjs');

const expectedCohorts = {
  'fast-uri': ['3.1.9'],
  'brace-expansion': ['1.1.21', '2.1.7', '5.0.12'],
  undici: ['6.29.1', '7.30.1'],
  hono: ['4.13.14'],
  'js-yaml': ['3.15.2', '4.3.2'],
  '@hono/node-server': ['1.19.17'],
  svgo: ['2.8.4'],
  tar: ['7.5.22'],
  browserslist: ['4.29.5'],
  colord: ['2.10.0'],
  'baseline-browser-mapping': ['2.11.37'],
  'http-cache-semantics': ['4.3.0'],
  'source-map-js': ['1.2.2'],
  compression: ['1.8.2'],
  pbkdf2: ['3.1.7'],
  'follow-redirects': ['1.16.2'],
  zod: ['4.6.7'],
  'body-parser': ['1.20.9'],
  'postcss-selector-parser': ['6.1.5', '7.1.7'],
  express: ['4.22.3'],
  qs: ['6.16.1'],
};

test('all resolved audit cohorts retain their reviewed compatible release lines', () => {
  for (const [name, expected] of Object.entries(expectedCohorts)) {
    assert.deepEqual(
      [...new Set(packageCopies(name).map((copy) => copy.manifest.version))].sort(),
      [...expected].sort(),
      name,
    );
  }
});

test('the exact dormant Dva edge stays removed without enabling an alternate Umi configuration', async () => {
  const workspace = fs.readFileSync(path.join(repositoryRoot, 'pnpm-workspace.yaml'), 'utf8');
  assert.match(workspace, /'@umijs\/plugins@4\.7\.33>dva-immer': '-'/u);
  assert.equal(onePackage('@umijs/plugins').manifest.version, '4.7.33');
  for (const name of ['dva-immer', 'dva', 'immer', 'isomorphic-fetch']) {
    assert.equal(
      packageCopies(name).length,
      0,
      name + ' cannot return without renewed qualification',
    );
  }
  assert.deepEqual(
    packageCopies('node-fetch').filter((copy) => copy.manifest.version.startsWith('1.')).length,
    0,
  );

  // The single static root configuration plus absence of alternate config
  // entrypoints makes this guard cover every existing brand/backend profile.
  // A future dynamic root spread/computed key/config file requires review.
  const ts = (
    await import(pathToFileURL(path.join(repositoryRoot, 'scripts/typescript-native-parser.mjs')))
  ).default;
  const source = fs.readFileSync(path.join(repositoryRoot, 'config/config.ts'), 'utf8');
  const parsed = ts.createSourceFile(
    'config/config.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  assert.deepEqual(parsed.parseDiagnostics, []);
  const exports = parsed.statements.filter((node) => ts.isExportAssignment(node));
  assert.equal(exports.length, 1);
  const expression = exports[0].expression;
  assert.equal(ts.isCallExpression(expression), true);
  assert.equal(expression.expression.getText(parsed), 'defineConfig');
  assert.equal(expression.arguments.length, 1);
  const config = expression.arguments[0];
  assert.equal(ts.isObjectLiteralExpression(config), true);
  const keys = config.properties.map((property) => {
    assert.equal(
      ts.isSpreadAssignment(property),
      false,
      'root config spread needs renewed qualification',
    );
    assert.ok(property.name, 'root property name must be explicit');
    assert.equal(ts.isComputedPropertyName(property.name), false);
    return property.name.getText(parsed).replace(/^['"]|['"]$/gu, '');
  });
  assert.equal(keys.includes('dva'), false);
  for (const name of ['model', 'initialState', 'access', 'request', 'layout', 'locale']) {
    assert.equal(keys.includes(name), true, name);
  }
  assert.deepEqual(
    fs
      .readdirSync(path.join(repositoryRoot, 'config'))
      .filter((name) => /^config(?:\.[^.]+)?\.[jt]s$/u.test(name)),
    ['config.ts'],
  );
  assert.deepEqual(
    fs.readdirSync(repositoryRoot).filter((name) => /^\.umirc(?:\..*)?\.[jt]s$/u.test(name)),
    [],
  );

  const generatedRoot = path.join(repositoryRoot, 'src/.umi');
  const generated = fs.readdirSync(generatedRoot, { recursive: true });
  assert.equal(
    generated.some((name) => /(?:^|[/\\])plugin-dva(?:[/\\]|$)/u.test(name)),
    false,
  );
  for (const name of [
    'plugin-model',
    'plugin-initialState',
    'plugin-access',
    'plugin-request',
    'plugin-layout',
    'plugin-locale',
  ]) {
    assert.equal(
      generated.some((file) => file.startsWith(name + path.sep)),
      true,
      name,
    );
  }
  const runtimePlugins = fs.readFileSync(path.join(generatedRoot, 'core/plugin.ts'), 'utf8');
  assert.doesNotMatch(runtimePlugins, /plugin-dva|dva-immer/u);
  for (const name of [
    'plugin-model',
    'plugin-initialState',
    'plugin-access',
    'plugin-layout',
    'plugin-locale',
  ]) {
    assert.ok(runtimePlugins.includes(name), name);
  }
});

test('Ajv resolves the repaired parser and preserves local schema-reference validation', () => {
  const ajv = onePackage('ajv', 8);
  assert.equal(ajv.manifest.version, '8.20.0');
  const uri = ajv.require('fast-uri');
  assert.equal(ajv.require('ajv/dist/runtime/uri.js').default, uri);
  assert.equal(packageFromParent(ajv, 'fast-uri').manifest.version, '3.1.9');
  for (const input of ['%6Aavascript:alert(1)', 'j%61vascript:alert(1)']) {
    assert.match(uri.parse(input).error || '', /scheme is malformed/u);
    assert.equal(uri.normalize(input), input);
    assert.equal(uri.equal(input, input), false);
    assert.throws(
      () => uri.resolve('https://schemas.example/root/', input),
      /scheme is malformed/u,
    );
  }
  for (const input of ['http://a@b@evil.example/', 'https://ev\til.example/']) {
    assert.match(uri.parse(input).error || '', /host is malformed/u);
    assert.equal(uri.normalize(input), input);
  }
  const base = 'https://schemas.example/contracts/process/request.json';
  assert.equal(uri.normalize('../common.json'), '../common.json');
  assert.equal(
    uri.resolve(base, uri.normalize('../common.json')),
    uri.resolve(base, '../common.json'),
  );
  const suffix = uri.normalize('a/../javascript:alert(1)', { reference: 'suffix', scheme: 'x' });
  assert.equal(suffix, './javascript:alert(1)');
  assert.equal(uri.parse(suffix).scheme, undefined);

  const Ajv = ajv.require('ajv/dist/2020.js').Ajv2020;
  const validator = new Ajv({ allErrors: true, strict: true });
  validator.addSchema({
    $id: 'https://schemas.example/common/quantity.json',
    type: 'number',
    exclusiveMinimum: 0,
  });
  const validate = validator.compile({
    $id: 'https://schemas.example/process/request.json',
    type: 'object',
    properties: { amount: { $ref: '../common/quantity.json' } },
    required: ['amount'],
    additionalProperties: false,
  });
  assert.equal(validate({ amount: 1.25 }), true);
  assert.equal(validate({ amount: 0 }), false);
  assert.deepEqual(
    validate.errors.map(({ instancePath, keyword }) => ({ instancePath, keyword })),
    [{ instancePath: '/amount', keyword: 'exclusiveMinimum' }],
  );
});

test('the actual minimatch consumers preserve brace/glob behavior across all retained generations', () => {
  for (const copy of packageCopies('minimatch')) {
    const minimatch = loadPackage(copy);
    const match = typeof minimatch === 'function' ? minimatch : minimatch.minimatch;
    assert.equal(match('src/one/file.ts', 'src/{one,two}/file.[jt]s'), true, copy.manifest.version);
    assert.equal(
      match('src/three/file.ts', 'src/{one,two}/file.[jt]s'),
      false,
      copy.manifest.version,
    );
    assert.equal(match('data/2.json', 'data/{1..3}.json'), true, copy.manifest.version);
    assert.equal(match('data/7.json', 'data/{1..3}.json'), false, copy.manifest.version);
  }
});

test('both selector-parser cohorts preserve escaped and nested selector roundtrips', () => {
  for (const copy of packageCopies('postcss-selector-parser')) {
    const parser = loadPackage(copy);
    const input = '.button\\:active:is(.primary, [data-state="ready"]) > svg:nth-child(2n + 1)';
    const ast = parser().astSync(input);
    assert.equal(ast.toString(), input, copy.manifest.version);
    const classes = [];
    ast.walkClasses((node) => classes.push(node.value));
    assert.deepEqual(classes, ['button:active', 'primary']);
    // Both reviewed generations reject malformed selectors; their diagnostic
    // wording is not a stable public contract (6.x throws a TypeError here).
    assert.throws(() => parser().astSync('.button['));
    const flat = Array.from({ length: 40 }, (_, index) => '.item' + index).join(',');
    assert.equal(parser().astSync(flat).nodes.length, 40);
  }
});

test('the actual CSS Modules consumers retain local names and declaration values', async () => {
  const modules = onePackage('postcss-modules-local-by-default');
  const postcss = modules.require('postcss');
  const local = loadPackage(modules);
  const scopePackage = onePackage('postcss-modules-scope');
  const scope = loadPackage(scopePackage);
  const result = await postcss([
    local(),
    scope({ generateScopedName: (name) => 'audit_' + name }),
  ]).process('.button:hover { color: red }', { from: undefined });
  assert.match(result.css, /\.audit_button:hover/u);
  assert.match(result.css, /color: red/u);
  assert.match(result.css, /button: audit_button/u);
});

test('both installed YAML generations preserve data and enforce small merge-work limits', () => {
  for (const copy of packageCopies('js-yaml')) {
    const yaml = loadPackage(copy);
    assert.deepEqual(yaml.load('name: audit\nvalues: [1, 2]\nenabled: true\n'), {
      name: 'audit',
      values: [1, 2],
      enabled: true,
    });
    assert.throws(() => yaml.load('a: 1\na: 2\n'), /duplicated mapping key/u);
    assert.throws(
      () =>
        yaml.load('base: &empty {}\nresult:\n  <<: [*empty, *empty, *empty]\n', {
          maxTotalMergeKeys: 2,
        }),
      /merge|limit|maximum/u,
    );
    const maliciousKey = yaml.load('value:\n  __proto__: { polluted: true }\n');
    assert.equal(Object.getPrototypeOf(maliciousKey.value), Object.prototype);
    assert.equal(Object.prototype.polluted, undefined);
    assert.equal(Object.hasOwn(maliciousKey.value, '__proto__'), true);
  }
});

test('qs retains nested query behavior and rejects inert coercion traps', () => {
  const express = onePackage('express', 4);
  const qs = express.require('qs');
  assert.equal(packageFromParent(express, 'qs').manifest.version, '6.16.1');
  assert.deepEqual(qs.parse('filter[name]=sample&items[0]=a&items[1]=b'), {
    filter: { name: 'sample' },
    items: ['a', 'b'],
  });
  const query = qs.stringify({ ids: ['a', 'b'], count: 0 }, { arrayFormat: 'repeat' });
  assert.deepEqual(qs.parse(query), { ids: ['a', 'b'], count: '0' });
  assert.throws(
    () =>
      qs.parse('items[]=a,b,c,d', {
        comma: true,
        arrayLimit: 2,
        throwOnLimitExceeded: true,
      }),
    /array limit/iu,
  );
  assert.doesNotThrow(() =>
    qs.stringify({ items: [{ toString: null }] }, { arrayFormat: 'comma' }),
  );
  assert.equal(Object.prototype.polluted, undefined);
  qs.parse('__proto__[polluted]=true&constructor[prototype][polluted]=true');
  assert.equal(Object.prototype.polluted, undefined);
});

test('normal Zod rejects oversized collections before walking elements and keeps successful boundary behavior', () => {
  const z = rootRequire('zod').z;
  let elements = 0;
  let refined = 0;
  const element = z.string().refine(() => {
    elements += 1;
    return true;
  });
  const schema = z
    .array(element)
    .max(2, 'Too many audit values')
    .refine(() => {
      refined += 1;
      return true;
    });
  const rejected = schema.safeParse(['a', 'b', 'c']);
  assert.equal(rejected.success, false);
  assert.deepEqual(
    rejected.error.issues.map(({ code, path: issuePath, message }) => ({
      code,
      path: issuePath,
      message,
    })),
    [{ code: 'too_big', path: [], message: 'Too many audit values' }],
  );
  assert.equal(elements, 0);
  assert.equal(refined, 0);
  assert.deepEqual(schema.parse(['a', 'b']), ['a', 'b']);
  assert.equal(elements, 2);
  assert.equal(refined, 1);
  // Both baseline 4.5.4 and selected 4.6.7 count Unicode code points.
  assert.equal(z.string().length(1).safeParse('😀').success, true);
  assert.equal(z.string().length(2).safeParse('😀').success, false);
  assert.equal(z.iso.datetime({ offset: true }).safeParse('2026-10-28T12:34:00Z').success, true);
  assert.equal(z.iso.datetime({ offset: true }).safeParse('2026-02-30T12:34:00Z').success, false);
});

test('the real SVGR consumer retains icon transforms and the opt-in script-removal boundary', async () => {
  const svgr = onePackage('@svgr/plugin-svgo', 6);
  const transform = loadPackage(svgr);
  const normal = transform(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path id="shape" fill="red" d="M0 0h10v10H0z"/></svg>',
    { svgo: true },
    { filePath: path.join(repositoryRoot, 'audit-icon.svg') },
  );
  assert.match(normal, /<svg/u);
  assert.match(normal, /viewBox="0 0 10 10"/u);
  assert.match(normal, /fill="red"/u);
  const svgo = svgr.require('svgo');
  const result = svgo.optimize(
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><a href="javascript:alert(1)"><path d="M0 0h1"/></a><foreignObject><div xmlns="http://www.w3.org/1999/xhtml" onclick="alert(1)">owned fixture</div></foreignObject></svg>',
    { plugins: ['removeScriptElement'] },
  );
  assert.doesNotMatch(result.data, /<script|javascript:|onclick=/iu);
});

test('source-map consumers preserve positions and reject invalid indexed offsets', () => {
  const copy = onePackage('source-map-js');
  const { SourceMapGenerator, SourceMapConsumer } = loadPackage(copy);
  const generator = new SourceMapGenerator({ file: 'bundle.js' });
  generator.addMapping({
    generated: { line: 1, column: 0 },
    original: { line: 2, column: 3 },
    source: 'input.ts',
  });
  generator.setSourceContent('input.ts', 'const audit = 1;');
  const consumer = new SourceMapConsumer(generator.toJSON());
  assert.deepEqual(consumer.originalPositionFor({ line: 1, column: 0 }), {
    source: 'input.ts',
    line: 2,
    column: 3,
    name: null,
  });
  assert.throws(
    () =>
      new SourceMapConsumer({
        version: 3,
        sections: [{ offset: { line: -1, column: 0 }, map: generator.toJSON() }],
      }),
    /offset|negative|line|column|section/iu,
  );
});

test('the real browser crypto fallback preserves long-password PBKDF2 results', () => {
  const copy = onePackage('pbkdf2');
  const fallback = copy.require(path.join(copy.directory, 'browser.js'));
  const password = Buffer.alloc(129, 0x61);
  const salt = Buffer.from('owned-salt');
  const result = fallback.pbkdf2Sync(password, salt, 3, 32, 'sha256');
  assert.deepEqual(result, crypto.pbkdf2Sync(password, salt, 3, 32, 'sha256'));
  assert.deepEqual(
    result,
    fallback.pbkdf2Sync(
      crypto.createHash('sha256').update(password).digest(),
      salt,
      3,
      32,
      'sha256',
    ),
  );
});

test('the installed cache policy respects response reuse prohibitions and RFC-valid stale caching', () => {
  const CachePolicy = loadPackage(onePackage('http-cache-semantics'));
  const request = {
    url: 'https://cache.example/private',
    method: 'GET',
    headers: { host: 'cache.example' },
  };
  const staleRequest = {
    ...request,
    headers: { ...request.headers, 'cache-control': 'max-stale=99999' },
  };
  for (const shared of [true, false]) {
    for (const [cacheControl, expected] of [
      ['public, max-age=300', true],
      ['max-age=0', true],
      ['no-cache', false],
      ['no-store', false],
      ['private, max-age=0', !shared],
      ['public, max-age=0, proxy-revalidate', !shared],
      ['public, max-age=0, s-maxage=0', !shared],
      ['public, max-age=300, s-maxage=300', true],
      ['public, max-age=0, must-revalidate', false],
      ['no-cache, stale-while-revalidate=99999', false],
    ]) {
      let now = Date.UTC(2026, 9, 28);
      class ClockPolicy extends CachePolicy {
        now() {
          return now;
        }
      }
      const policy = new ClockPolicy(
        request,
        {
          status: 200,
          headers: { 'set-cookie': 'audit=synthetic', 'cache-control': cacheControl },
        },
        { shared },
      );
      now += 1000;
      // RFC 9111 section 7.3 permits Set-Cookie response caching. Sections
      // 4, 5.2.2.4, 5.2.2.8 and 5.2.2.10 separately constrain response reuse.
      assert.equal(
        policy.satisfiesWithoutRevalidation(staleRequest),
        expected,
        JSON.stringify({ shared, cacheControl }),
      );
      if (!expected)
        assert.equal(policy.evaluateRequest(staleRequest).revalidation.synchronous, true);
    }
  }
  const matched = new CachePolicy(request, {
    status: 200,
    headers: { 'cache-control': 'public, max-age=300', vary: 'accept-language' },
  });
  for (const changed of [
    { ...staleRequest, url: request.url + '/different' },
    { ...staleRequest, method: 'POST' },
    { ...staleRequest, headers: { ...staleRequest.headers, host: 'other.example' } },
    { ...staleRequest, headers: { ...staleRequest.headers, 'accept-language': 'fr' } },
  ])
    assert.equal(matched.satisfiesWithoutRevalidation(changed), false);
});

test('colord and Browserslist keep valid values and reject inert malformed inputs', () => {
  const { colord } = loadPackage(onePackage('colord'));
  assert.equal(colord('#ff0000').toHex(), '#ff0000');
  assert.equal(colord('hsl(120, 100%, 50%)').toHex(), '#00ff00');
  assert.equal(colord('rgb(' + '1,'.repeat(20) + ')').isValid(), false);
  const browserslist = loadPackage(onePackage('browserslist'));
  assert.ok(browserslist('Chrome 120').every((value) => value === 'chrome 120'));
  const baseline = Object.getOwnPropertyDescriptor(Object.prototype, 'auditPolluted');
  const stats = JSON.parse('{"__proto__":{"auditPolluted":1},"chrome":{"120":1}}');
  try {
    assert.doesNotThrow(() => browserslist('> 0% in my stats', { stats }));
    assert.deepEqual(Object.getOwnPropertyDescriptor(Object.prototype, 'auditPolluted'), baseline);
  } finally {
    if (baseline) Object.defineProperty(Object.prototype, 'auditPolluted', baseline);
    else delete Object.prototype.auditPolluted;
  }
});
