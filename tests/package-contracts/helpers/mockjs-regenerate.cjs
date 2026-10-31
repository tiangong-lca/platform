// Compile only the maintained MockJS utility module; never execute package inputs/outputs.
// Usage: node tests/package-contracts/helpers/mockjs-regenerate.cjs \
//   --baseline <official-package-dir> --util <reviewed-util.js> --output <empty-output-dir>
// The output directory contains the four package-relative files plus generation.json.
// Runtime/security/caller proof is deliberately separate from this structural proof.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const toolingRoot = path.resolve(__dirname, '../../../node_modules/.pnpm');
const tools = [
  ['terser', '5.49.0'],
  ['acorn', '8.17.0'],
  ['magic-string', '0.30.21'],
  ['@jridgewell/sourcemap-codec', '1.5.5'],
  ['@jridgewell/trace-mapping', '0.3.31'],
];
const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
const tooling = new Map();
const toolReceipts = tools.map(([name, version]) => {
  const directory = path.join(
    toolingRoot,
    name.replace('/', '+') + '@' + version,
    'node_modules',
    name,
  );
  const manifest = fs.readFileSync(path.join(directory, 'package.json'));
  assert.equal(JSON.parse(manifest).version, version, 'exact installed generation tool');
  tooling.set(name, require(directory));
  return { name, version, manifestSha256: digest(manifest) };
});
const acorn = tooling.get('acorn');
const terser = tooling.get('terser');
const MagicString = tooling.get('magic-string');
const { decode, encode } = tooling.get('@jridgewell/sourcemap-codec');
const { TraceMap, originalPositionFor } = tooling.get('@jridgewell/trace-mapping');
const officialHashes = {
  'src/mock/util.js': 'ccb7744419e33607afeb1bdd71e84849255cf25ba82488a31023a9b19fa954dc',
  'dist/mock.js': '9540c922ce0f32e56d3f44d60f38c1a5f95e46a8a1861e18ff017d995eed8779',
  'dist/mock-min.js': '2b2031b120cf5c4531dbe3627c9a0fa3e6b04dbe38cd69101f6adb7f88239d27',
  'dist/mock-min.js.map': 'b86b735983f8fb4f77ce43366925bd7099ec4fd5e04c7527de0e137ad7ddcf1a',
};
const parse = (code) => acorn.parse(code, { ecmaVersion: 5, locations: true });
function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'string') visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((child) => walk(child, visit));
    else if (value && typeof value === 'object') walk(value, visit);
  }
}
function utilityModule(code) {
  const matches = [];
  walk(parse(code), (node) => {
    if (
      node.type === 'ArrayExpression' &&
      node.elements.length >= 25 &&
      node.elements.every((item) => item && item.type === 'FunctionExpression')
    )
      matches.push(node);
  });
  assert.equal(matches.length, 1, 'one canonical Webpack module array');
  assert.equal(matches[0].elements.length, 29, 'official module count');
  const module = matches[0].elements[3];
  assert.match(code.slice(module.start, module.end), /\.extend\s*=/);
  return { module, count: matches[0].elements.length };
}
function position(code, offset) {
  const prefix = code.slice(0, offset).split('\n');
  return { line: prefix.length - 1, column: prefix.at(-1).length };
}
function compare(a, b) {
  return a.line - b.line || a.column - b.column;
}
function translate(point, before, after) {
  return point.line === before.line
    ? { line: after.line, column: after.column + point.column - before.column }
    : { line: after.line + point.line - before.line, column: point.column };
}
function eachSegment(map, fn) {
  decode(map.mappings).forEach((line, lineIndex) =>
    line.forEach((segment) => fn({ line: lineIndex, column: segment[0] }, segment.slice(1))),
  );
}
function semanticPosition(map, point) {
  return originalPositionFor(new TraceMap(map), { line: point.line + 1, column: point.column });
}
function utilityMapProbe(map, sourceLine) {
  const source = map.sources.findIndex((name) => name.endsWith('/src/mock/util.js'));
  let probe;
  eachSegment(map, (point, rest) => {
    if (!probe && rest[0] === source && rest[1] === sourceLine - 1)
      probe = {
        generated: { line: point.line + 1, column: point.column },
        original: semanticPosition(map, point),
      };
  });
  assert(probe, `utility source line ${sourceLine} has an actual generated mapping`);
  return probe;
}
function assertMapBounds(code, map) {
  const lines = code.split('\n');
  const sources = map.sourcesContent.map((source) => source && source.split('\n'));
  let count = 0;
  eachSegment(map, (point, rest) => {
    assert(point.line < lines.length && point.column <= lines[point.line].length);
    if (rest.length) {
      const [source, line, column, name] = rest;
      assert(
        sources[source] && line < sources[source].length && column <= sources[source][line].length,
      );
      if (name !== undefined) assert(name < map.names.length);
    }
    count++;
  });
  return count;
}
async function compileUtility(utilSource, footer, sourceName) {
  // Only wrapper bytes are generated/unmapped; original utility character offsets are
  // mapped densely. Terser composes this input map into its generated local module map.
  const ms = new MagicString(utilSource);
  ms.prepend('(function(module, exports){\n').append('\n})');
  const inputMap = JSON.parse(
    ms.generateMap({ source: sourceName, includeContent: true, hires: true }).toString(),
  );
  const result = await terser.minify(
    { 'utility-wrapper.js': ms.toString() },
    {
      ecma: 5,
      compress: false,
      mangle: true,
      format: { ecma: 5, ascii_only: false, comments: false, semicolons: true },
      sourceMap: { content: inputMap, asObject: true },
    },
  );
  const ast = parse(result.code);
  assert.equal(ast.body.length, 1);
  const expression = ast.body[0].expression;
  assert.equal(expression.type, 'FunctionExpression');
  const localMap = result.map;
  // Terser normalizes the legacy webpack:///./ spelling. Restore ONLY this
  // verified equivalent source identity before joining the original source table.
  assert.deepEqual(localMap.sources, [sourceName.replace('/./', '/')]);
  localMap.sources = [sourceName];
  assert.equal(localMap.sourcesContent[0], utilSource);
  localMap.sourcesContent[0] += footer;
  const code = result.code.slice(expression.start, expression.end);
  assert(!code.includes('\n'), 'module substitution is one generated line');
  return {
    code,
    localMap,
    expressionStart: position(result.code, expression.start),
    expressionEnd: position(result.code, expression.end),
  };
}
function replaceUnminifiedUtility(source, originalSource, utilSource) {
  const full = utilityModule(source).module;
  const body = source.slice(full.body.start + 1, full.body.end - 1);
  const indentNonempty = (text) => text.replace(/^(?=.)/gm, '\t');
  const indentAll = (text) =>
    text
      .split('\n')
      .map((line, index, lines) => (index === lines.length - 1 && line === '' ? '' : '\t' + line))
      .join('\n');
  const indent = body.includes(indentNonempty(originalSource)) ? indentNonempty : indentAll;
  const originalPayload = indent(originalSource);
  const payloadOffset = body.indexOf(originalPayload);
  assert(payloadOffset >= 0 && body.lastIndexOf(originalPayload) === payloadOffset);
  const start = full.body.start + 1 + payloadOffset;
  const replacement = indent(utilSource);
  const code = source.slice(0, start) + replacement + source.slice(start + originalPayload.length);
  parse(code);
  assert.equal(code.slice(0, start), source.slice(0, start));
  assert.equal(
    code.slice(start + replacement.length),
    source.slice(start + originalPayload.length),
  );
  return {
    code,
    start: position(source, start),
    end: position(source, start + originalPayload.length),
    newEnd: position(code, start + replacement.length),
  };
}
function spliceMap(original, generated, oldStart, oldEnd, newEnd, compiled, intermediate) {
  const map = {
    ...original,
    sources: [...original.sources],
    names: [...original.names],
    sourcesContent: [...original.sourcesContent],
  };
  const utilityIndex = map.sources.indexOf(compiled.localMap.sources[0]);
  assert(utilityIndex >= 0);
  map.sourcesContent[utilityIndex] = compiled.localMap.sourcesContent[0];
  const intermediateIndex = map.sources.indexOf('webpack:///mock-min.js');
  assert(intermediateIndex >= 0);
  map.sourcesContent[intermediateIndex] = intermediate.code;
  let rebasedIntermediateMappings = 0;
  function rebaseOriginal(segment) {
    const rest = [...segment];
    if (rest[0] === intermediateIndex) {
      const point = { line: rest[1], column: rest[2] };
      assert(
        compare(point, intermediate.start) < 0 || compare(point, intermediate.end) >= 0,
        'no obsolete intermediate utility position remains outside replaced generated module',
      );
      if (compare(point, intermediate.end) >= 0) {
        const next = translate(point, intermediate.end, intermediate.newEnd);
        rest[1] = next.line;
        rest[2] = next.column;
        rebasedIntermediateMappings++;
      }
    }
    return rest;
  }
  const lines = [];
  const add = (point, rest) => {
    lines[point.line] ||= [];
    lines[point.line].push([point.column, ...rest]);
  };
  let before = 0,
    after = 0,
    removed = 0,
    outsideUtility = 0;
  eachSegment(original, (point, rest) => {
    if (compare(point, oldStart) < 0) {
      add(point, rebaseOriginal(rest));
      before++;
    } else if (compare(point, oldEnd) >= 0) {
      add(translate(point, oldEnd, newEnd), rebaseOriginal(rest));
      after++;
    } else removed++;
    if (rest[0] === utilityIndex && (compare(point, oldStart) < 0 || compare(point, oldEnd) >= 0))
      outsideUtility++;
  });
  assert.equal(
    outsideUtility,
    0,
    'no utility-source positions survive outside replaced generated module',
  );
  add(oldStart, []); // Explicitly stop old GLB mappings at the new module boundary.
  eachSegment(compiled.localMap, (point, rest) => {
    if (compare(point, compiled.expressionStart) < 0 || compare(point, compiled.expressionEnd) >= 0)
      return;
    if (rest.length) {
      const localSource = compiled.localMap.sources[rest[0]];
      assert.equal(localSource, map.sources[utilityIndex]);
      rest[0] = utilityIndex;
      if (rest.length > 3) {
        const name = compiled.localMap.names[rest[3]];
        let index = map.names.indexOf(name);
        if (index < 0) {
          index = map.names.length;
          map.names.push(name);
        }
        rest[3] = index;
      }
    }
    add(translate(point, compiled.expressionStart, oldStart), rest);
  });
  // A generated closing brace is unmapped and must not leak a utility GLB mapping
  // into the unchanged comma/next module before its original first mapping.
  add(newEnd, []);
  for (let i = 0; i < lines.length; i++) {
    lines[i] ||= [];
    lines[i].sort((a, b) => a[0] - b[0]);
    lines[i] = lines[i].filter(
      (segment, index, entries) =>
        index === entries.length - 1 || segment[0] !== entries[index + 1][0],
    );
  }
  map.mappings = encode(lines);
  assert.deepEqual(decode(map.mappings), lines);
  const oldTrace = new TraceMap(original),
    newTrace = new TraceMap(map);
  let checked = 0;
  eachSegment(original, (point, rest) => {
    if (compare(point, oldStart) >= 0 && compare(point, oldEnd) < 0) return;
    const next = compare(point, oldEnd) >= 0 ? translate(point, oldEnd, newEnd) : point;
    const prevResult = originalPositionFor(oldTrace, {
      line: point.line + 1,
      column: point.column,
    });
    if (
      rest[0] === intermediateIndex &&
      compare({ line: rest[1], column: rest[2] }, intermediate.end) >= 0
    ) {
      const shifted = translate(
        { line: rest[1], column: rest[2] },
        intermediate.end,
        intermediate.newEnd,
      );
      prevResult.line = shifted.line + 1;
      prevResult.column = shifted.column;
    }
    const nextResult = originalPositionFor(newTrace, { line: next.line + 1, column: next.column });
    assert.deepEqual(
      nextResult,
      prevResult,
      'all retained original mapping positions preserve exact source/line/column/name',
    );
    checked++;
  });
  let localChecked = 0;
  eachSegment(compiled.localMap, (point) => {
    if (compare(point, compiled.expressionStart) < 0 || compare(point, compiled.expressionEnd) >= 0)
      return;
    const next = translate(point, compiled.expressionStart, oldStart);
    assert.deepEqual(
      originalPositionFor(newTrace, { line: next.line + 1, column: next.column }),
      semanticPosition(compiled.localMap, point),
    );
    localChecked++;
  });
  return {
    map,
    counts: {
      before,
      after,
      removed,
      outsideUtility,
      retainedMappingsChecked: checked,
      composedUtilityMappingsChecked: localChecked,
      rebasedIntermediateMappings,
    },
  };
}
async function build(utilSource, originalSource, source, minified, originalMap, footer, module) {
  const sourceName = originalMap.sources.find((name) => name.endsWith('/src/mock/util.js'));
  const compiled = await compileUtility(utilSource, footer, sourceName);
  const generated = minified.slice(0, module.start) + compiled.code + minified.slice(module.end);
  parse(generated); // finite ES5 compilation validation; no execution
  const oldStart = position(minified, module.start),
    oldEnd = position(minified, module.end);
  const newEnd = position(generated, module.start + compiled.code.length);
  const intermediate = replaceUnminifiedUtility(
    originalMap.sourcesContent[1],
    originalSource,
    utilSource,
  );
  const { map, counts } = spliceMap(
    originalMap,
    generated,
    oldStart,
    oldEnd,
    newEnd,
    compiled,
    intermediate,
  );
  assert.equal(generated.slice(0, module.start), minified.slice(0, module.start));
  assert.equal(generated.slice(module.start + compiled.code.length), minified.slice(module.end));
  assert.deepEqual(map.sources, originalMap.sources);
  originalMap.sources.forEach((name, index) => {
    if (name !== sourceName && index !== 1)
      assert.equal(map.sourcesContent[index], originalMap.sourcesContent[index]);
  });
  const mapJson = JSON.stringify(map);
  // Unminified dist replacement preserves its precise original whitespace.
  const unminified = replaceUnminifiedUtility(source, originalSource, utilSource).code;
  const outputs = {
    'src/mock/util.js': utilSource,
    'dist/mock.js': unminified,
    'dist/mock-min.js': generated,
    'dist/mock-min.js.map': mapJson,
  };
  // Representative map traces on each side and both utility boundaries, in UTF-16 columns.
  const probes = [
    [
      'prefix-tail',
      { line: oldStart.line, column: oldStart.column - 1 },
      { line: oldStart.line, column: oldStart.column - 1 },
    ],
    ['utility-start', oldStart, oldStart],
    [
      'utility-final-char',
      { line: oldEnd.line, column: oldEnd.column - 1 },
      { line: newEnd.line, column: newEnd.column - 1 },
    ],
    ['suffix-start', oldEnd, newEnd],
    [
      'suffix-plus-20',
      { line: oldEnd.line, column: oldEnd.column + 20 },
      { line: newEnd.line, column: newEnd.column + 20 },
    ],
  ].map(([name, oldPosition, newPosition]) => ({
    name,
    oldPosition,
    newPosition,
    before: semanticPosition(originalMap, oldPosition),
    after: semanticPosition(map, newPosition),
  }));
  const report = {
    oldRange: { start: module.start, end: module.end, oldStart, oldEnd },
    offsetUnit: 'UTF-16 code units; source-map lines in ranges are zero-based',
    oldByteRange: {
      start: Buffer.byteLength(minified.slice(0, module.start)),
      end: Buffer.byteLength(minified.slice(0, module.end)),
    },
    newRange: { start: module.start, end: module.start + compiled.code.length, newEnd },
    utilityMapProbes: {
      extendDeclaration: utilityMapProbe(
        map,
        utilSource.slice(0, utilSource.indexOf('Util.extend =')).split('\n').length,
      ),
    },
    generatedSourceMapSegments: assertMapBounds(generated, map),
    counts,
    probes,
    prefixSha256: digest(minified.slice(0, module.start)),
    suffixSha256: digest(minified.slice(module.end)),
    outputs: Object.fromEntries(
      Object.entries(outputs).map(([name, text]) => [
        name,
        {
          bytes: Buffer.byteLength(text),
          sha256: digest(text),
        },
      ]),
    ),
  };
  assert.equal(semanticPosition(map, oldStart).source, null, 'generated wrapper starts unmapped');
  assert.equal(
    semanticPosition(map, { line: newEnd.line, column: newEnd.column - 1 }).source,
    null,
    'generated wrapper ends unmapped',
  );
  assert.equal(semanticPosition(map, newEnd).source, null, 'unchanged separator is unmapped');
  return { outputs, report };
}

async function generate(options) {
  assert.equal(process.version, 'v24.19.0', 'repository Node baseline');
  const baseline = fs.realpathSync(options.baseline);
  const util = fs.realpathSync(options.util);
  const output = path.resolve(options.output);
  assert(!output.split(path.sep).includes('node_modules'), 'never write an installed package');
  assert(
    output !== baseline &&
      !baseline.startsWith(output + path.sep) &&
      !output.startsWith(baseline + path.sep),
    'output must be separate from official baseline',
  );
  assert(
    util !== output && !util.startsWith(output + path.sep),
    'input source must not be overwritten',
  );
  if (fs.existsSync(output)) {
    assert(
      fs.statSync(output).isDirectory() && !fs.lstatSync(output).isSymbolicLink(),
      'regular output directory',
    );
    assert.deepEqual(fs.readdirSync(output), [], 'output directory must be empty');
  }
  const inputs = {};
  const read = (name) => {
    const file = path.join(baseline, name);
    assert(
      fs.lstatSync(file).isFile() && !fs.lstatSync(file).isSymbolicLink(),
      'regular baseline input',
    );
    const bytes = fs.readFileSync(file);
    assert.equal(digest(bytes), officialHashes[name], 'official MockJS 1.1.0 input: ' + name);
    inputs[name] = { bytes: bytes.length, sha256: digest(bytes) };
    return bytes.toString('utf8');
  };
  const source = read('dist/mock.js'),
    minified = read('dist/mock-min.js');
  const originalSource = read('src/mock/util.js');
  const originalMap = JSON.parse(read('dist/mock-min.js.map'));
  const utilSource = fs.readFileSync(util, 'utf8');
  parse(utilSource);
  assert.equal(utilSource.split('Util.extend =').length, 2, 'one reviewed extend implementation');
  assert.equal(originalMap.sources.length, 32, 'official source table');
  assert.equal(originalMap.file, 'mock-min.js');
  assert.match(minified, /sourceMappingURL=mock-min\.js\.map/);
  const utilityIndex = originalMap.sources.findIndex((name) => name.endsWith('/src/mock/util.js'));
  assert(originalMap.sourcesContent[utilityIndex].startsWith(originalSource));
  const footer = originalMap.sourcesContent[utilityIndex].slice(originalSource.length);
  const { module, count } = utilityModule(minified);
  const first = await build(
    utilSource,
    originalSource,
    source,
    minified,
    originalMap,
    footer,
    module,
  );
  const repeated = await build(
    utilSource,
    originalSource,
    source,
    minified,
    originalMap,
    footer,
    module,
  );
  assert.deepEqual(first, repeated, 'repeat compilation is byte deterministic');
  const report = {
    schema: 'mockjs.utility-generation.v1',
    classification:
      'Compilation/map/byte proof only; runtime and security proof required separately',
    neverExecutedMockjs: true,
    newDependencies: false,
    tools: { node: process.version, packages: toolReceipts },
    inputs,
    candidateSource: { bytes: Buffer.byteLength(utilSource), sha256: digest(utilSource) },
    moduleIndex: 3,
    moduleCount: count,
    allOtherModuleAndUMDBytesIdentical: true,
    sourcesContentChangedOnlyUtilityAndEmbeddedIntermediate: true,
    other30SourcesContentIdentical: true,
    originalMapSources: originalMap.sources.length,
    originalMapSegments: assertMapBounds(minified, originalMap),
    deterministic: true,
    ...first.report,
  };
  fs.mkdirSync(output, { recursive: true });
  for (const [name, text] of Object.entries(first.outputs)) {
    const destination = path.join(output, name);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, text, { flag: 'wx' });
  }
  fs.writeFileSync(path.join(output, 'generation.json'), JSON.stringify(report, null, 2) + '\n', {
    flag: 'wx',
  });
  return report;
}

async function main() {
  const args = process.argv.slice(2);
  assert.equal(
    args.length,
    6,
    'usage: --baseline <official-dir> --util <candidate-util.js> --output <empty-dir>',
  );
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    assert(['--baseline', '--util', '--output'].includes(args[i]), 'known flag');
    const key = args[i].slice(2);
    assert(!Object.hasOwn(options, key), 'no duplicate flags');
    options[key] = args[i + 1];
  }
  assert(options.baseline && options.util && options.output, 'all three inputs required');
  const report = await generate(options);
  console.log(
    JSON.stringify({
      output: path.resolve(options.output),
      counts: report.counts,
      deterministic: report.deterministic,
    }),
  );
}

module.exports = { generate };
if (require.main === module)
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
