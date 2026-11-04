import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

it.each([
  [
    'v6',
    '003deb096baa38b7ff6cb5474815ea0eb92bb4c6d188bb6c27f81448026d0427',
    'c322ec2d018dcd0cbb66549ecbddfbe8b10dc59b',
  ],
  [
    'v2',
    '0cfe9a2d3c957a005a6b8045b3f8df0cea9b3e852af7a49f706e3b35a798b0c1',
    '439f8112a8f9945479c63ffaa8cfe688e9d20216',
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

it('retains exact a33 request/response interface bytes through the corrected c322 facade and retained reader declarations', () => {
  const root = path.resolve(process.cwd(), 'vendor/study-contract/v6');
  for (const [name, hash] of [
    ['request.schema.json', '7da790012370d5e15c8ecbb33a81af1a1c0c4c493c09481c50c4ef6a278aa95b'],
    ['response.schema.json', 'f5c4a752be1429aba6a9890c5fd71e4f63f6ee6eb2c70a160f001601aa4ae1c3'],
  ])
    expect(
      createHash('sha256')
        .update(fs.readFileSync(path.join(root, name)))
        .digest('hex'),
    ).toBe(hash);
});
