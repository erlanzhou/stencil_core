import { describe, expect, it } from 'vitest';

import { transform } from '../../src/compiler/index';

const compile = (src: string) => transform(src, 'test.tsx')?.code ?? '';

describe('compiler — @Component', () => {
  it('returns null for files without @Component', () => {
    expect(transform('export const x = 1;', 'plain.ts')).toBeNull();
  });

  it('compiles a member-less component into a registered custom element', () => {
    const out = compile(`
      import { Component } from 'stencil-keystone';
      @Component({ name: 'x-foo', styles: [':host{color:red}'] })
      export class XFoo {
        render() { return null; }
      }
    `);

    // @Component decorator removed
    expect(out).not.toContain('@Component');
    // heritage + construction-time registration
    expect(out).toContain('extends HTMLElement');
    expect(out).toMatch(/constructor\(\)\s*{[\s\S]*super\(\)[\s\S]*baseConstructor\(this\)/);
    // registration tail, styles forwarded as arg 3
    expect(out).toMatch(/proxyCustomElement\(\s*"x-foo"\s*,\s*this\s*,\s*\[":host\{color:red\}"\]/);
    expect(out).toMatch(/customElements\.define\(\s*"x-foo"\s*,\s*XFoo\s*\)/);
    // runtime import injected
    expect(out).toContain('proxyCustomElement');
    expect(out).toContain('baseConstructor');
    expect(out).toContain('stencil-keystone');
    // the compile-time-only decorator import is removed (would be a dead import
    // of names the runtime does not export)
    expect(out).not.toMatch(/import\s*\{[^}]*\bComponent\b[^}]*\}\s*from\s*["']stencil-keystone["']/);
  });

  it('lowers JSX through the automatic runtime import source', () => {
    const out = compile(`
      import { Component } from 'stencil-keystone';
      @Component({ name: 'x-jsx' })
      export class XJsx { render() { return <span>hi</span>; } }
    `);
    // automatic runtime auto-imports jsx from "<source>/jsx-runtime"
    expect(out).toContain('stencil-keystone/jsx-runtime');
    expect(out).not.toContain('<span>');
  });
});
