import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { checkDocumentLanguage } from './document-language.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Fixed ustar metadata keeps the archive reproducible across supported build hosts. */
export function archiveFiles(files) {
  const chunks = [];
  for (const [name, bytes] of files) {
    if (!/^package\/[A-Za-z0-9._/-]{1,90}$/u.test(name) || name.includes('..')) {
      throw new Error('Invalid archive entry');
    }
    const header = Buffer.alloc(512);
    header.write(name);
    const octal = (value, start, length) => {
      header.write(value.toString(8).padStart(length - 1, '0') + '\0', start, length);
    };
    octal(0o644, 100, 8);
    octal(0, 108, 8);
    octal(0, 116, 8);
    octal(bytes.length, 124, 12);
    octal(0, 136, 12);
    header.fill(32, 148, 156);
    header.write('0', 156);
    header.write('ustar\0', 257);
    header.write('00', 263);
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
    chunks.push(header, bytes, Buffer.alloc((512 - (bytes.length % 512)) % 512));
  }
  const archive = gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]), { level: 9 });
  archive[9] = 255; // gzip OS=unknown: do not bind archive bytes to the build host.
  return archive;
}

export async function buildRenderer({ release = false } = {}) {
  await checkDocumentLanguage();
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  const sourceDirty = Boolean(
    execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], {
      cwd: root,
      encoding: 'utf8',
    }).trim(),
  );
  if (release && sourceDirty)
    throw new Error('Release renderer requires a clean committed checkout');
  const output = path.join(root, 'dist-study-report');
  fs.rmSync(output, { recursive: true, force: true });
  execFileSync(
    process.execPath,
    ['node_modules/typescript/bin/tsc', '-p', 'scripts/study-report/tsconfig.json'],
    { cwd: root, stdio: 'inherit' },
  );
  const dir = path.join(output, 'package');
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify(
      {
        name: '@tiangong-lca/study-report-renderer',
        version: '1.0.0',
        type: 'module',
        description: 'Dependency-free frozen LCA Study report view',
        license: 'MIT',
        exports: {
          '.': { types: './index.d.ts', import: './index.js' },
          './view': { types: './viewModel.d.ts', import: './viewModel.js' },
          './manifest.json': './manifest.json',
        },
        files: ['*.js', '*.d.ts', '*.css', 'manifest.json', 'README.md', 'LICENSE'],
      },
      null,
      2,
    ) + '\n',
  );
  const module = await import(
    pathToFileURL(path.join(dir, 'index.js')).href + '?build=' + Date.now()
  );
  fs.writeFileSync(path.join(dir, 'browser-runtime.js'), module.BROWSER_SCRIPT);
  fs.writeFileSync(path.join(dir, 'styles.css'), module.REPORT_CSS);
  fs.writeFileSync(
    path.join(dir, 'README.md'),
    '# Study report renderer\n\nIndependent ESM and browser resources. renderReport(view, context) returns deterministic self-contained HTML using Web Crypto and no network access. view/context are strictly validated. No keys, receipts, authorization or numerical algorithms are supplied. Verify the independently obtained release manifest/archive identity before consumption. A local build or embedded manifest is not release trust.\n',
  );
  fs.copyFileSync(path.join(root, 'LICENSE'), path.join(dir, 'LICENSE'));
  const files = fs
    .readdirSync(dir)
    .sort()
    .map((name) => {
      const bytes = fs.readFileSync(path.join(dir, name));
      return { path: name, byteSize: bytes.length, sha256: digest(bytes) };
    });
  const sourcePaths = ['src/standalone/studyReport', 'scripts/study-report'];
  const sourceFiles = sourcePaths.flatMap((prefix) =>
    fs
      .readdirSync(path.join(root, prefix))
      .sort()
      .map((name) => `${prefix}/${name}`),
  );
  const sourceDigest = createHash('sha256');
  for (const file of sourceFiles)
    sourceDigest.update(file + '\0').update(fs.readFileSync(path.join(root, file)));
  const manifest = {
    schemaVersion: 'lca.study-renderer-package.v1',
    rendererVersion: module.RENDERER_VERSION,
    viewModelVersion: module.VIEW_SCHEMA,
    sourceCommit,
    sourceDirty,
    sourceDigest: sourceDigest.digest('hex'),
    files,
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'manifest.json'), manifestBytes);
  const archiveName = 'study-report-renderer-1.0.0.tgz';
  const archive = archiveFiles(
    [
      ...files.map((file) => [file.path, fs.readFileSync(path.join(dir, file.path))]),
      ['manifest.json', manifestBytes],
    ]
      .sort(([a], [b]) => a.localeCompare(b, 'en'))
      .map(([name, bytes]) => ['package/' + name, bytes]),
  );
  fs.writeFileSync(path.join(output, archiveName), archive);
  fs.writeFileSync(
    path.join(output, 'archive.json'),
    JSON.stringify(
      {
        schemaVersion: 'lca.study-renderer-archive.v1',
        archiveName,
        byteSize: archive.length,
        sha256: digest(archive),
        manifestSha256: digest(manifestBytes),
        sourceCommit,
        sourceDirty,
      },
      null,
      2,
    ) + '\n',
  );
  return { output, manifest, archiveName };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildRenderer({ release: process.argv.includes('--release') });
  console.log(
    `Renderer ${result.manifest.rendererVersion}: ${path.relative(root, result.output)}/${result.archiveName}; sourceDirty=${result.manifest.sourceDirty}`,
  );
}
