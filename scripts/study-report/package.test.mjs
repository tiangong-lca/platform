import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { archiveFiles, buildRenderer, checkMethodProtocol } from './build.mjs';
import ts from '../typescript-native-parser.mjs';
import { checkDocumentLanguage, documentLanguageSource } from './document-language.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('portable language metadata remains derived from the shared registry', async () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'study-report-language-'));
  try {
    const file = path.join(target, 'documentLanguage.ts');
    const source = await documentLanguageSource();
    fs.writeFileSync(file, source);
    await checkDocumentLanguage(file);
    fs.writeFileSync(file, source.replace('en-US', 'fr-FR'));
    await assert.rejects(checkDocumentLanguage(file), /document language is stale/u);
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('artifact is deterministic, byte-bound, dependency-free and consumable outside the source tree', async () => {
  const first = await buildRenderer();
  const archivePath = path.join(first.output, first.archiveName);
  const initial = fs.readFileSync(archivePath);
  const second = await buildRenderer();
  assert.deepEqual(fs.readFileSync(archivePath), initial);
  assert.equal(
    first.manifest.sourceCommit,
    execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  );
  assert.match(first.manifest.sourceDigest, /^[a-f0-9]{64}$/u);
  const receipt = JSON.parse(fs.readFileSync(path.join(second.output, 'archive.json'), 'utf8'));
  assert.equal(receipt.sha256, sha(initial));
  assert.equal(receipt.byteSize, initial.length);
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'study-report-consumer-'));
  try {
    execFileSync('tar', ['-xzf', archivePath, '-C', target]);
    const installed = path.join(target, 'package');
    const manifestBytes = fs.readFileSync(path.join(installed, 'manifest.json'));
    assert.equal(receipt.manifestSha256, sha(manifestBytes));
    const manifest = JSON.parse(manifestBytes);
    for (const file of manifest.files) {
      const bytes = fs.readFileSync(path.join(installed, file.path));
      assert.equal(bytes.length, file.byteSize);
      assert.equal(sha(bytes), file.sha256);
    }
    const pkg = JSON.parse(fs.readFileSync(path.join(installed, 'package.json'), 'utf8'));
    assert.equal(pkg.version, '3.0.0');
    assert.equal(pkg.version, manifest.rendererVersion);
    assert.equal(pkg.dependencies, undefined);
    assert.equal(pkg.devDependencies, undefined);
    assert.equal(pkg.scripts, undefined);
    assert.equal(pkg.exports['.'].import, './index.js');
    const view = JSON.parse(
      fs.readFileSync(path.join(root, 'tests/fixtures/study-report/view-v3.json'), 'utf8'),
    );
    const context = JSON.parse(
      fs.readFileSync(path.join(root, 'tests/fixtures/study-report/context-v1.json'), 'utf8'),
    );
    fs.writeFileSync(
      path.join(target, 'consumer.ts'),
      `import { renderReport, validateReportView, type ReportViewModel, type RenderContext, type MethodReportSummary } from './package/index.js';
declare const input: unknown;
const view: ReportViewModel = validateReportView(input);
const renderer: '3.0.0' = view.rendererVersion;
const schema: 'lca.study-report-view.v3' = view.schemaVersion;
const summary: MethodReportSummary = view.methodAssessment;
const qualified: false = summary.pefConformityQualified;
declare const context: RenderContext;
const output: Promise<string> = renderReport(view, context);
// @ts-expect-error Historical renderer versions are not current method views.
const old: ReportViewModel['rendererVersion'] = '2.0.0';
`,
    );
    fs.writeFileSync(
      path.join(target, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'ES2022',
          moduleResolution: 'bundler',
          strict: true,
          skipLibCheck: false,
          types: [],
          lib: ['ES2022', 'DOM'],
          noEmit: true,
        },
        include: ['consumer.ts'],
      }),
    );
    execFileSync(
      process.execPath,
      [
        path.join(root, 'node_modules/typescript/bin/tsc'),
        '-p',
        path.join(target, 'tsconfig.json'),
      ],
      { cwd: target },
    );
    fs.writeFileSync(path.join(target, 'view.json'), JSON.stringify(view));
    fs.writeFileSync(path.join(target, 'context.json'), JSON.stringify(context));
    const runner = `import {readFile,writeFile} from 'node:fs/promises';import {renderReport} from './package/index.js';const view=JSON.parse(await readFile('./view.json','utf8'));const context=JSON.parse(await readFile('./context.json','utf8'));const forbidden=()=>{throw new Error('ambient clock/random/network forbidden');};Date.now=forbidden;Math.random=forbidden;globalThis.fetch=forbidden;crypto.randomUUID=forbidden;await writeFile('./report.html',await renderReport(view,context));`;
    fs.writeFileSync(path.join(target, 'consume.mjs'), runner);
    execFileSync(process.execPath, ['consume.mjs'], { cwd: target });
    const html = fs.readFileSync(path.join(target, 'report.html'), 'utf8');
    assert.match(html, /All 20 method requirements/u);
    assert.match(html, /All 25 category roles/u);
    assert.match(html, /All 58 supplied method facts/u);
    assert.match(html, /Renderer 3\.0\.0/u);
    assert.match(html, /<html lang="en-US" dir="ltr">/u);
    const oldView = JSON.parse(
      fs.readFileSync(path.join(root, 'tests/fixtures/study-report/view-v2.json'), 'utf8'),
    );
    fs.writeFileSync(path.join(target, 'old.json'), JSON.stringify(oldView));
    fs.writeFileSync(
      path.join(target, 'reject-old.mjs'),
      `import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {renderReport} from './package/index.js';await assert.rejects(renderReport(JSON.parse(await readFile('./old.json','utf8')),JSON.parse(await readFile('./context.json','utf8'))));`,
    );
    execFileSync(process.execPath, ['reject-old.mjs'], { cwd: target });
    for (const name of fs
      .readdirSync(installed)
      .filter((file) => file.endsWith('.js') || file.endsWith('.mjs'))) {
      const code = fs.readFileSync(path.join(installed, name), 'utf8');
      const source = ts.createSourceFile(
        name,
        code,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.JS,
      );
      assert.equal(source.parseDiagnostics.length, 0);
      const visit = (node) => {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier)
          assert.ok(
            node.moduleSpecifier.text.startsWith('./'),
            'Only contained module imports are allowed',
          );
        if (ts.isCallExpression(node)) {
          assert.notEqual(
            node.expression.kind,
            ts.SyntaxKind.ImportKeyword,
            'Dynamic runtime import is forbidden',
          );
          if (ts.isIdentifier(node.expression))
            assert.ok(!['fetch', 'require'].includes(node.expression.text));
        }
        if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression))
          assert.ok(!['process', 'Deno'].includes(node.expression.text));
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('archive entries are portable and reject traversal; release refuses a dirty tree', async () => {
  assert.throws(
    () => archiveFiles([['package/../escape', Buffer.from('bad')]]),
    /Invalid archive entry/u,
  );
  const bytes = archiveFiles([['package/test.txt', Buffer.from('x')]]);
  const tar = gunzipSync(bytes);
  assert.equal(tar.subarray(0, 16).toString().replaceAll('\0', ''), 'package/test.txt');
  assert.equal(tar.subarray(512, 513).toString(), 'x');
  const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  if (dirty) await assert.rejects(buildRenderer({ release: true }), /clean committed checkout/u);
});

test('retained renderer2 files remain exact original44da artifact bytes', () => {
  const dir = path.join(root, 'vendor/study-renderer/v2');
  const bytes = fs.readFileSync(path.join(dir, 'manifest.json'));
  assert.equal(sha(bytes), 'b0c9bdd08a25b9a4ac22acf135f013602970049851725a9e612fe9e23ef6a50b');
  const manifest = JSON.parse(bytes);
  assert.equal(manifest.sourceCommit, '44da4e489dde1f9bbc2ae5cce96912fc0860fa87');
  for (const file of manifest.files) {
    const content = fs.readFileSync(path.join(dir, file.path));
    assert.equal(content.length, file.byteSize);
    assert.equal(sha(content), file.sha256);
  }
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(dir, 'archive.json'))).sha256,
    'dfbc7aa817996457b2d9a1c5c9d511f39c132e1523f9d1421a3ff1d74c7805fe',
  );
});

test('immutable method component refuses altered producer bytes or fixture projections', () => {
  checkMethodProtocol();
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'study-method-protocol-'));
  try {
    const source = path.join(root, 'src/standalone/studyReport');
    for (const name of fs
      .readdirSync(source)
      .filter((name) => name.startsWith('methodProtocol') || name.startsWith('LICENSE.')))
      fs.copyFileSync(path.join(source, name), path.join(target, name));
    const fixture = path.join(root, 'tests/fixtures/study-report/view-v3.json');
    checkMethodProtocol(target, fixture);
    const file = path.join(target, 'methodProtocol.mjs'),
      original = fs.readFileSync(file);
    fs.appendFileSync(file, '\n');
    assert.throws(() => checkMethodProtocol(target, fixture), /producer file mismatch/u);
    fs.writeFileSync(file, original);
    const wrong = path.join(target, 'wrong.json');
    fs.writeFileSync(wrong, '{}');
    assert.throws(() => checkMethodProtocol(target, wrong), /fixture mismatch/u);
    fs.appendFileSync(path.join(target, 'methodProtocol.manifest.json'), '\n');
    assert.throws(() => checkMethodProtocol(target, fixture), /producer manifest mismatch/u);
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});
