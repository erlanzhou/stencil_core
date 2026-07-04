import { describe, expect, it } from 'vitest';

import { transform } from '../../src/compiler/index';

const compile = (src: string) => transform(src, 'test.tsx')?.code ?? '';

const wrap = (render: string, tag = 'x-a', className = 'XA') =>
  `import { Component } from 'stencil-keystone';
   @Component({ name: '${tag}' })
   export class ${className} { render() { ${render} } }`;

describe('compiler — automatic key insertion', () => {
  it('keys every static element in traversal order with "^" + base62 sequence', () => {
    const out = compile(wrap('return <div><span>hi</span></div>;'));
    // outer <div> keyed first (^a), nested <span> next (^b) — key is the 3rd jsx() arg
    expect(out).toMatch(/['"]\^a['"]/);
    expect(out).toMatch(/['"]\^b['"]/);
  });

  it('does not overwrite an author key, and such an element consumes no sequence slot', () => {
    const out = compile(wrap('return <div key="mine"><span>hi</span></div>;'));
    expect(out).toMatch(/['"]mine['"]/); // author key preserved
    expect(out).toMatch(/['"]\^a['"]/); // the <span> is the first auto key
    expect(out).not.toMatch(/['"]\^b['"]/); // the keyed <div> did not consume ^a
  });

  it('adds no keys when render has multiple return statements', () => {
    const out = compile(wrap('if (true) { return <div/>; } return <span/>;'));
    expect(out).not.toMatch(/['"]\^a['"]/);
  });

  it('does not key JSX inside a call-expression argument (e.g. .map)', () => {
    const out = compile(wrap('return <ul>{[1, 2].map((i) => <li>{i}</li>)}</ul>;'));
    expect(out).toMatch(/['"]\^a['"]/); // the <ul>
    expect(out).not.toMatch(/['"]\^b['"]/); // the mapped <li> is left unkeyed
  });

  it('does not key JSX inside a ternary', () => {
    const out = compile(wrap('return <div>{true ? <a/> : <b/>}</div>;'));
    expect(out).toMatch(/['"]\^a['"]/); // the <div>
    expect(out).not.toMatch(/['"]\^b['"]/); // ternary branches left unkeyed
  });

  it('resets the sequence per component (each component starts at ^a)', () => {
    const out = compile(`import { Component } from 'stencil-keystone';
      @Component({ name: 'x-one' }) export class One { render() { return <div/>; } }
      @Component({ name: 'x-two' }) export class Two { render() { return <span/>; } }`);
    const occurrences = out.match(/['"]\^a['"]/g) ?? [];
    expect(occurrences.length).toBe(2);
  });
});
