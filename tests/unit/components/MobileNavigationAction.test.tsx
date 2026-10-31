import { renderMobileNavigationAction } from '@/components/MobileNavigationAction';
import { fireEvent, render, screen } from '@testing-library/react';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import ts from '../../../scripts/typescript-native-parser.mjs';

describe('product mobile native navigation action', () => {
  it('retains native button identity, markup and header-scoped bridge before fallback', () => {
    const order: string[] = [];
    const fallback = jest.fn(() => order.push('fallback'));
    const action = renderMobileNavigationAction('Navigation Mode', {
      collapsed: true,
      onCollapse: fallback,
    });
    expect(action.type).toBe('button');
    expect(action.key).toBe('mobile-navigation');
    render(
      <>
        <span className='ant-pro-global-header-collapsed-button' onClick={fallback} />
        <div data-testid='pro-layout-global-header'>
          <span
            className='ant-pro-global-header-collapsed-button'
            onClick={() => order.push('native')}
          />
          {action}
        </div>
      </>,
    );
    const button = screen.getByRole('button', { name: 'Navigation Mode' });
    expect(button).toHaveClass('tg-pro-layout-mobile-menu-action');
    expect(button).toHaveAttribute('type', 'button');
    expect(button).not.toHaveAttribute('aria-expanded');
    expect(button.querySelector('[aria-hidden]')).toBeInTheDocument();
    fireEvent.click(button);
    expect(order).toEqual(['native']);
    expect(fallback).not.toHaveBeenCalled();
  });

  it.each([true, false, undefined])('preserves fallback negation for collapsed=%p', (collapsed) => {
    const onCollapse = jest.fn();
    render(renderMobileNavigationAction('Navigation Mode', { collapsed, onCollapse }));
    fireEvent.click(screen.getByRole('button', { name: 'Navigation Mode' }));
    expect(onCollapse).toHaveBeenCalledTimes(1);
    expect(onCollapse).toHaveBeenCalledWith(!collapsed);
  });

  it('retains missing-trigger and omitted-callback behavior inside the header', () => {
    render(
      <div data-testid='pro-layout-global-header'>
        {renderMobileNavigationAction('Navigation Mode', {})}
      </div>,
    );
    expect(() => fireEvent.click(screen.getByRole('button'))).not.toThrow();
  });

  it('preserves the exact failed e98 JSX AST with only the label argument substituted', () => {
    const originalText = fs.readFileSync(
      path.join(__dirname, 'fixtures/mobile-navigation-original-action.fixture'),
      'utf8',
    );
    // Independent fixture identity: original button expression from e98d1d631d9895c49f0d6c02bed39206ac28df77.
    expect(createHash('sha256').update(originalText).digest('hex')).toBe(
      '3e52db9fd023bace25f73fb2a218ee810ca6f26cce9121504078d009cfb7c806',
    );
    const parse = (name: string, text: string) => {
      const file = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      expect(file.parseDiagnostics).toEqual([]);
      return file;
    };
    const original = parse('original.tsx', `const original = (${originalText});`);
    const extracted = parse(
      'extracted.tsx',
      fs.readFileSync(
        path.join(process.cwd(), 'src/components/MobileNavigationAction/index.tsx'),
        'utf8',
      ),
    );
    const app = parse('app.tsx', fs.readFileSync(path.join(process.cwd(), 'src/app.tsx'), 'utf8'));
    const find = (file: any, predicate: (node: any) => boolean): any[] => {
      const found: any[] = [];
      const visit = (node: any) => {
        if (predicate(node)) found.push(node);
        ts.forEachChild(node, visit);
      };
      visit(file);
      return found;
    };
    const button = (file: any) => {
      const nodes = find(
        file,
        (node) => ts.isJsxElement(node) && node.openingElement.tagName.getText(file) === 'button',
      );
      expect(nodes).toHaveLength(1);
      return nodes[0];
    };
    const label = (node: any) => ts.isJsxAttribute(node) && node.name.getText() === 'aria-label';
    const fingerprint = (node: any, file: any, replaceLabel = false): any => {
      if (replaceLabel && label(node)) return ['label-substitution'];
      const children: any[] = [];
      ts.forEachChild(node, (child) => {
        children.push(fingerprint(child, file, replaceLabel));
      });
      return [node.kind, ...(children.length ? children : [node.getText(file)])];
    };
    expect(fingerprint(button(extracted), extracted, true)).toEqual(
      fingerprint(button(original), original, true),
    );
    const originalLabel = find(original, label)[0].initializer.expression;
    const calls = find(
      app,
      (node) =>
        ts.isCallExpression(node) &&
        node.expression.getText(app) === 'renderMobileNavigationAction',
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].arguments).toHaveLength(2);
    expect(fingerprint(calls[0].arguments[0], app)).toEqual(fingerprint(originalLabel, original));
    expect(calls[0].arguments[1].getText(app)).toBe('headerProps');
    expect(calls[0].parent.expression.getText(app)).toBe('actions.unshift');
    expect(calls[0].parent.parent.parent.parent.expression.getText(app)).toBe(
      'headerProps.isMobile',
    );
  });
});
