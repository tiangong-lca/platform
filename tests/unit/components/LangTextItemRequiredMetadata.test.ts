import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from '../../../scripts/typescript-native-parser.mjs';

function walk(node: any, visitor: (node: any) => void) {
  if (!node) return;
  visitor(node);
  ts.forEachChild(node, (child) => walk(child, visitor));
}

const parsedFiles = new Map<string, ReturnType<typeof ts.createSourceFile>>();
function parse(filename: string, source: string) {
  let file = parsedFiles.get(filename);
  if (!file) {
    file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    assert.deepEqual(file.parseDiagnostics, []);
    parsedFiles.set(filename, file);
  }
  return file;
}

function isLanguageInput(node: any, file: ReturnType<typeof ts.createSourceFile>) {
  return (
    (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
    node.tagName.getText(file) === 'LangTextItemForm'
  );
}

function unwrap(expression: any): any {
  if (ts.isParenthesizedExpression(expression)) return unwrap(expression.expression);
  if (
    ts.isBinaryExpression(expression) &&
    expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
  ) {
    return unwrap(expression.left);
  }
  return expression;
}

function resolveSchemaRules(expression: any, schemas: Record<string, unknown>) {
  let argument = unwrap(expression);
  const keys: string[] = [];
  while (ts.isElementAccessExpression(argument)) {
    const key = argument.argumentExpression;
    if (!ts.isStringLiteral(key) && !ts.isNumericLiteral(key)) {
      throw new Error('Required language metadata must reference a static schema path.');
    }
    keys.unshift(key.text);
    argument = unwrap(argument.expression);
  }
  return {
    keys,
    rules: keys.reduce((value: any, key) => value?.[key], schemas[argument.text]) as any[],
  };
}

const callers = [
  'src/components/AllTeams/form.tsx',
  'src/pages/Teams/index.tsx',
  'src/pages/Contacts/Components/form.tsx',
  'src/pages/Flowproperties/Components/form.tsx',
  'src/pages/Flows/Components/form.tsx',
  'src/pages/Flows/Components/Property/create.tsx',
  'src/pages/Flows/Components/Property/edit.tsx',
  'src/pages/LifeCycleModels/Components/form.tsx',
  'src/pages/Processes/Components/form.tsx',
  'src/pages/Processes/Components/Exchange/create.tsx',
  'src/pages/Processes/Components/Exchange/edit.tsx',
  'src/pages/Processes/Components/Review/form.tsx',
  'src/pages/Review/Components/ReviewForm/form.tsx',
  'src/pages/Sources/Components/form.tsx',
  'src/pages/Unitgroups/Components/form.tsx',
  'src/pages/Unitgroups/Components/Unit/create.tsx',
  'src/pages/Unitgroups/Components/Unit/edit.tsx',
];

it('covers every runtime language-input caller and excludes commented examples', () => {
  const actual: string[] = [];
  for (const filename of fs.readdirSync('src', { recursive: true, encoding: 'utf8' })) {
    if (!filename.endsWith('.tsx') || filename.split(path.sep)[0].startsWith('.umi')) continue;
    const fullPath = path.join('src', filename);
    const source = fs.readFileSync(fullPath, 'utf8');
    if (!source.includes('import LangTextItemForm')) continue;
    let runtimeCaller = false;
    const file = parse(fullPath, source);
    walk(file, (node) => {
      if (isLanguageInput(node, file)) {
        runtimeCaller = true;
      }
    });
    if (runtimeCaller) actual.push(fullPath);
  }
  expect(actual.sort()).toEqual([...callers].sort());
});

it.each(callers)('keeps language expansion tied to the owning required rules in %s', (filename) => {
  const source = fs.readFileSync(path.resolve(filename), 'utf8');
  const ast = parse(filename, source);
  const schemas: Record<string, unknown> = {};
  walk(ast, (node) => {
    if (
      !ts.isImportDeclaration(node) ||
      !ts.isStringLiteral(node.moduleSpecifier) ||
      !node.moduleSpecifier.text.endsWith('.json')
    )
      return;
    const specifier = node.moduleSpecifier.text;
    const importPath = specifier.startsWith('@/')
      ? path.resolve('src', specifier.slice(2))
      : path.resolve(path.dirname(filename), specifier);
    schemas[node.importClause!.name!.text] = JSON.parse(fs.readFileSync(importPath, 'utf8'));
  });

  const missingMetadata: { filename: string; line: number }[] = [];
  const metadataFacts: {
    field: string;
    independentOfValidation: boolean;
    usesOwningRules: boolean;
    predicate: string;
    schemaProperty: string | undefined;
    schemaField: string | undefined;
    schemaRequired: boolean;
    result: unknown;
  }[] = [];

  walk(ast, (node) => {
    if (!isLanguageInput(node, ast)) return;
    const attributes = node.attributes.properties;
    const attribute = (name: string) =>
      attributes.find(
        (candidate: any) => ts.isJsxAttribute(candidate) && candidate.name.getText(ast) === name,
      );
    const metadata = attribute('autoExpandRequired');
    const rules = attribute('rules');
    const requiredRuleSources: string[] = [];
    walk(rules, (child) => {
      if (!ts.isCallExpression(child) || child.expression.getText(ast) !== 'getRules') return;
      const { rules: schemaRules } = resolveSchemaRules(child.arguments[0], schemas);
      if (schemaRules.some((rule: any) => rule.required)) {
        requiredRuleSources.push(child.arguments[0].getText(ast));
      }
    });
    const rulesSource = rules?.getText(ast) ?? '';
    if (requiredRuleSources.length > 0 && rulesSource.includes('showRules') && !metadata) {
      missingMetadata.push({
        filename,
        line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1,
      });
    }
    if (metadata) {
      const expression = metadata.initializer.expression;
      const metadataSource = expression.getText(ast);
      const fieldName = attribute('name').initializer.expression;
      const lastField = ts.isArrayLiteralExpression(fieldName)
        ? fieldName.elements[fieldName.elements.length - 1]
        : fieldName;
      if (!ts.isStringLiteral(lastField)) {
        throw new Error('Required language metadata must identify its field name.');
      }
      const lastFieldSegment = lastField.text;
      // Require an actual schema-rules predicate, not blanket field expansion.
      assert(ts.isCallExpression(expression), 'Required metadata must call a schema predicate.');
      assert(
        ts.isPropertyAccessExpression(expression.expression),
        'Required metadata must use schema rules.',
      );
      const { keys, rules: metadataRules } = resolveSchemaRules(
        expression.expression.expression,
        schemas,
      );

      // Execute the display expression against the real owning JSON schemas.
      const value = new Function(...Object.keys(schemas), `return (${metadataSource});`)(
        ...Object.values(schemas),
      );
      metadataFacts.push({
        field: lastFieldSegment,
        independentOfValidation: !metadataSource.includes('showRules'),
        usesOwningRules: requiredRuleSources.every((owningRules) =>
          metadataSource.replace(/\s+/g, '').includes(owningRules.replace(/\s+/g, '')),
        ),
        predicate: expression.expression.name.text,
        schemaProperty: keys[keys.length - 1],
        schemaField: keys[keys.length - 2],
        schemaRequired: metadataRules.some((rule: any) => rule.required),
        result: value,
      });
    }
  });
  expect(missingMetadata).toEqual([]);
  expect(metadataFacts).toEqual(
    metadataFacts.map(({ field }) => ({
      field,
      independentOfValidation: true,
      usesOwningRules: true,
      predicate: 'some',
      schemaProperty: 'rules',
      schemaField: field,
      schemaRequired: true,
      result: true,
    })),
  );
});
