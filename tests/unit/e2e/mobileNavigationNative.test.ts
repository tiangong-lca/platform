import {
  BROWSER_DEFINES,
  parse,
  validateCapture,
} from '../../../scripts/e2e/mobile-navigation-native.cjs';
import ts from '../../../scripts/typescript-native-parser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const state = () => ({
  navigationVisibleCount: 1,
  navigationOpenCount: 1,
  navigationMotionCount: 1,
  popupVisibleCount: 0,
  popupMotionCount: 0,
  popupClosingCount: 0,
  otherPopoverVisibleCount: 0,
  otherTooltipVisibleCount: 0,
  menuActionHovered: false,
  popupOpen: false,
  focus: 'navigation',
});
const capture = () => ({
  scenario: 'navigation-only',
  committed: true,
  overflow: false,
  openerConnected: true,
  restoredOpener: false,
  compositionEndCount: 0,
  collapseCalls: [true, false],
  events: [
    {
      key: 'escape',
      trusted: true,
      composing: false,
      recentCompositionEnd: false,
      elapsedMs: 100,
      ...state(),
    },
  ],
  ...state(),
});

describe('stateful native mobile control inert contract', () => {
  it('defaults to a plan and requires explicit unique execution arguments', () => {
    expect(parse(['--expected-head', 'a'.repeat(40)])).toEqual({
      '--expected-head': 'a'.repeat(40),
    });
    expect(parse(['--execute']).execute).toBe(true);
    expect(() => parse(['--execute', '--execute'])).toThrow('duplicate_execute');
    expect(() => parse(['--retry', '1'])).toThrow('invalid_argument');
  });

  it('accepts only fixed state/count/enum payloads', () => {
    const value = capture();
    expect(validateCapture(value)).toBe(value);
  });

  it('keeps only scalar build definitions and binds every omitted branding override', () => {
    expect(Object.isFrozen(BROWSER_DEFINES)).toBe(true);
    expect(Object.keys(BROWSER_DEFINES)).not.toContain('process.env');
    expect(BROWSER_DEFINES['process.env.NODE_ENV']).toBe('"production"');
    expect(BROWSER_DEFINES['process.env.APP_BRAND']).toBe('"tiangong"');
    const file = ts.createSourceFile(
      'branding.ts',
      fs.readFileSync(path.join(process.cwd(), 'config/branding.ts'), 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    expect(file.parseDiagnostics).toEqual([]);
    const referenced = new Set<string>();
    const visit = (node: any) => {
      if (ts.isPropertyAccessExpression(node) && /^process\.env\.APP_/u.test(node.getText(file)))
        referenced.add(node.getText(file));
      ts.forEachChild(node, visit);
    };
    visit(file);
    expect(referenced.size).toBe(5);
    expect(
      Object.keys(BROWSER_DEFINES)
        .filter((key) => key !== 'process.env.NODE_ENV' && key !== 'process.env.APP_BRAND')
        .sort(),
    ).toEqual([...referenced].sort());
    for (const key of referenced) expect(BROWSER_DEFINES[key]).toBe('undefined');
    for (const value of Object.values(BROWSER_DEFINES).filter((item) => item !== 'undefined'))
      expect(typeof JSON.parse(value)).toBe('string');
  });

  it('preserves the exact canonical hover/color prefix before native Enter', () => {
    const parseSource = (name: string, text: string) => {
      const file = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      expect(file.parseDiagnostics).toEqual([]);
      return file;
    };
    const canonical = parseSource(
      'original.ts',
      `async function original() {${fs.readFileSync(
        path.join(__dirname, 'fixtures/mobile-navigation-original-step.fixture'),
        'utf8',
      )}}`,
    );
    const native = parseSource(
      'native.cjs',
      fs.readFileSync(path.join(process.cwd(), 'scripts/e2e/mobile-navigation-native.cjs'), 'utf8'),
    );
    const prefix = (file: any) => {
      const declarations: any[] = [];
      const visit = (node: any) => {
        if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'backgroundBeforeHover')
          declarations.push(node);
        ts.forEachChild(node, visit);
      };
      visit(file);
      expect(declarations).toHaveLength(1);
      const statement = declarations[0].parent.parent;
      const statements = Array.from(statement.parent.statements);
      const index = statements.indexOf(statement);
      return statements.slice(index, index + 4);
    };
    const fingerprint = (node: any, file: any): any => {
      const children: any[] = [];
      ts.forEachChild(node, (child) => {
        children.push(fingerprint(child, file));
      });
      return [node.kind, ...(children.length ? children : [node.getText(file)])];
    };
    expect(prefix(native).map((node) => fingerprint(node, native))).toEqual(
      prefix(canonical).map((node) => fingerprint(node, canonical)),
    );
  });

  it('keeps the fixed French/dark control aligned with the canonical terminal order', () => {
    const values = (fileName: string, declaration: string, property: string) => {
      const file = ts.createSourceFile(
        fileName,
        fs.readFileSync(path.join(process.cwd(), fileName), 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );
      expect(file.parseDiagnostics).toEqual([]);
      const found: any[] = [];
      const visitProperties = (node: any) => {
        if (ts.isPropertyAssignment(node) && node.name.getText(file) === property)
          found.push(node.initializer);
        ts.forEachChild(node, visitProperties);
      };
      const visit = (node: any) => {
        if (ts.isVariableDeclaration(node) && node.name.getText(file) === declaration)
          visitProperties(node.initializer);
        else ts.forEachChild(node, visit);
      };
      visit(file);
      return found;
    };
    expect(
      values('src/services/general/localeRegistry.ts', 'LOCALE_REGISTRY', 'canonicalLocale').slice(
        -1,
      )[0].text,
    ).toBe('fr-FR');
    expect(
      values('tests/e2e/i18n/responsive-surface-registry.ts', 'RESPONSIVE_THEMES', 'dark').slice(
        -1,
      )[0].kind,
    ).toBe(ts.SyntaxKind.TrueKeyword);
  });

  it.each([
    (value: any) => {
      value.url = 'private';
    },
    (value: any) => {
      value.events[0].text = 'private';
    },
    (value: any) => {
      value.events[0].focus = 'private';
    },
    (value: any) => {
      value.navigationVisibleCount = 33;
    },
    (value: any) => {
      value.events[0].elapsedMs = 300001;
    },
    (value: any) => {
      value.events = Array(33).fill(value.events[0]);
    },
    (value: any) => {
      value.collapseCalls.push('private');
    },
    (value: any) => {
      value.compositionEndCount = 33;
    },
    (value: any) => {
      value.overflow = true;
    },
    (value: any) => {
      Object.defineProperty(value, 'toJSON', { value: () => 'private' });
    },
    (value: any) => {
      Object.defineProperty(value.events[0], 'focus', { get: () => 'private', enumerable: true });
    },
  ])('rejects unexpected content and exceeded caps (%#)', (mutate) => {
    const value = capture();
    mutate(value);
    expect(() => validateCapture(value)).toThrow();
  });
});
