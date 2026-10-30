/* Installed caller contracts; tiny inert inputs, no exhaustion probes or network transport. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const test = require('node:test');
const {
  repositoryRoot,
  rootRequire,
  packageCopies,
  onePackage,
  packageFromParent,
} = require('./auditPackageResolution.cjs');

const historyCopy = onePackage('@umijs/history');
const queryCopy = packageFromParent(historyCopy, 'query-string');
const decoderCopy = packageFromParent(queryCopy, 'decode-uri-component');
const query = queryCopy.require('query-string');
const decode = decoderCopy.require('decode-uri-component');
const envRequire = createRequire(rootRequire.resolve('jest-environment-jsdom'));
const { JSDOM } = envRequire('jsdom');
const plain = (value) => JSON.parse(JSON.stringify(value));

// Load each real public CommonJS entry independently of its previous NODE_ENV cache.
function historyFor(mode) {
  const previous = process.env.NODE_ENV;
  const entry = historyCopy.require.resolve('@umijs/history');
  try {
    process.env.NODE_ENV = mode;
    delete require.cache[entry];
    return historyCopy.require('@umijs/history');
  } finally {
    delete require.cache[entry];
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
}

function withDom(url, callback) {
  // No resource loader, script execution or network server is enabled.
  const dom = new JSDOM('<!doctype html><body></body>', { url, runScripts: 'outside-only' });
  const previousDocument = Object.getOwnPropertyDescriptor(global, 'document');
  try {
    // The published hash-history createHref reads document for a possible <base>.
    global.document = dom.window.document;
    return callback(dom.window);
  } finally {
    if (previousDocument) Object.defineProperty(global, 'document', previousDocument);
    else delete global.document;
    dom.window.close();
    assert.equal(dom.window.document, undefined, 'owned JSDOM must be disposed');
  }
}

test('actual history parent resolves the exact patched callable CJS decoder', () => {
  assert.equal(historyCopy.manifest.version, '5.3.1');
  assert.equal(queryCopy.manifest.version, '6.14.1');
  assert.equal(decoderCopy.manifest.version, '0.2.2');
  assert.equal(typeof decode, 'function');
  assert.equal(decoderCopy.manifest.type, undefined);
  const patch = fs.readFileSync(
    path.join(repositoryRoot, 'patches/decode-uri-component@0.2.2.patch'),
  );
  const digest = createHash('sha256').update(patch).digest('hex');
  const lock = fs.readFileSync(path.join(repositoryRoot, 'pnpm-lock.yaml'), 'utf8');
  assert.ok(lock.includes('decode-uri-component@0.2.2: ' + digest));
  assert.ok(decoderCopy.directory.includes('patch_hash=' + digest));
  const source = fs.readFileSync(decoderCopy.entry, 'utf8');
  console.log(
    JSON.stringify({
      history: historyCopy.manifest.version,
      query: queryCopy.manifest.version,
      decoder: decoderCopy.manifest.version,
      decoderEntry: decoderCopy.entry,
      patchSha256: digest,
      installedSourceSha256: createHash('sha256').update(source).digest('hex'),
      scope: 'installed CJS and synthetic DOM/bundle; no native-browser or release claim',
    }),
  );
});

test('public decoder preserves valid Unicode, delimiters, plus and original TypeError', () => {
  const corpus = [
    ['', ''],
    ['plain ASCII', 'plain ASCII'],
    ['a+b%2Bc', 'a b+c'],
    ['%25', '%'],
    ['%2541', '%41'],
    ['st%C3%A5le', 'ståle'],
    ['%C2%B5%E4%B8%AD%F0%9F%98%80', 'µ中😀'],
    ['%26%3D%23%3F%2F', '&=#?/'],
    ['literal 😀', 'literal 😀'],
  ];
  for (const [input, expected] of corpus) assert.equal(decode(input), expected, input);
  for (const input of [undefined, null, 1, true, {}, [], Symbol('inert')]) {
    assert.throws(() => decode(input), {
      name: 'TypeError',
      message: 'Expected `encodedURI` to be of type `string`, got `' + typeof input + '`',
    });
  }
});

test('malformed UTF-8 remains literal while neighboring valid code points recover', () => {
  const corpus = [
    ['%', '%'],
    ['%G0', '%G0'],
    ['%E0%A4%A', '%E0%A4%A'],
    ['%80', '%80'],
    ['%C0%AF', '%C0%AF'],
    ['%ED%A0%80', '%ED%A0%80'],
    ['%F4%90%80%80', '%F4%90%80%80'],
    ['%F5%80%80%80', '%F5%80%80%80'],
    ['%41%FF%E4%B8%AD%42', 'A%FF中B'],
    ['%%7Bst%C3%A5le%7D%', '%{ståle}%'],
    ['%FE%FF', '\uFFFD\uFFFD'],
    ['%FF%FE', '\uFFFD\uFFFD'],
    ['%fe%ff', '%fe%ff'],
    ['%C2', '\uFFFD'],
    ['%c2', '%c2'],
    ['%C2%41', '\uFFFDA'],
    ['%C2%80', '\u0080'],
  ];
  for (const [input, expected] of corpus) assert.equal(decode(input), expected, input);
});

test('fallback never rescans emitted escapes or interprets replacement-dollar syntax', () => {
  // Explicit repair expectations intentionally differ from the historical fallback.
  const corpus = [
    ['%25%34%31_%41_%FF', '%41_A_%FF'],
    ['%25C2_%FF', '%C2_%FF'],
    ['%24%26_%FF', '$&_%FF'],
    ['%24%60_%FF', '$`_%FF'],
    ['%24%27_%FF', "$'_%FF"],
    ['%252B_%FF', '%2B_%FF'],
    ['%2B+%FF', '+ %FF'],
  ];
  for (let round = 0; round < 3; round++) {
    for (const [input, expected] of corpus) assert.equal(decode(input), expected, input);
    assert.equal(decode('%C3%A5'), 'å', 'a prior failed run must not leak regex state');
  }
});

test('query parser preserves keys, ordered duplicate values, nulls, literals and options', () => {
  assert.deepEqual(plain(query.parse('a+b=c+d&plus=%2B&dup=one&dup=two&flag&empty=&x=%26%3D%23')), {
    'a b': 'c d',
    dup: ['one', 'two'],
    empty: '',
    flag: null,
    plus: '+',
    x: '&=#',
  });
  assert.equal(Object.getPrototypeOf(query.parse('x=1')), null);
  assert.deepEqual(plain(query.parse('a+b=c%2Bd', { decode: false })), { 'a+b': 'c%2Bd' });
  assert.deepEqual(
    plain(query.parse('n=2&b=true&x=null', { parseNumbers: true, parseBooleans: true })),
    {
      b: true,
      n: 2,
      x: 'null',
    },
  );
  assert.deepEqual(plain(query.parse('x=%25%34%31_%41_%FF')), { x: '%41_A_%FF' });
  assert.deepEqual(plain(query.parse('x[]=a%2Bb&x[]=c+d', { arrayFormat: 'bracket' })), {
    x: ['a+b', 'c d'],
  });
  assert.deepEqual(plain(query.parse('x=a%2Cb,c+d', { arrayFormat: 'comma' })), {
    x: ['a,b', 'c d'],
  });
  assert.deepEqual(plain(query.parse('x=a%2Cb', { arrayFormat: 'comma' })), {
    x: ['a', 'b'],
  });
});

test('query URL fragment API retains decoder-level plus conversion and literal fix output', () => {
  assert.deepEqual(
    plain(
      query.parseUrl('/route?a+b=c%2Bd#hello+%2B', {
        parseFragmentIdentifier: true,
      }),
    ),
    { url: '/route', query: { 'a b': 'c+d' }, fragmentIdentifier: 'hello +' },
  );
  assert.equal(
    query.parseUrl('/route#%25%34%31_%41_%FF', {
      parseFragmentIdentifier: true,
    }).fragmentIdentifier,
    '%41_A_%FF',
  );
  assert.equal(
    query.parseUrl('/route#a+b', {
      parseFragmentIdentifier: true,
      decode: false,
    }).fragmentIdentifier,
    'a+b',
  );
});

test('query stringify and URL composition preserve valid public round-trips', () => {
  const object = { 'a b': 'c+d', dup: ['first', 'second'], empty: '', flag: null, unicode: '中😀' };
  const encoded = query.stringify(object);
  assert.equal(
    encoded,
    'a%20b=c%2Bd&dup=first&dup=second&empty=&flag&unicode=%E4%B8%AD%F0%9F%98%80',
  );
  assert.deepEqual(plain(query.parse(encoded)), object);
  assert.equal(
    query.stringifyUrl({ url: '/route?retained=1#old', query: { value: 'a+b' } }),
    '/route?retained=1&value=a%2Bb#old',
  );
});

for (const mode of ['development', 'production']) {
  test('actual ' + mode + ' CJS entry preserves path and memory-history queries', () => {
    const history = historyFor(mode);
    const parsed = history.parsePath('/route?value=a+b%2Bc&bad=%FF#section');
    assert.deepEqual(plain(parsed), {
      pathname: '/route',
      search: '?value=a+b%2Bc&bad=%FF',
      query: { bad: '%FF', value: 'a b+c' },
      hash: '#section',
    });
    assert.equal(history.createPath(parsed), '/route?value=a+b%2Bc&bad=%FF#section');
    assert.equal(
      history.createPath({ pathname: '/route', query: { value: 'a+b' }, hash: 'section' }),
      '/route?value=a%2Bb#section',
    );
    const memory = history.createMemoryHistory({ initialEntries: ['/start?x=a+b%2Bc#initial'] });
    assert.deepEqual(plain(memory.location.query), { x: 'a b+c' });
    const seen = [];
    const unlisten = memory.listen(({ action, location }) =>
      seen.push([action, plain(location.query)]),
    );
    try {
      memory.push('/next?x=%25%34%31_%41_%FF#next');
      assert.equal(memory.location.hash, '#next');
      assert.deepEqual(plain(memory.location.query), { x: '%41_A_%FF' });
      memory.replace('/final?x=%2B&flag');
      assert.deepEqual(plain(memory.location.query), { flag: null, x: '+' });
      assert.deepEqual(seen, [
        ['PUSH', { x: '%41_A_%FF' }],
        ['REPLACE', { flag: null, x: '+' }],
      ]);
    } finally {
      unlisten();
    }
  });
}

for (const kind of ['Hash', 'Browser']) {
  test(
    'actual ' +
      kind.toLowerCase() +
      ' history initializes, pushes and replaces in a disposed inert DOM',
    () => {
      const url =
        kind === 'Hash'
          ? 'https://uri-contract.invalid/#/start?x=a+b%2Bc#initial'
          : 'https://uri-contract.invalid/start?x=a+b%2Bc#initial';
      withDom(url, (window) => {
        const history = historyFor('production')['create' + kind + 'History']({ window });
        assert.equal(history.location.pathname, '/start');
        assert.deepEqual(plain(history.location.query), { x: 'a b+c' });
        assert.equal(history.location.hash, '#initial');
        const seen = [];
        const unlisten = history.listen(({ action }) => seen.push(action));
        try {
          history.push('/next?x=%25%34%31_%41_%FF#next');
          assert.deepEqual(plain(history.location.query), { x: '%41_A_%FF' });
          assert.equal(history.location.search, '?x=%25%34%31_%41_%FF');
          assert.equal(history.location.hash, '#next');
          history.replace({ pathname: '/final', query: { x: 'a+b' }, hash: '#final' });
          assert.equal(history.location.pathname, '/final');
          assert.deepEqual(plain(history.location.query), { x: 'a+b' });
          assert.equal(history.location.search, '?x=a%2Bb');
          assert.deepEqual(seen, ['PUSH', 'REPLACE']);
        } finally {
          unlisten();
        }
      });
    },
  );
}

test('installed history ESM browser entry bundles with the same decoder and executes in inert JSDOM', async () => {
  const esbuildCopy = packageCopies('esbuild').find((copy) => copy.manifest.version === '0.28.2');
  assert.ok(esbuildCopy, 'reviewed existing esbuild must be installed');
  const esbuild = esbuildCopy.require('esbuild');
  try {
    const result = await esbuild.build({
      entryPoints: [path.join(historyCopy.directory, historyCopy.manifest.module)],
      absWorkingDir: repositoryRoot,
      bundle: true,
      platform: 'browser',
      format: 'iife',
      globalName: 'UriHistory',
      define: { 'process.env.NODE_ENV': '"production"' },
      write: false,
      metafile: true,
      logLevel: 'silent',
    });
    const inputs = Object.keys(result.metafile.inputs).map((file) =>
      fs.realpathSync(path.resolve(repositoryRoot, file)),
    );
    assert.ok(
      inputs.includes(fs.realpathSync(decoderCopy.entry)),
      'bundle must consume the parent-bound patched decoder',
    );
    withDom('https://uri-contract.invalid/#/start?x=a+b%2Bc', (window) => {
      window.eval(result.outputFiles[0].text);
      const history = window.UriHistory.createHashHistory({ window });
      assert.deepEqual(plain(history.location.query), { x: 'a b+c' });
      history.push('/next?x=%25%34%31_%41_%FF');
      assert.deepEqual(plain(history.location.query), { x: '%41_A_%FF' });
      assert.equal(window.UriHistory.parsePath('/route?x=%2B#hash').query.x, '+');
    });
  } finally {
    await esbuild.stop();
  }
});
