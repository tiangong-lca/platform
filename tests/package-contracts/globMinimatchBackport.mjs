// Maintained exact-version backport generator. Run only on `pnpm patch` extractions.
// Inputs: minimatch 77a0f5c4b80bdc641c3c930a1d9edf5ad2db57f8 and
// glob 4682e8c9babee1b385202ede36389634e12076d7. No installed bytes are edited.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const { decode, encode } = require(
  path.join(
    repo,
    'node_modules/.pnpm/@jridgewell+sourcemap-codec@1.5.5/node_modules/@jridgewell/sourcemap-codec',
  ),
);

// The preparation verifier reads this inventory and queries the emitted maps with
// a separate source-map consumer; the generator does not assert its own mapping.
export const mutations = [];

// All offsets and columns are JavaScript UTF-16 offsets, as required by source maps.
function replacement(source, before, after, count = 1) {
  const edits = [];
  let start = 0;
  while ((start = source.indexOf(before, start)) !== -1) {
    edits.push({ start, end: start + before.length, text: after });
    start += before.length;
  }
  assert.equal(edits.length, count, `unexpected source shape: ${before}`);
  return edits;
}
function apply(source, edits) {
  let result = source;
  const ordered = [...edits].sort((a, b) => a.start - b.start);
  for (let i = 1; i < ordered.length; i++) assert(ordered[i - 1].end <= ordered[i].start);
  for (const edit of ordered.reverse())
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  return result;
}
function starts(source) {
  const result = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') result.push(i + 1);
  return result;
}
function position(lines, offset) {
  let low = 0;
  let high = lines.length;
  while (low + 1 < high) {
    const mid = (low + high) >>> 1;
    if (lines[mid] <= offset) low = mid;
    else high = mid;
  }
  return [low, offset - lines[low]];
}
function shifted(offset, edits) {
  let change = 0;
  for (const edit of [...edits].sort((a, b) => a.start - b.start)) {
    if (offset < edit.start) break;
    // Replaced original tokens have no asserted correspondence in the new text.
    if (offset < edit.end) return null;
    change += edit.text.length - (edit.end - edit.start);
  }
  return offset + change;
}

// Preserve source identities/names and every surviving original mapping. Translate
// generated positions and changed source positions independently; changed tokens
// are deliberately unmapped rather than assigned invented TS provenance.
function mappedFile(file, generatedEdits, sourceEdits, sourceTexts) {
  const original = fs.readFileSync(file, 'utf8');
  const generated = apply(original, generatedEdits);
  const mapFile = `${file}.map`;
  const map = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
  mutations.push({ file, generatedEdits, sourceEdits });
  const oldGeneratedLines = starts(original);
  const newGeneratedLines = starts(generated);
  const output = Array.from({ length: newGeneratedLines.length }, () => []);
  const sources = map.sources.map((source, index) => {
    const old = map.sourcesContent?.[index] ?? sourceTexts[source];
    const edits = sourceEdits[source] ?? [];
    assert(old !== undefined || !edits.length, `missing source ${source}`);
    return old === undefined ? null : { old: starts(old), next: starts(apply(old, edits)), edits };
  });
  for (const [line, segments] of decode(map.mappings).entries()) {
    for (const segment of segments) {
      const offset = shifted(oldGeneratedLines[line] + segment[0], generatedEdits);
      if (offset === null) continue;
      const [newLine, column] = position(newGeneratedLines, offset);
      if (segment.length === 1) {
        output[newLine].push([column]);
        continue;
      }
      const source = sources[segment[1]];
      let sourcePosition = segment.slice(2, 4);
      if (source?.edits.length) {
        const sourceOffset = shifted(source.old[segment[2]] + segment[3], source.edits);
        if (sourceOffset === null) {
          output[newLine].push([column]);
          continue;
        }
        sourcePosition = position(source.next, sourceOffset);
      }
      output[newLine].push([column, segment[1], ...sourcePosition, ...segment.slice(4)]);
    }
  }
  // Prevent previous mappings bleeding across inserted/replaced token spans.
  for (const edit of generatedEdits) {
    const before = generatedEdits.filter((e) => e.end <= edit.start && e !== edit);
    const start = edit.start + before.reduce((n, e) => n + e.text.length - e.end + e.start, 0);
    const [line, column] = position(newGeneratedLines, start);
    output[line].push([column]);
  }
  for (const segments of output) {
    segments.sort((a, b) => a[0] - b[0]);
    for (let i = segments.length - 2; i >= 0; i--) {
      if (segments[i][0] === segments[i + 1][0]) segments.splice(i, 1);
    }
  }
  map.mappings = encode(output);
  if (map.sourcesContent)
    map.sourcesContent = map.sourcesContent.map((text, i) =>
      apply(text, sourceEdits[map.sources[i]] ?? []),
    );
  fs.writeFileSync(file, generated);
  fs.writeFileSync(mapFile, JSON.stringify(map) + '\n');
}

function minimatchTS(source, configurable) {
  return [
    ...replacement(
      source,
      'firstPhasePreProcess(globParts: string[][]) {',
      'firstPhasePreProcess(globParts: string[][]) {\n' +
        (configurable
          ? '    const { braceExpandMax = 100_000 } = this.options'
          : '    const braceExpandMax = 100_000'),
    ),
    ...replacement(
      source,
      "p2 === '..'\n          )",
      "p2 === '..' ||\n            globParts.length >= braceExpandMax\n          )",
    ),
    ...replacement(
      source,
      'secondPhasePreProcess(globParts: string[][]): string[][] {',
      'secondPhasePreProcess(globParts: string[][]): string[][] {\n    if (globParts.length > 1000) return globParts',
    ),
  ];
}
function minimatchJS(source, configurable) {
  return [
    ...replacement(
      source,
      'firstPhasePreProcess(globParts) {',
      'firstPhasePreProcess(globParts) {\n' +
        (configurable
          ? '        const { braceExpandMax = 100_000 } = this.options;'
          : '        const braceExpandMax = 100_000;'),
    ),
    ...replacement(
      source,
      "p2 === '..')",
      "p2 === '..' ||\n                        globParts.length >= braceExpandMax)",
    ),
    ...replacement(
      source,
      'secondPhasePreProcess(globParts) {',
      'secondPhasePreProcess(globParts) {\n        if (globParts.length > 1000) return globParts;',
    ),
  ];
}
function walkerTS(source) {
  const resume = source.match(
    /  onResume\(fn: \(\) => (?:unknown|any)\) \{\n    if \(this.signal\?\.aborted\) return\n/,
  );
  assert(resume);
  return [
    ...replacement(
      source,
      resume[0],
      resume[0].replace('    if (this.signal?.aborted) return\n', ''),
      1,
    ),
    ...replacement(
      source,
      'if (this.signal?.aborted) cb()',
      'if (this.signal?.aborted) return cb()',
      4,
    ),
  ];
}
function walkerJS(source) {
  return [
    ...replacement(
      source,
      '    onResume(fn) {\n        if (this.signal?.aborted)\n            return;\n',
      '    onResume(fn) {\n',
      1,
    ),
    ...replacement(
      source,
      'if (this.signal?.aborted)\n            cb();',
      'if (this.signal?.aborted)\n            return cb();',
      4,
    ),
  ];
}
function bundleJS(source) {
  return [
    ...replacement(
      source,
      'firstPhasePreProcess(t){',
      'firstPhasePreProcess(t){const{braceExpandMax=100_000}=this.options;',
    ),
    ...replacement(source, 'l==="..")continue;', 'l===".."||t.length>=braceExpandMax)continue;'),
    ...replacement(
      source,
      'secondPhasePreProcess(t){',
      'secondPhasePreProcess(t){if(t.length>1000)return t;',
    ),
    ...replacement(
      source,
      'onResume(t){this.signal?.aborted||(this.paused?this.#t.push(t):t())}',
      'onResume(t){this.paused?this.#t.push(t):t()}',
    ),
    ...replacement(
      source,
      'walkCB(t,e,s){this.signal?.aborted&&s(),',
      'walkCB(t,e,s){if(this.signal?.aborted)return s();',
    ),
    ...replacement(
      source,
      'walkCBSync(t,e,s){this.signal?.aborted&&s(),',
      'walkCBSync(t,e,s){if(this.signal?.aborted)return s();',
    ),
    ...replacement(
      source,
      'if(this.signal?.aborted&&i(),this.paused)',
      'if(this.signal?.aborted)return i();if(this.paused)',
      2,
    ),
  ];
}

export function backport(extraction) {
  const resolved = path.resolve(extraction);
  const directory = fs.realpathSync.native(resolved);
  // Resolve root and ancestor aliases before inspecting or changing payloads.
  // Compare ASCII dependency-directory names without case assumptions about the
  // host volume, and use the canonical path for every subsequent operation.
  for (const target of [resolved, directory]) {
    assert(
      !target.split(path.sep).some((part) => part.toLowerCase() === 'node_modules'),
      'patch extraction must not resolve inside node_modules',
    );
  }
  // pnpm 11 writes JSON to this metadata filename. Bind the actual configured
  // content store as well, without guessing its location or adding a dependency.
  const { storeDir } = JSON.parse(
    fs.readFileSync(path.join(repo, 'node_modules/.modules.yaml'), 'utf8'),
  );
  assert(typeof storeDir === 'string' && path.isAbsolute(storeDir));
  const store = fs.realpathSync.native(storeDir);
  const relative = path.relative(store.toLowerCase(), directory.toLowerCase());
  assert(
    relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative),
    'patch extraction must not resolve inside the configured pnpm store',
  );
  const pkg = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
  assert(
    [
      'minimatch@8.0.7',
      'minimatch@9.0.9',
      'minimatch@10.2.5',
      'glob@9.3.5',
      'glob@10.5.0',
      'glob@13.0.6',
    ].includes(`${pkg.name}@${pkg.version}`),
  );
  const payloadModes = () => {
    const modes = {};
    const visit = (folder) => {
      for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
        const filename = path.join(folder, entry.name);
        const info = fs.lstatSync(filename);
        assert(!info.isSymbolicLink(), 'patch extraction must contain no symlinks');
        if (info.isDirectory()) visit(filename);
        else {
          assert(info.isFile(), 'patch extraction must contain only regular payload files');
          const mode = info.mode & 0o7777;
          if (process.platform !== 'win32') {
            assert(mode === 0o644 || mode === 0o755, 'unexpected published file mode');
          }
          modes[path.relative(directory, filename)] = mode;
        }
      }
    };
    visit(directory);
    return modes;
  };
  const originalModes = payloadModes();
  if (process.platform !== 'win32' && pkg.name === 'glob' && pkg.version === '10.5.0') {
    assert.equal(originalModes['dist/esm/bin.mjs'], 0o755, 'preserve the official executable CLI');
  }
  for (const format of fs.readdirSync(path.join(directory, 'dist'))) {
    const dist = path.join(directory, 'dist', format);
    if (!fs.statSync(dist).isDirectory()) continue;
    const base = pkg.name === 'minimatch' ? 'index' : 'walker';
    const js = path.join(dist, `${base}.js`);
    const map = JSON.parse(fs.readFileSync(`${js}.map`, 'utf8'));
    assert.equal(map.sources.length, 1);
    const sourceName = map.sources[0];
    const source = map.sourcesContent[0];
    const sourceEdits = {
      [sourceName]:
        pkg.name === 'minimatch'
          ? minimatchTS(source, pkg.version.startsWith('10.'))
          : walkerTS(source),
    };
    mappedFile(
      js,
      pkg.name === 'minimatch'
        ? minimatchJS(fs.readFileSync(js, 'utf8'), pkg.version.startsWith('10.'))
        : walkerJS(fs.readFileSync(js, 'utf8')),
      sourceEdits,
      {},
    );
    const declaration = path.join(dist, `${base}.d.ts`);
    if (fs.existsSync(`${declaration}.map`))
      mappedFile(declaration, [], sourceEdits, { [sourceName]: source });
    if (pkg.name === 'glob' && pkg.version === '13.0.6') {
      const bundle = path.join(dist, 'index.min.js');
      const bundleMap = JSON.parse(fs.readFileSync(`${bundle}.map`, 'utf8'));
      const changes = {};
      for (let i = 0; i < bundleMap.sources.length; i++) {
        const name = bundleMap.sources[i];
        if (name.endsWith('/minimatch/src/index.ts'))
          changes[name] = minimatchTS(bundleMap.sourcesContent[i], true);
        if (name.endsWith('/src/walker.ts')) changes[name] = walkerTS(bundleMap.sourcesContent[i]);
      }
      assert.equal(Object.keys(changes).length, 2);
      mappedFile(bundle, bundleJS(fs.readFileSync(bundle, 'utf8')), changes, {});
    }
  }
  assert.deepEqual(payloadModes(), originalModes, 'backport must preserve every payload file mode');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assert.equal(
    process.argv.length,
    3,
    'usage: node globMinimatchBackport.mjs <pnpm-patch-extraction>',
  );
  backport(process.argv[2]);
}
