import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from '../../../scripts/typescript-native-parser.mjs';

// Immutable 632d1d204aaa test lines215-221. The host wrapper may surround
// these statements; it may not add another stimulus or change their AST.
const historical = `async function original() {
  await batch.getByRole('row').filter({ hasText: 'Raw material' }).getByRole('checkbox').check();
  await batch.getByRole('button', { name: 'Add product allocation', exact: true }).click();
  await batch.getByRole('combobox', { name: 'Target product' }).click();
  await page.getByText('Product B (#2)', { exact: true }).last().click();
  await batch.getByRole('spinbutton').fill('100');
  await batch.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(batch).toBeHidden();
}`;
const parse = (name: string, text: string) => {
  const file = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  expect(file.parseDiagnostics).toEqual([]);
  return file;
};
const fingerprint = (node: any, file: any): any => {
  const children: any[] = [];
  ts.forEachChild(node, (child) => {
    children.push(fingerprint(child, file));
  });
  return [node.kind, ...(children.length ? children : [node.getText(file)])];
};

it('preserves original seven statements and keeps the complete spec unchanged outside the explicit wrapper', () => {
  const original = parse('historical.ts', historical);
  const source = fs.readFileSync(
    path.join(process.cwd(), 'tests/e2e/i18n/process-allocation.spec.ts'),
    'utf8',
  );
  const current = parse('current.ts', source);
  const calls: any[] = [];
  const visit = (node: any) => {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(current) === 'withBatchAllocationDiagnostics'
    )
      calls.push(node);
    ts.forEachChild(node, visit);
  };
  visit(current);
  expect(calls).toHaveLength(1);
  const statements = calls[0].arguments[4].body.statements;
  expect(Array.from(statements).map((node) => fingerprint(node, current))).toEqual(
    Array.from((original.statements[0] as any).body.statements).map((node) =>
      fingerprint(node, original),
    ),
  );
  expect(calls[0].arguments.slice(0, 4).map((node: any) => node.getText(current))).toEqual([
    'page',
    'batch',
    'testInfo',
    'browserName',
  ]);
  // Root-level original declaration and lifecycle remain one test; wrapper adds
  // no test declaration, timeout, readiness condition, skip or retry.
  const declarations: any[] = [];
  const findTests = (node: any) => {
    if (ts.isCallExpression(node) && node.expression.getText(current) === 'test')
      declarations.push(node);
    ts.forEachChild(node, findTests);
  };
  findTests(current);
  expect(declarations).toHaveLength(1);
  expect(source).not.toMatch(
    /test\.(?:only|fixme)|setTimeout|retries|\.blur\(|\.press\(|\.hover\(/u,
  );
  expect(statements).toHaveLength(7);
  expect(source.indexOf('await waitForDialogReady(batch)')).toBeLessThan(calls[0].pos);
  expect(source.indexOf("name: 'Save', exact: true")).toBeGreaterThan(calls[0].end);
  const normalized = (node: any): any => {
    const children: any[] = [];
    ts.forEachChild(node, (child: any) => {
      if (
        ts.isImportDeclaration(child) &&
        (child.moduleSpecifier as any).text === './batch-allocation-observer'
      )
        return;
      if (ts.isParameter(child) && child.name?.getText(current) === 'testInfo') return;
      if (ts.isBindingElement(child) && child.name?.getText(current) === 'browserName') return;
      if (
        ts.isExpressionStatement(child) &&
        ts.isAwaitExpression(child.expression) &&
        ts.isCallExpression(child.expression.expression) &&
        child.expression.expression.expression.getText(current) === 'withBatchAllocationDiagnostics'
      ) {
        for (const statement of (child.expression.expression.arguments[4] as any).body.statements)
          children.push(normalized(statement));
      } else children.push(normalized(child));
    });
    return [node.kind, ...(children.length ? children : [node.getText(current)])];
  };
  // Digest independently computed from the entire immutable historical AST,
  // using the repository parser, before adding this diagnostic envelope.
  expect(
    crypto
      .createHash('sha256')
      .update(JSON.stringify(normalized(current)))
      .digest('hex'),
  ).toBe('9e11d5a41a8d65b07d283ddd5ab5616842529e06e97481aa54a946cb9969ed45');
});

it('preserves pinned canonical configuration and records the actual historical source identity', () => {
  const bytes = fs.readFileSync(path.join(process.cwd(), 'playwright.config.ts'));
  expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(
    'dc5d984e455918a06a88e7acc2ee358cd41b1365f97d3b6d62532ef90c6da7be',
  );
  const text = bytes.toString();
  for (const contract of [
    'const expectTimeout = authenticatedRun ? 45_000 : 15_000',
    'retries: releaseRun ? 0',
    'timeout: 120_000',
    'actionTimeout: 20_000',
    'navigationTimeout: 45_000',
  ])
    expect(text).toContain(contract);
});
