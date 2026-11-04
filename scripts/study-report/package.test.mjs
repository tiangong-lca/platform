import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { archiveFiles, buildRenderer } from './build.mjs';
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
    assert.equal(pkg.version, '2.0.0');
    assert.equal(pkg.version, manifest.rendererVersion);
    assert.equal(pkg.dependencies, undefined);
    assert.equal(pkg.devDependencies, undefined);
    assert.equal(pkg.scripts, undefined);
    assert.equal(pkg.exports['.'].import, './index.js');
    const view = JSON.parse(
      fs.readFileSync(path.join(root, 'tests/fixtures/study-report/view-v2.json'), 'utf8'),
    );
    const context = JSON.parse(
      fs.readFileSync(path.join(root, 'tests/fixtures/study-report/context-v1.json'), 'utf8'),
    );
    fs.writeFileSync(path.join(target, 'view.json'), JSON.stringify(view));
    fs.writeFileSync(path.join(target, 'context.json'), JSON.stringify(context));
    const runner = `import {readFile,writeFile} from 'node:fs/promises';import {renderReport} from './package/index.js';const view=JSON.parse(await readFile('./view.json','utf8'));const context=JSON.parse(await readFile('./context.json','utf8'));await writeFile('./report.html',await renderReport(view,context));`;
    fs.writeFileSync(path.join(target, 'consume.mjs'), runner);
    execFileSync(process.execPath, ['consume.mjs'], { cwd: target });
    const html = fs.readFileSync(path.join(target, 'report.html'), 'utf8');
    assert.match(html, /1092\.8/u);
    assert.match(html, /5e-324/u);
    assert.match(html, /Unknown/u);
    assert.match(html, /<html lang="en-US" dir="ltr">/u);
    const advanced = JSON.parse(
      fs.readFileSync(path.join(root, 'tests/fixtures/study-report/view-advanced-v2.json'), 'utf8'),
    );
    const legacy = JSON.parse(
      fs.readFileSync(path.join(root, 'tests/fixtures/study-report/view-v1.json'), 'utf8'),
    );
    fs.writeFileSync(path.join(target, 'advanced.json'), JSON.stringify(advanced));
    fs.writeFileSync(path.join(target, 'legacy.json'), JSON.stringify(legacy));
    fs.writeFileSync(
      path.join(target, 'consume-advanced.mjs'),
      `import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';import {renderReport,validateReportView} from './package/index.js';const context=JSON.parse(await readFile('./context.json','utf8'));const legacy=JSON.parse(await readFile('./legacy.json','utf8'));assert.equal(validateReportView(legacy,'1.0.0'),legacy);await assert.rejects(renderReport(legacy,context),/version/u);await writeFile('./advanced.html',await renderReport(JSON.parse(await readFile('./advanced.json','utf8')),context));`,
    );
    execFileSync(process.execPath, ['consume-advanced.mjs'], { cwd: target });
    const advancedHtml = fs.readFileSync(path.join(target, 'advanced.html'), 'utf8');
    assert.match(advancedHtml, /No LCIA method/u);
    assert.doesNotMatch(advancedHtml, /activity or inventory fact/u);
    assert.match(advancedHtml, /819\.6/u);
    assert.match(advancedHtml, /baseline value is zero/u);
    assert.match(advancedHtml, /No numeric value/u);
    assert.match(advancedHtml, /Reason codes: zero_baseline_relative_undefined/u);
    for (const name of fs.readdirSync(installed).filter((file) => file.endsWith('.js'))) {
      const code = fs.readFileSync(path.join(installed, name), 'utf8');
      assert.doesNotMatch(
        code,
        /(?:from\s*['"](?:node:|https?:|@|umi|react|zod)|\bprocess\.|\bDeno\.|\bfetch\(|\bimport\()/u,
      );
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
