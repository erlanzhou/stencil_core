import { describe, expect, it } from 'vitest';

import { transform } from '../../src/compiler/index';

const compile = (src: string) => transform(src, 'test.tsx')?.code ?? '';

describe('compiler — decorator provenance + name validation', () => {
  it('ignores a @Component imported from another module (returns null)', () => {
    const src = `import { Component } from '@angular/core';\n@Component({ selector: 'app-x' }) export class AppX {}`;
    expect(transform(src, 'a.tsx')).toBeNull();
  });

  it('ignores a @Component( mention in a comment (returns null)', () => {
    expect(transform('// see @Component() docs\nexport const x = 1;', 'x.ts')).toBeNull();
  });

  it('ignores a @Component( mention inside a string literal (returns null)', () => {
    expect(transform('export const doc = "use @Component() like this";', 'y.ts')).toBeNull();
  });

  it('lowers an aliased Component import', () => {
    const out = compile(`
      import { Component as C } from 'stencil-keystone';
      @C({ name: 'x-al' })
      export class Al { render() { return null; } }
    `);
    expect(out).toContain('customElements.define("x-al", Al)');
    expect(out).toContain('extends HTMLElement');
  });

  it('throws a clear error when @Component has no "name"', () => {
    const src = `import { Component } from 'stencil-keystone';\n@Component({}) export class B { render() { return null; } }`;
    expect(() => transform(src, 'b.tsx')).toThrow(/string-literal "name"/);
  });

  it('throws a clear error when @Component name is not a string literal', () => {
    const src = `import { Component } from 'stencil-keystone';\nconst T = 'x-c';\n@Component({ name: T }) export class C { render() { return null; } }`;
    expect(() => transform(src, 'c.tsx')).toThrow(/string-literal "name"/);
  });
});
