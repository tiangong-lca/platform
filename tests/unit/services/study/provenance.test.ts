import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

it.each([
  [
    'v2',
    '6bdde9dcad10f2bfc474dd70f0bf3deb693cb7536137ef827a71fb879d792459',
    'c8784576377b4ab156e89dc4eac81014a87880f6',
  ],
  [
    'v3',
    '983e4b9941e735e060dca3222d16c41018510def509615c94beaa79816e1a960',
    'c8784576377b4ab156e89dc4eac81014a87880f6',
  ],
  [
    'v4',
    'a590d3aa43fadf1693670af62d89b148953d7ac2e3ef82b2a5f39e33e03173dc',
    '7b545b0951fbf869eff6536b6c8e5be102e8d7bc',
  ],
  [
    'v5',
    '3eea620ab4041f1a6fcfab34bd2afd275f8cbd3cbcf56ba6a187076e9bb3cf94',
    '5b27e2e1fe05e3ff7c3a89f1aa59e8c84f244aff',
  ],
])(
  'retains exact Edge-owned %s manifest, source and every original artifact byte',
  (version, hash, source) => {
    const root = path.resolve(process.cwd(), 'vendor/study-contract', version);
    const bytes = fs.readFileSync(path.join(root, 'manifest.json'));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(hash);
    const manifest = JSON.parse(bytes.toString());
    expect(manifest.sourceCommit).toBe(source);
    expect(manifest.sourceRepository).toBe('tiangong-lca/edge-functions');
    expect(manifest.sourceStatus).toBe('committed');
    for (const file of manifest.files) {
      const bytes = fs.readFileSync(path.join(root, file.path));
      expect(bytes.byteLength).toBe(file.byteSize ?? file.bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256);
    }
    expect(fs.readFileSync(path.join(root, 'index.d.mts'), 'utf8')).toContain(
      'export * from "./index.js";',
    );
  },
);
