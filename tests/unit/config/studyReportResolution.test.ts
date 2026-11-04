import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import appConfig from '../../../config/config';

jest.mock('@umijs/max', () => ({ defineConfig: (value: unknown) => value }));
jest.mock('../../../config/supabaseEnv', () => ({ applySupabaseFrontendEnv: jest.fn() }));

it('resolves portable ESM specifiers to SPA TypeScript without replacing retained JavaScript', async () => {
  const set = jest.fn();
  appConfig.chainWebpack!({ resolve: { set } } as never, {} as never);
  const resolveOptions = { extensionAlias: set.mock.calls[0][1] };
  // Exercise the actual already-installed Webpack resolver, without compiling or writing files.
  const rootRequire = createRequire(path.resolve('package.json'));
  const maxRequire = createRequire(rootRequire.resolve('@umijs/max/package.json'));
  const umiRequire = createRequire(maxRequire.resolve('umi/package.json'));
  const { webpack } = umiRequire('@umijs/bundler-webpack/compiled/webpack');
  const compiler = webpack({
    mode: 'none',
    target: 'web',
    entry: path.resolve('src/pages/Study/preview.ts'),
    resolve: resolveOptions,
  });
  try {
    const resolver = compiler.resolverFactory.get('normal', { ...resolveOptions, fileSystem: fs });
    const resolve = (directory: string, request: string) =>
      new Promise<string>((yes, no) => {
        resolver.resolve(
          {},
          path.resolve(directory),
          request,
          {},
          (error: Error | null, result: string) => (error ? no(error) : yes(result)),
        );
      });
    expect(await resolve('src/standalone/studyReport', './methodContent.js')).toBe(
      path.resolve('src/standalone/studyReport/methodContent.ts'),
    );
    expect(await resolve('vendor/study-renderer/v2', './content.js')).toBe(
      path.resolve('vendor/study-renderer/v2/content.js'),
    );
  } finally {
    await new Promise<void>((yes, no) => {
      compiler.close((error: Error | null) => (error ? no(error) : yes()));
    });
  }
});
