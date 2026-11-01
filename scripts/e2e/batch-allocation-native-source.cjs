const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const { createRequire, Module } = require('node:module');
const { check } = require('./batch-allocation-native-policy.cjs');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const PRODUCT = Object.freeze([
  'src/pages/Processes/Components/Exchange/allocationBatch.tsx',
  'src/pages/Processes/Components/Exchange/allocationEditor.tsx',
  'src/services/processes/allocation.ts',
  'src/services/general/tidasScalarStorage.ts',
]);
const FILES = Object.freeze([
  ...PRODUCT,
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'docker/e2e/environment.json',
  'scripts/e2e/portal-native-resources.cjs',
  'scripts/e2e/batch-allocation-native.cjs',
  'scripts/e2e/batch-allocation-native-policy.cjs',
  'scripts/e2e/batch-allocation-native-source.cjs',
  'scripts/e2e/batch-allocation-native-worker.cjs',
  'scripts/e2e/batch-allocation-native-probe.cjs',
  'scripts/e2e/batch-allocation-native-runtime.cjs',
  'scripts/e2e/batch-allocation-diagnostic.cjs',
  'tests/e2e/i18n/batch-allocation-observer.ts',
  'tests/e2e/i18n/process-allocation.spec.ts',
  'tests/package-contracts/native-batch-allocation/fixture.mjs',
  'tests/package-contracts/native-batch-allocation/control.spec.cjs',
  'tests/package-contracts/native-batch-allocation/config.cjs',
]);
function exactInstalledPath(directory, relative) {
  const parts = relative.split('/');
  check(
    parts.every((part) => part && part !== '.' && part !== '..'),
    'source_file_invalid',
  );
  // Preserve anchor resolution, but never case-fold a declared relative input.
  for (const part of parts) {
    check(fs.readdirSync(directory).includes(part), 'source_file_invalid');
    directory = path.join(directory, part);
  }
  return directory;
}
function fileHash(file, max = 16 * 1024 ** 2) {
  const s = fs.lstatSync(file);
  check(s.isFile() && s.size <= max, 'source_file_invalid');
  const descriptor = fs.openSync(file, 'r'),
    hash = crypto.createHash('sha256'),
    buffer = Buffer.alloc(1024 * 1024);
  try {
    let bytes = 0,
      count;
    while ((count = fs.readSync(descriptor, buffer, 0, buffer.length, null))) {
      hash.update(buffer.subarray(0, count));
      bytes += count;
      check(bytes <= max, 'source_file_grew');
    }
    const final = fs.fstatSync(descriptor);
    check(
      bytes === s.size &&
        final.ino === s.ino &&
        final.dev === s.dev &&
        final.size === s.size &&
        final.mtimeMs === s.mtimeMs,
      'source_file_changed',
    );
    return hash.digest('hex');
  } finally {
    fs.closeSync(descriptor);
  }
}
function bindBrowserTree(cache, executable) {
  const relative = path.relative(cache, executable);
  check(
    relative && !relative.startsWith('..') && !path.isAbsolute(relative),
    'browser_cache_escape',
  );
  const directory = path.join(cache, relative.split(path.sep)[0]),
    files = {},
    queue = [directory];
  let count = 0;
  while (queue.length) {
    const folder = queue.pop();
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      check(++count <= 20000, 'browser_cache_entry_cap');
      const file = path.join(folder, entry.name),
        stat = fs.lstatSync(file);
      if (entry.isSymbolicLink()) {
        const real = fs.realpathSync(file);
        check(
          real === directory || real.startsWith(directory + path.sep),
          'browser_cache_symlink_escape',
        );
        files[file] = { type: 'link', target: path.relative(directory, real) };
      } else if (entry.isDirectory()) queue.push(file);
      else {
        check(entry.isFile(), 'browser_cache_nonregular');
        files[file] = {
          type: 'file',
          mode: stat.mode & 0o777,
          bytes: stat.size,
          sha256: fileHash(file, 1024 ** 3),
        };
      }
    }
  }
  return { directory, files, sha256: sha(JSON.stringify(files)) };
}
function bindSources(root, head, tree) {
  const req = createRequire(path.join(root, 'package.json'));
  const hashes = Object.fromEntries(
    FILES.map((p) => [path.join(root, p), fileHash(path.join(root, p))]),
  );
  const antd = fs.realpathSync(path.dirname(req.resolve('antd/package.json')));
  const ar = createRequire(path.join(antd, 'package.json'));
  const packages = [
    ['antd', '6.6.6', antd],
    ['react', '19.3.1', path.dirname(req.resolve('react/package.json'))],
    ['react-dom', '19.3.1', path.dirname(req.resolve('react-dom/package.json'))],
    ...[
      ['select', '1.10.1'],
      ['input-number', '1.6.2'],
      ['dialog', '1.10.0'],
      ['table', '1.11.1'],
    ].map(([name, version]) => [
      '@rc-component/' + name,
      version,
      path.dirname(ar.resolve('@rc-component/' + name + '/package.json')),
    ]),
  ];
  const installed = {};
  for (const [name, version, dir] of packages) {
    const file = exactInstalledPath(dir, 'package.json');
    check(JSON.parse(fs.readFileSync(file)).version === version, 'installed_generation_changed');
    installed[name] = { version, packageSha256: fileHash(file), directory: fs.realpathSync(dir) };
    hashes[file] = installed[name].packageSha256;
  }
  const selected = {
    antd: [
      'es/button/Button.js',
      'es/button/buttonHelpers.js',
      'es/alert/Alert.js',
      'es/_util/wave/index.js',
      'es/_util/wave/useWave.js',
      'es/_util/wave/WaveEffect.js',
      'es/_util/wave/style.js',
    ],
    '@rc-component/select': ['es/SelectInput/Content/SingleContent.js'],
    '@rc-component/input-number': ['es/InputNumber.js'],
    '@rc-component/table': ['es/Table.js', 'es/Body/BodyRow.js'],
    '@rc-component/dialog': ['es/Dialog/Content/Panel.js'],
  };
  for (const [name, files] of Object.entries(selected))
    for (const rel of files) {
      const file = exactInstalledPath(installed[name].directory, rel);
      hashes[file] = fileHash(file);
    }
  const runtime = require('./batch-allocation-native-runtime.cjs').inspectRuntimePackages(root);
  const coreRoot = path.dirname(path.dirname(runtime.bundleFile));
  for (const file of Object.keys(runtime.files)) {
    const relative = path.relative(coreRoot, file);
    if (!relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))
      exactInstalledPath(coreRoot, relative.split(path.sep).join('/'));
    else exactInstalledPath(path.dirname(file), path.basename(file));
  }
  Object.assign(hashes, runtime.files);
  return {
    mode: 'worktree-hashes-only',
    head,
    tree,
    hashes,
    installed,
    installedControlsSha256: sha(JSON.stringify(installed) + JSON.stringify(hashes)),
    designSha256: '2a067d4b6fe8cd1eb46b78da35957c0cbd8db6388ab417ea6dc173ab34cf7a64',
    isolation: [
      'fixed-exact-revision-Flow-lookup',
      'English-default-message-localization',
      'fixed-synthetic-getLangText',
    ],
    omitted: [
      'Process-drawer',
      'router',
      'auth',
      'predecessor-deletions',
      'save-reopen',
      'application-services',
    ],
  };
}
function verifySources(binding) {
  for (const [file, digest] of Object.entries(binding.hashes))
    check(fileHash(file) === digest, 'source_changed');
}
async function build(root, output, binding) {
  const req = createRequire(path.join(root, 'package.json'));
  const compiler = createRequire(req.resolve('@umijs/max/package.json'))('esbuild');
  const loaded = new Map(),
    virtual = new Map();
  const adapters = {
    umi: String.raw`export const useIntl=()=>({formatMessage:({defaultMessage},values={})=>defaultMessage.replace(/\{([a-z]+)\}/g,(_,key)=>String(values[key]))});`,
    '@/services/general/util':
      'export const getLangText=(items,lang)=>{if(lang!=="en")throw Error("fixture_language");return items?.find(x=>x["@xml:lang"]==="en")?.["#text"]??""};',
    '@/services/flows/api':
      'export const getFlowProperties=async refs=>{const data=[1,2].map(i=>({id:`11360000-0000-4000-8000-${String(i).padStart(12,"0")}`,version:"01.00.000",typeOfDataSet:"Product flow"}));if(refs.length!==2||refs.some((ref,i)=>ref.id!==data[i].id||ref.version!==data[i].version||ref.value!==String(i+1)))throw Error("fixed_flow_request");return{success:true,data}};',
  };
  const plugin = {
    name: 'exact-batch-source-closure',
    setup(api) {
      api.onResolve({ filter: /^(?:umi|@\/)/ }, (args) => {
        if (Object.hasOwn(adapters, args.path)) return { path: args.path, namespace: 'controlled' };
        if (args.path.startsWith('@/'))
          return { path: path.join(root, 'src', args.path.slice(2) + '.ts') };
        throw Error('unexpected_application_import');
      });
      api.onLoad({ filter: /.*/, namespace: 'controlled' }, (args) => {
        check(Object.hasOwn(adapters, args.path), 'unexpected_adapter');
        virtual.set(args.path, sha(adapters[args.path]));
        return { contents: adapters[args.path], loader: 'js' };
      });
      api.onLoad({ filter: /\.(?:[cm]?js|jsx|tsx?|json|css)$/ }, (args) => {
        const file = fs.realpathSync(args.path),
          relative = path.relative(root, file).split(path.sep).join('/');
        check(
          !relative.startsWith('src/') || PRODUCT.includes(relative),
          'unexpected_application_module',
        );
        const bytes = fs.readFileSync(file);
        loaded.set(file, sha(bytes));
        const extension = path.extname(file).slice(1);
        return {
          contents: bytes,
          loader: ['mjs', 'cjs'].includes(extension) ? 'js' : extension,
          resolveDir: path.dirname(file),
        };
      });
    },
  };
  try {
    const result = await compiler.build({
      absWorkingDir: root,
      entryPoints: [path.join(root, 'tests/package-contracts/native-batch-allocation/fixture.mjs')],
      bundle: true,
      write: false,
      metafile: true,
      platform: 'browser',
      format: 'iife',
      target: 'es2022',
      mainFields: ['module', 'main'],
      define: { 'process.env.NODE_ENV': '"production"' },
      jsx: 'automatic',
      outfile: path.join(output, 'fixture.js'),
      plugins: [plugin],
      logLevel: 'silent',
    });
    check(
      virtual.size === 3 && PRODUCT.every((p) => loaded.has(fs.realpathSync(path.join(root, p)))),
      'product_import_closure',
    );
    check(
      Object.values(result.metafile.outputs).every((o) => !o.imports.some((i) => i.external)),
      'external_bundle_import',
    );
    for (const [name] of Object.entries(result.metafile.inputs)) {
      if (name.startsWith('controlled:')) continue;
      check(loaded.has(fs.realpathSync(path.resolve(root, name))), 'unbound_bundle_input');
    }
    for (const [file, digest] of loaded) {
      check(fileHash(file) === digest, 'build_input_changed');
      binding.hashes[file] = digest;
    }
    const files = {};
    for (const file of result.outputFiles) {
      const name = path.basename(file.path);
      check(
        ['fixture.js', 'fixture.css'].includes(name) && file.contents.length <= 16 * 1024 ** 2,
        'bundle_output',
      );
      fs.writeFileSync(path.join(output, name), file.contents, { flag: 'wx', mode: 0o600 });
      files[name] = { sha256: sha(file.contents), bytes: file.contents.length };
    }
    const observerFile = path.join(root, 'tests/e2e/i18n/batch-allocation-observer.ts');
    const transformed = await compiler.build({
      entryPoints: [observerFile],
      bundle: false,
      write: false,
      platform: 'node',
      format: 'cjs',
      target: 'es2022',
      logLevel: 'silent',
    });
    const bytes = Buffer.from(transformed.outputFiles[0].contents);
    const observerModule = new Module(observerFile, module);
    observerModule.filename = observerFile;
    observerModule.paths = Module._nodeModulePaths(path.dirname(observerFile));
    observerModule._compile(bytes.toString(), observerFile);
    const observer = observerModule.exports;
    check(
      ['installBatchAllocationObserver', 'finishBatchAllocationObserver'].every(
        (k) => typeof observer[k] === 'function',
      ),
      'observer_exports',
    );
    fs.writeFileSync(path.join(output, 'observer-host.cjs'), bytes, { flag: 'wx', mode: 0o600 });
    const receipt = {
      files,
      inputHashes: Object.fromEntries(loaded),
      adapters: Object.fromEntries(virtual),
      transformedObserverSha256: sha(bytes),
      serializedObserverSha256: sha(
        observer.installBatchAllocationObserver.toString() +
          observer.finishBatchAllocationObserver.toString(),
      ),
    };
    fs.writeFileSync(
      path.join(output, 'build-binding.json'),
      JSON.stringify(receipt, null, 2) + '\n',
      { flag: 'wx', mode: 0o600 },
    );
    verifySources(binding);
    return { observer, receipt };
  } finally {
    compiler.stop();
  }
}
module.exports = {
  sha,
  fileHash,
  FILES,
  PRODUCT,
  bindSources,
  bindBrowserTree,
  verifySources,
  build,
};
