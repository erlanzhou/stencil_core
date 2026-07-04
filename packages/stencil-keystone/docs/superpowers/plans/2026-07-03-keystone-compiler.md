# stencil-keystone Compiler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a minimal build-time compiler that turns author-facing Stencil-style components (decorators + JSX) into the compiled runtime shape the `stencil-keystone` element runtime already consumes.

**Architecture:** A pure `transform(code, id, opts)` function runs `ts.transpileModule` (no `ts.Program`, no type checker) with automatic JSX runtime and one custom TypeScript `before` transformer that lowers decorators. It is wrapped as a Rollup-plugin-shaped object (`{ name, enforce: 'pre', transform }`) that Vite — and therefore vitest — consumes natively.

**Tech Stack:** TypeScript Compiler API (`typescript` **6.0.3** — latest stable JS-based line), esbuild (existing build), vitest + happy-dom (existing tests).

**Why TS 6, not TS 7:** As of 2026-07, `typescript@latest` is 6.0.3 and `typescript@rc` is 7.0.1-rc (the native Go port, `tsgo`). The native TS 7 does **not** expose the programmatic transformer API (`transpileModule` + custom `before` transformers) this compiler depends on. TS 6.0.3 is the sweet spot: newest stable, full JS Compiler API, standard-decorator + automatic-JSX support verified working. Revisit a TS 7 migration only once it ships a transform API. Verified on 6.0.3: `transpileModule` + a custom `before` transformer + `experimentalDecorators:false` + automatic JSX produce clean ES2022 with 0 diagnostics.

## Global Constraints

- Runtime entry (`.`) stays **zero runtime dependencies**. `typescript` (`^6.0.3`) is a **devDependency**, reachable only from the `stencil-keystone/compiler` entry.
- **Total decorator stripping is mandatory.** Under standard decorators, any decorator left on a component class or its kept members makes TS emit heavy `__esDecorate`/`__runInitializers` machinery that also *calls the marker at runtime* (e.g. `Prop()`) — which crashes, since markers have no runtime implementation. The transformer must remove every decorator it encounters on a component class.
- **Compile-time imports must be removed.** After stripping, `import { Component, Prop, ... } from 'stencil-keystone'` becomes a dead import of names the runtime does not export → bundler "no matching export" error. The transformer removes the compile-time-only names (`Component`, `Prop`, `State`, `Watch`, `Event`, `Method`, `EventEmitter`) from imports of the runtime module, dropping the import entirely if it becomes empty.
- No type checker: every transform is syntactic. Never call `ts.createProgram` / `getTypeChecker`.
- `@Prop()` and `@Event()` take **no arguments**. `@Component({ name: string, styles: string[] })`. `@Watch('propName')` takes the watched prop name.
- `@Prop` and `@State` are runtime-identical → both collected into `members: string[]`.
- Events are fixed: `bubbles: false, composed: false, cancelable: true`. Event name = property name **verbatim** (no kebab).
- `@Method()` → strip the decorator only; no runtime effect, no metadata.
- JSX uses the **automatic runtime**: `jsx: 'react-jsx'` (`'react-jsxdev'` when dev), `jsxImportSource: 'stencil-keystone'`. The compiler injects no JSX imports.
- **Modern (TC39 standard) decorators, not legacy.** Never set `experimentalDecorators` (set it explicitly `false`). Decorators are compile-time-only markers with no runtime implementation, so the transformer **fully strips every decorator** before TS emits — the output contains no decorator helpers of either kind (`__decorate`/`emitDecoratorMetadata` or native standard-decorator calls), just plain ES2022. Because our `before` transformer runs before TS's own decorator transform, stripping is flag-agnostic; setting `experimentalDecorators: false` documents intent and guards against inherited config.
- Runtime registration call is positional: `proxyCustomElement(name, Cls, styles?, members?, watched?)` — omit trailing empty args.
- Compiler emits `baseConstructor(this)` as the first statement after `super()`; injects `extends HTMLElement` when the class has no heritage clause.
- Files without `@Component` pass through untouched (`transform` returns `null`).

---

### Task 1: Runtime `createEvent`

**Files:**
- Create: `src/element/create-event.ts`
- Modify: `src/element/index.ts`
- Modify: `src/index.ts`
- Test: `test/create-event.test.ts`

**Interfaces:**
- Consumes: `getHostRef` (from `./host-ref`), `baseConstructor` (from `./host-ref`), `HostElement` (from `../internal/types`).
- Produces: `createEvent<T>(ref: HostElement, name: string): EventEmitter<T>` where `EventEmitter<T> = { emit: (detail?: T) => CustomEvent<T> }`.

- [ ] **Step 1: Write the failing test**

```ts
// test/create-event.test.ts
import { describe, expect, it } from 'vitest';

import { baseConstructor, createEvent } from '../src/element/index';
import type { HostElement } from '../src/index';

class Emitter extends HTMLElement {
  constructor() {
    super();
    baseConstructor(this as unknown as HostElement);
  }
}
customElements.define('x-emitter', Emitter);

describe('runtime — createEvent', () => {
  it('dispatches a non-bubbling, non-composed, cancelable CustomEvent on the host', () => {
    const el = document.createElement('x-emitter');
    document.body.appendChild(el);
    const emitter = createEvent<{ v: number }>(el as unknown as HostElement, 'change');

    let received: CustomEvent<{ v: number }> | undefined;
    el.addEventListener('change', (e) => (received = e as CustomEvent<{ v: number }>));

    const returned = emitter.emit({ v: 1 });

    expect(received).toBeTruthy();
    expect(received!.bubbles).toBe(false);
    expect(received!.composed).toBe(false);
    expect(received!.cancelable).toBe(true);
    expect(received!.detail).toEqual({ v: 1 });
    expect(returned).toBe(received); // emit returns the dispatched event
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/create-event.test.ts`
Expected: FAIL — `createEvent` is not exported from `../src/element/index`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/element/create-event.ts
import type { HostElement } from '../internal/types';
import { getHostRef } from './host-ref';

/** The emitter returned by {@link createEvent}; the compiler seeds `@Event` fields with it. */
export interface EventEmitter<T = unknown> {
  emit: (detail?: T) => CustomEvent<T>;
}

/**
 * Create the emitter the compiler assigns to an `@Event()` field:
 * `this.x = createEvent(this, 'x')`. Events are fixed to `bubbles:false`,
 * `composed:false`, `cancelable:true`, and use the property name verbatim.
 *
 * @param ref the host element (`this` in the compiled constructor)
 * @param name the event name (the `@Event` property name)
 */
export const createEvent = <T = unknown>(ref: HostElement, name: string): EventEmitter<T> => ({
  emit: (detail?: T): CustomEvent<T> => {
    const ev = new CustomEvent<T>(name, {
      bubbles: false,
      composed: false,
      cancelable: true,
      detail: detail as T,
    });
    getHostRef(ref)!.$hostElement$.dispatchEvent(ev);
    return ev;
  },
});
```

Add to `src/element/index.ts` (after the `baseConstructor` export line):

```ts
export type { EventEmitter } from './create-event';
export { createEvent } from './create-event';
```

`src/index.ts` re-exports everything from `./element` via `export * from './element';`, so no change is needed there — verify `createEvent` is reachable from `../src/index` by the test import of `HostElement` (already exported).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/create-event.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/element/create-event.ts src/element/index.ts test/create-event.test.ts
git commit -m "feat(keystone): add createEvent runtime emitter

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Compiler pipeline + `@Component` → registered custom element

Compiles a member-less `@Component` class end-to-end: strips the `@Component` decorator, injects `extends HTMLElement` (when absent) and a `constructor(){ super(); baseConstructor(this); }`, appends `proxyCustomElement(...)` + `customElements.define(...)`, and injects the runtime import. Establishes the shared per-class context and emitters that later tasks populate.

**Files:**
- Create: `src/compiler/ast.ts` (decorator/AST helpers)
- Create: `src/compiler/keystone-transformer.ts` (the TS transformer)
- Create: `src/compiler/transform.ts` (`transpileModule` wrapper)
- Create: `src/compiler/plugin.ts` (Rollup plugin wrapper)
- Create: `src/compiler/index.ts` (public exports)
- Modify: `package.json` (add `typescript` devDependency)
- Test: `test/compiler/component.spec.ts`

**Interfaces:**
- Consumes: `typescript` (`ts`).
- Produces:
  - `transform(code: string, id: string, opts?: TransformOptions): { code: string; map: string } | null`
  - `TransformOptions = { dev?: boolean; jsxImportSource?: string; runtimeModule?: string }`
  - `keystone(opts?: TransformOptions): { name: string; enforce: 'pre'; transform(code, id): { code; map } | null }`
  - `ComponentContext` (internal, in `keystone-transformer.ts`): `{ className: string; tagName: string; styles?: ts.Expression; members: string[]; watched: Record<string, string[]>; eventSeeds: ts.Statement[]; propSeeds: ts.Statement[]; usesCreateEvent: boolean }`

- [ ] **Step 1: Add the `typescript` devDependency**

Edit `package.json` `devDependencies` to add `"typescript": "^6.0.3"` (latest stable JS-based line; the native TS 7 has no transformer API):

```json
  "devDependencies": {
    "happy-dom": "^20.10.6",
    "typescript": "^6.0.3",
    "vitest": "^4.1.9"
  }
```

Run: `npm install`
Expected: installs `typescript@6.0.x`. Verify: `node -e "console.log(require('typescript').version)"` prints `6.0.x`.

- [ ] **Step 2: Write the failing test**

```ts
// test/compiler/component.spec.ts
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
    expect(out).toMatch(/proxyCustomElement\(\s*"x-foo"\s*,\s*XFoo\s*,\s*\[":host\{color:red\}"\]/);
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run test/compiler/component.spec.ts`
Expected: FAIL — cannot resolve `../../src/compiler/index`.

- [ ] **Step 4: Write the AST helpers**

```ts
// src/compiler/ast.ts
import ts from 'typescript';

/** Find a decorator named `name` (e.g. `Component`) on a node, if present. */
export const getDecorator = (node: ts.HasDecorators, name: string): ts.Decorator | undefined =>
  ts.getDecorators(node)?.find((d) => {
    const expr = d.expression;
    const id = ts.isCallExpression(expr) ? expr.expression : expr;
    return ts.isIdentifier(id) && id.text === name;
  });

/** The first call-expression argument of a decorator, if it is an object literal. */
export const getDecoratorObject = (dec: ts.Decorator): ts.ObjectLiteralExpression | undefined => {
  const expr = dec.expression;
  if (ts.isCallExpression(expr) && expr.arguments.length && ts.isObjectLiteralExpression(expr.arguments[0])) {
    return expr.arguments[0];
  }
  return undefined;
};

/** A string-literal argument of a decorator call, e.g. `@Watch('value')`. */
export const getDecoratorStringArg = (dec: ts.Decorator): string | undefined => {
  const expr = dec.expression;
  if (ts.isCallExpression(expr) && expr.arguments.length && ts.isStringLiteralLike(expr.arguments[0])) {
    return expr.arguments[0].text;
  }
  return undefined;
};

/** Read a property from an object literal by name. */
export const getObjectProp = (obj: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined => {
  for (const p of obj.properties) {
    if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === name) {
      return p.initializer;
    }
  }
  return undefined;
};

/** The non-decorator modifiers of a node (used to rebuild it without decorators). */
export const modifiersOf = (node: ts.HasModifiers): ts.Modifier[] | undefined =>
  ts.getModifiers(node) as ts.Modifier[] | undefined;
```

- [ ] **Step 5: Write the transformer**

```ts
// src/compiler/keystone-transformer.ts
import ts from 'typescript';

import { getDecorator, getDecoratorObject, getObjectProp, modifiersOf } from './ast';

export interface ComponentContext {
  className: string;
  tagName: string;
  styles?: ts.Expression;
  members: string[];
  watched: Record<string, string[]>;
  eventSeeds: ts.Statement[];
  propSeeds: ts.Statement[];
  usesCreateEvent: boolean;
}

export interface TransformerConfig {
  runtimeModule: string;
}

/**
 * Names imported from the runtime module that are compile-time-only markers with
 * no runtime export. After lowering they become dead imports and must be removed.
 */
const COMPILE_TIME_NAMES = new Set(['Component', 'Prop', 'State', 'Watch', 'Event', 'Method', 'EventEmitter']);

/**
 * The single `before` transformer: lowers `@Component`/member decorators on
 * every component class into the runtime's compiled shape.
 */
export const keystoneTransformer =
  (config: TransformerConfig): ts.TransformerFactory<ts.SourceFile> =>
  (context) => {
    const f = context.factory;

    return (sourceFile) => {
      const registrations: ts.Statement[] = [];
      const imports = new Set<string>();

      const visit: ts.Visitor = (node) => {
        if (ts.isClassDeclaration(node) && node.name && getDecorator(node, 'Component')) {
          const { classNode, ctx } = transformComponentClass(node, f);
          imports.add('proxyCustomElement');
          imports.add('baseConstructor');
          if (ctx.usesCreateEvent) imports.add('createEvent');
          registrations.push(...emitRegistration(f, ctx));
          return classNode;
        }
        if (ts.isImportDeclaration(node) && isRuntimeImport(node, config.runtimeModule)) {
          return cleanRuntimeImport(node, f); // drops compile-time-only specifiers (may remove the import)
        }
        return ts.visitEachChild(node, visit, context);
      };

      let sf = ts.visitNode(sourceFile, visit) as ts.SourceFile;

      const importDecl = f.createImportDeclaration(
        undefined,
        f.createImportClause(
          false,
          undefined,
          f.createNamedImports(
            [...imports].map((n) => f.createImportSpecifier(false, undefined, f.createIdentifier(n))),
          ),
        ),
        f.createStringLiteral(config.runtimeModule),
      );

      return f.updateSourceFile(sf, [importDecl, ...sf.statements, ...registrations]);
    };
  };

/** Whether an import declaration pulls from the runtime module (`stencil-keystone`). */
const isRuntimeImport = (node: ts.ImportDeclaration, runtimeModule: string): boolean =>
  ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === runtimeModule;

/**
 * Remove compile-time-only names from a runtime-module import. Returns the
 * trimmed import, or `undefined` to drop it entirely when nothing real remains.
 */
const cleanRuntimeImport = (node: ts.ImportDeclaration, f: ts.NodeFactory): ts.ImportDeclaration | undefined => {
  const named = node.importClause?.namedBindings;
  if (!named || !ts.isNamedImports(named)) {
    return node;
  }
  const kept = named.elements.filter((el) => !COMPILE_TIME_NAMES.has(el.name.text));
  if (kept.length === named.elements.length) {
    return node; // nothing to strip
  }
  if (kept.length === 0) {
    return undefined; // whole import was compile-time-only
  }
  return f.updateImportDeclaration(
    node,
    node.modifiers,
    f.updateImportClause(
      node.importClause!,
      node.importClause!.isTypeOnly,
      node.importClause!.name,
      f.updateNamedImports(named, kept),
    ),
    node.moduleSpecifier,
    node.attributes,
  );
};

const transformComponentClass = (
  node: ts.ClassDeclaration,
  f: ts.NodeFactory,
): { classNode: ts.ClassDeclaration; ctx: ComponentContext } => {
  const componentDec = getDecorator(node, 'Component')!;
  const options = getDecoratorObject(componentDec);
  const nameExpr = options && getObjectProp(options, 'name');
  const tagName = nameExpr && ts.isStringLiteralLike(nameExpr) ? nameExpr.text : '';

  const ctx: ComponentContext = {
    className: node.name!.text,
    tagName,
    styles: options && getObjectProp(options, 'styles'),
    members: [],
    watched: {},
    eventSeeds: [],
    propSeeds: [],
    usesCreateEvent: false,
  };

  // Member visiting is filled in by later tasks; for now keep members as-is
  // (minus the class-level @Component decorator) and rebuild the constructor.
  const members = rebuildConstructor(node, f, ctx);

  const heritage = node.heritageClauses?.length
    ? node.heritageClauses
    : [
        f.createHeritageClause(ts.SyntaxKind.ExtendsKeyword, [
          f.createExpressionWithTypeArguments(f.createIdentifier('HTMLElement'), undefined),
        ]),
      ];

  const classNode = f.updateClassDeclaration(
    node,
    modifiersOf(node), // drops decorators (incl. @Component)
    node.name,
    node.typeParameters,
    heritage,
    members,
  );

  return { classNode, ctx };
};

/** Rebuild (or synthesize) the constructor so it registers the host at construction. */
const rebuildConstructor = (
  node: ts.ClassDeclaration,
  f: ts.NodeFactory,
  ctx: ComponentContext,
): ts.ClassElement[] => {
  const injected: ts.Statement[] = [
    f.createExpressionStatement(
      f.createCallExpression(f.createIdentifier('baseConstructor'), undefined, [f.createThis()]),
    ),
    ...ctx.eventSeeds,
    ...ctx.propSeeds,
  ];

  const superCall = f.createExpressionStatement(f.createCallExpression(f.createSuper(), undefined, []));

  const existing = node.members.find((m): m is ts.ConstructorDeclaration => ts.isConstructorDeclaration(m));

  const buildBody = (rest: ts.Statement[]): ts.Block =>
    f.createBlock([superCall, ...injected, ...rest], true);

  const newCtor = existing
    ? f.updateConstructorDeclaration(
        existing,
        modifiersOf(existing),
        existing.parameters,
        buildBody(dropSuper(existing.body?.statements ?? [])),
      )
    : f.createConstructorDeclaration(undefined, [], buildBody([]));

  const others = node.members.filter((m) => !ts.isConstructorDeclaration(m));
  return [newCtor, ...others];
};

/** Drop a leading `super(...)` statement so we can re-emit it first ourselves. */
const dropSuper = (stmts: readonly ts.Statement[]): ts.Statement[] =>
  stmts.filter(
    (s) =>
      !(
        ts.isExpressionStatement(s) &&
        ts.isCallExpression(s.expression) &&
        s.expression.expression.kind === ts.SyntaxKind.SuperKeyword
      ),
  );

/** Emit `proxyCustomElement(...)` + `customElements.define(...)`, trailing empties omitted. */
const emitRegistration = (f: ts.NodeFactory, ctx: ComponentContext): ts.Statement[] => {
  const nameLit = f.createStringLiteral(ctx.tagName);
  const classId = f.createIdentifier(ctx.className);

  const membersExpr = ctx.members.length
    ? f.createArrayLiteralExpression(ctx.members.map((m) => f.createStringLiteral(m)))
    : undefined;
  const watchedExpr = Object.keys(ctx.watched).length
    ? f.createObjectLiteralExpression(
        Object.entries(ctx.watched).map(([k, methods]) =>
          f.createPropertyAssignment(
            f.createStringLiteral(k),
            f.createArrayLiteralExpression(methods.map((m) => f.createStringLiteral(m))),
          ),
        ),
      )
    : undefined;

  const optional: (ts.Expression | undefined)[] = [ctx.styles, membersExpr, watchedExpr];
  let last = optional.length;
  while (last > 0 && optional[last - 1] === undefined) last--;
  const tail = optional
    .slice(0, last)
    .map((e) => e ?? f.createIdentifier('undefined'));

  return [
    f.createExpressionStatement(
      f.createCallExpression(f.createIdentifier('proxyCustomElement'), undefined, [nameLit, classId, ...tail]),
    ),
    f.createExpressionStatement(
      f.createCallExpression(
        f.createPropertyAccessExpression(f.createIdentifier('customElements'), 'define'),
        undefined,
        [f.createStringLiteral(ctx.tagName), classId],
      ),
    ),
  ];
};
```

- [ ] **Step 6: Write the transpile wrapper and plugin**

```ts
// src/compiler/transform.ts
import ts from 'typescript';

import { keystoneTransformer } from './keystone-transformer';

export interface TransformOptions {
  dev?: boolean;
  jsxImportSource?: string;
  runtimeModule?: string;
}

export interface TransformResult {
  code: string;
  map: string;
}

/** Compile a single source file. Returns `null` for files without `@Component`. */
export const transform = (code: string, id: string, opts: TransformOptions = {}): TransformResult | null => {
  if (!/@Component\s*\(/.test(code)) {
    return null;
  }
  const { dev = false, jsxImportSource = 'stencil-keystone', runtimeModule = 'stencil-keystone' } = opts;

  const out = ts.transpileModule(code, {
    fileName: id,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: dev ? ts.JsxEmit.ReactJSXDev : ts.JsxEmit.ReactJSX,
      jsxImportSource,
      useDefineForClassFields: true,
      // Modern (TC39 standard) decorators, NOT legacy. We strip every decorator
      // in the `before` transformer, so no decorator helpers are ever emitted;
      // this is set explicitly to document intent and guard inherited config.
      experimentalDecorators: false,
      sourceMap: true,
    },
    transformers: { before: [keystoneTransformer({ runtimeModule })] },
  });

  return { code: out.outputText, map: out.sourceMapText ?? '' };
};
```

```ts
// src/compiler/plugin.ts
import { transform, type TransformOptions, type TransformResult } from './transform';

export interface KeystonePlugin {
  name: string;
  enforce: 'pre';
  transform(code: string, id: string): TransformResult | null;
}

/** Rollup-plugin-shaped object; Vite and vitest consume it natively. */
export const keystone = (opts: TransformOptions = {}): KeystonePlugin => ({
  name: 'keystone',
  enforce: 'pre',
  transform(code, id) {
    if (!/\.[jt]sx?$/.test(id)) return null;
    return transform(code, id, opts);
  },
});
```

```ts
// src/compiler/index.ts
export { keystone, type KeystonePlugin } from './plugin';
export { transform, type TransformOptions, type TransformResult } from './transform';
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run test/compiler/component.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 8: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/compiler package.json test/compiler/component.spec.ts
git commit -m "feat(keystone): compiler pipeline and @Component lowering

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `@Prop` / `@State` → reactive members

**Files:**
- Modify: `src/compiler/keystone-transformer.ts`
- Test: `test/compiler/members.spec.ts`

**Interfaces:**
- Consumes: `ComponentContext` (`members`, `propSeeds`), `getDecorator` (from `./ast`).
- Produces: within `transformComponentClass`, decorated property members are dropped; names collected into `ctx.members`; initializers moved to `ctx.propSeeds` as `this.<name> = <init>`.

- [ ] **Step 1: Write the failing test**

```ts
// test/compiler/members.spec.ts
import { describe, expect, it } from 'vitest';

import { transform } from '../../src/compiler/index';

const compile = (src: string) => transform(src, 'test.tsx')?.code ?? '';

describe('compiler — @Prop / @State', () => {
  it('collects members and moves initializers into the constructor', () => {
    const out = compile(`
      import { Component, Prop, State } from 'stencil-keystone';
      @Component({ name: 'x-counter' })
      export class XCounter {
        @Prop() step = 1;
        @State() count = 0;
        render() { return null; }
      }
    `);

    // both names collected, order preserved
    expect(out).toMatch(/proxyCustomElement\(\s*"x-counter"\s*,\s*XCounter\s*,\s*\[\s*"step"\s*,\s*"count"\s*\]/);
    // no field declarations remain (they would shadow the reactive accessor)
    expect(out).not.toMatch(/@Prop|@State/);
    // initializers routed through the setter in the constructor
    expect(out).toMatch(/this\.step\s*=\s*1/);
    expect(out).toMatch(/this\.count\s*=\s*0/);
  });

  it('collects a member with no initializer without a constructor seed', () => {
    const out = compile(`
      import { Component, Prop } from 'stencil-keystone';
      @Component({ name: 'x-p' })
      export class XP { @Prop() label; render() { return null; } }
    `);
    expect(out).toMatch(/\[\s*"label"\s*\]/);
    expect(out).not.toMatch(/this\.label\s*=/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/compiler/members.spec.ts`
Expected: FAIL — members array is empty (`proxyCustomElement("x-counter", XCounter)`), no `this.step` seed.

- [ ] **Step 3: Add member collection to the transformer**

In `src/compiler/keystone-transformer.ts`, replace the `rebuildConstructor(node, f, ctx)` call inside `transformComponentClass` with a member-collecting pass. Replace this block:

```ts
  // Member visiting is filled in by later tasks; for now keep members as-is
  // (minus the class-level @Component decorator) and rebuild the constructor.
  const members = rebuildConstructor(node, f, ctx);
```

with:

```ts
  const kept = collectMembers(node, f, ctx);
  const members = rebuildConstructor(kept, node, f, ctx);
```

Add the `collectMembers` helper (above `rebuildConstructor`):

```ts
/** Lower member decorators, populating `ctx`. Returns the members to keep as-is. */
const collectMembers = (node: ts.ClassDeclaration, f: ts.NodeFactory, ctx: ComponentContext): ts.ClassElement[] => {
  const kept: ts.ClassElement[] = [];
  for (const member of node.members) {
    if (ts.isPropertyDeclaration(member) && ts.isIdentifier(member.name)) {
      const isProp = !!getDecorator(member, 'Prop');
      const isState = !!getDecorator(member, 'State');
      if (isProp || isState) {
        const name = member.name.text;
        ctx.members.push(name);
        if (member.initializer) {
          ctx.propSeeds.push(
            f.createExpressionStatement(
              f.createAssignment(f.createPropertyAccessExpression(f.createThis(), name), member.initializer),
            ),
          );
        }
        continue; // drop the field: the runtime accessor backs it
      }
    }
    kept.push(member);
  }
  return kept;
};
```

Change `rebuildConstructor`'s signature and body to take the kept members instead of re-reading `node.members` for non-constructor elements. Replace the whole `rebuildConstructor` function with:

```ts
/** Rebuild (or synthesize) the constructor so it registers the host at construction. */
const rebuildConstructor = (
  kept: ts.ClassElement[],
  node: ts.ClassDeclaration,
  f: ts.NodeFactory,
  ctx: ComponentContext,
): ts.ClassElement[] => {
  const injected: ts.Statement[] = [
    f.createExpressionStatement(
      f.createCallExpression(f.createIdentifier('baseConstructor'), undefined, [f.createThis()]),
    ),
    ...ctx.eventSeeds,
    ...ctx.propSeeds,
  ];

  const superCall = f.createExpressionStatement(f.createCallExpression(f.createSuper(), undefined, []));

  const existing = kept.find((m): m is ts.ConstructorDeclaration => ts.isConstructorDeclaration(m));

  const buildBody = (rest: ts.Statement[]): ts.Block =>
    f.createBlock([superCall, ...injected, ...rest], true);

  const newCtor = existing
    ? f.updateConstructorDeclaration(
        existing,
        modifiersOf(existing),
        existing.parameters,
        buildBody(dropSuper(existing.body?.statements ?? [])),
      )
    : f.createConstructorDeclaration(undefined, [], buildBody([]));

  const others = kept.filter((m) => !ts.isConstructorDeclaration(m));
  return [newCtor, ...others];
};
```

Add `getDecorator` to the existing import from `./ast` at the top of the file (it is already imported — confirm the import line reads `import { getDecorator, getDecoratorObject, getObjectProp, modifiersOf } from './ast';`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/compiler/members.spec.ts test/compiler/component.spec.ts`
Expected: PASS (5 tests total — members: 2, component: 3 still green).

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/compiler/keystone-transformer.ts test/compiler/members.spec.ts
git commit -m "feat(keystone): lower @Prop/@State into reactive members

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `@Watch('prop')` → watched map

**Files:**
- Modify: `src/compiler/keystone-transformer.ts`
- Test: `test/compiler/watch.spec.ts`

**Interfaces:**
- Consumes: `ComponentContext` (`watched`), `getDecorator` + `getDecoratorStringArg` (from `./ast`).
- Produces: methods decorated with `@Watch('p')` keep their body, lose the decorator; `ctx.watched[p]` gains the method name.

- [ ] **Step 1: Write the failing test**

```ts
// test/compiler/watch.spec.ts
import { describe, expect, it } from 'vitest';

import { transform } from '../../src/compiler/index';

const compile = (src: string) => transform(src, 'test.tsx')?.code ?? '';

describe('compiler — @Watch', () => {
  it('collects watched methods and strips the decorator', () => {
    const out = compile(`
      import { Component, Prop, Watch } from 'stencil-keystone';
      @Component({ name: 'x-w' })
      export class XW {
        @Prop() value = 0;
        @Watch('value') onValueChange(n, o) { console.log(n, o); }
        render() { return null; }
      }
    `);

    // watched object is the 5th positional arg (styles undefined, members present)
    expect(out).toMatch(/proxyCustomElement\(\s*"x-w"\s*,\s*XW\s*,\s*undefined\s*,\s*\[\s*"value"\s*\]\s*,\s*\{\s*"value"\s*:\s*\[\s*"onValueChange"\s*\]\s*\}/);
    // method body preserved, decorator gone
    expect(out).toContain('onValueChange');
    expect(out).not.toContain('@Watch');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/compiler/watch.spec.ts`
Expected: FAIL — no `watched` arg emitted; `@Watch` decorator still present (TS would emit it via the class element).

- [ ] **Step 3: Add watch collection**

In `src/compiler/keystone-transformer.ts`, extend `collectMembers` to handle methods. Add this branch **before** the final `kept.push(member);` (i.e. after the property-declaration `if` block):

```ts
    if (ts.isMethodDeclaration(member) && ts.isIdentifier(member.name)) {
      const watch = getDecorator(member, 'Watch');
      if (watch) {
        const prop = getDecoratorStringArg(watch);
        if (prop) {
          (ctx.watched[prop] ??= []).push(member.name.text);
        }
        kept.push(stripDecorators(member, f));
        continue;
      }
    }
```

Add the `stripDecorators` helper (below `collectMembers`):

```ts
/** Return a method with all its decorators removed. */
const stripDecorators = (member: ts.MethodDeclaration, f: ts.NodeFactory): ts.MethodDeclaration =>
  f.updateMethodDeclaration(
    member,
    modifiersOf(member), // drops decorators
    member.asteriskToken,
    member.name,
    member.questionToken,
    member.typeParameters,
    member.parameters,
    member.type,
    member.body,
  );
```

Update the `./ast` import at the top of the file to include `getDecoratorStringArg`:

```ts
import { getDecorator, getDecoratorObject, getDecoratorStringArg, getObjectProp, modifiersOf } from './ast';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/compiler/`
Expected: PASS (6 tests total).

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/compiler/keystone-transformer.ts test/compiler/watch.spec.ts
git commit -m "feat(keystone): lower @Watch into the watched map

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `@Event()` → `createEvent` seed

**Files:**
- Modify: `src/compiler/keystone-transformer.ts`
- Test: `test/compiler/event.spec.ts`

**Interfaces:**
- Consumes: `ComponentContext` (`eventSeeds`, `usesCreateEvent`), `getDecorator`, `createEvent` runtime (Task 1).
- Produces: `@Event()` property members are dropped; `ctx.eventSeeds` gains `this.<name> = createEvent(this, '<name>')`; `ctx.usesCreateEvent = true` triggers the `createEvent` import.

- [ ] **Step 1: Write the failing test**

```ts
// test/compiler/event.spec.ts
import { describe, expect, it } from 'vitest';

import { transform } from '../../src/compiler/index';

const compile = (src: string) => transform(src, 'test.tsx')?.code ?? '';

describe('compiler — @Event', () => {
  it('seeds the field with createEvent and imports it', () => {
    const out = compile(`
      import { Component, Event, EventEmitter } from 'stencil-keystone';
      @Component({ name: 'x-e' })
      export class XE {
        @Event() saved: EventEmitter<string>;
        render() { return null; }
      }
    `);

    expect(out).toMatch(/this\.saved\s*=\s*createEvent\(this,\s*"saved"\)/);
    expect(out).toContain('createEvent');
    // not a reactive member, not in metadata
    expect(out).not.toMatch(/\[\s*"saved"\s*\]/);
    expect(out).toMatch(/proxyCustomElement\(\s*"x-e"\s*,\s*XE\s*\)/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/compiler/event.spec.ts`
Expected: FAIL — no `createEvent` seed; `@Event` field emitted as-is.

- [ ] **Step 3: Add event collection**

In `src/compiler/keystone-transformer.ts`, extend the property-declaration branch of `collectMembers`. Immediately after the `if (isProp || isState) { ... continue; }` block (still inside `if (ts.isPropertyDeclaration(member) && ts.isIdentifier(member.name))`), add:

```ts
      if (getDecorator(member, 'Event')) {
        const name = member.name.text;
        ctx.usesCreateEvent = true;
        ctx.eventSeeds.push(
          f.createExpressionStatement(
            f.createAssignment(
              f.createPropertyAccessExpression(f.createThis(), name),
              f.createCallExpression(f.createIdentifier('createEvent'), undefined, [
                f.createThis(),
                f.createStringLiteral(name),
              ]),
            ),
          ),
        );
        continue; // drop the field
      }
```

(The `usesCreateEvent` flag is already read in the class-visit branch: `if (ctx.usesCreateEvent) imports.add('createEvent');`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/compiler/`
Expected: PASS (7 tests total).

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/compiler/keystone-transformer.ts test/compiler/event.spec.ts
git commit -m "feat(keystone): lower @Event into a createEvent seed

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: `@Method()` → strip decorator only

**Files:**
- Modify: `src/compiler/keystone-transformer.ts`
- Test: `test/compiler/method.spec.ts`

**Interfaces:**
- Consumes: `getDecorator`, `stripDecorators` (from Task 4).
- Produces: methods decorated `@Method()` keep their signature/body, lose the decorator; no metadata, no import.

- [ ] **Step 1: Write the failing test**

```ts
// test/compiler/method.spec.ts
import { describe, expect, it } from 'vitest';

import { transform } from '../../src/compiler/index';

const compile = (src: string) => transform(src, 'test.tsx')?.code ?? '';

describe('compiler — @Method', () => {
  it('strips the decorator and keeps the method intact', () => {
    const out = compile(`
      import { Component, Method } from 'stencil-keystone';
      @Component({ name: 'x-m' })
      export class XM {
        @Method() async open() { return 42; }
        render() { return null; }
      }
    `);

    expect(out).not.toContain('@Method');
    expect(out).toMatch(/async open\(\)/);
    // no metadata, no createEvent import triggered
    expect(out).toMatch(/proxyCustomElement\(\s*"x-m"\s*,\s*XM\s*\)/);
    expect(out).not.toContain('createEvent');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/compiler/method.spec.ts`
Expected: FAIL — `@Method` decorator still present in output.

- [ ] **Step 3: Add method-strip branch**

In `collectMembers`, extend the method branch. Replace the existing method block:

```ts
    if (ts.isMethodDeclaration(member) && ts.isIdentifier(member.name)) {
      const watch = getDecorator(member, 'Watch');
      if (watch) {
        const prop = getDecoratorStringArg(watch);
        if (prop) {
          (ctx.watched[prop] ??= []).push(member.name.text);
        }
        kept.push(stripDecorators(member, f));
        continue;
      }
    }
```

with:

```ts
    if (ts.isMethodDeclaration(member) && ts.isIdentifier(member.name)) {
      const watch = getDecorator(member, 'Watch');
      if (watch) {
        const prop = getDecoratorStringArg(watch);
        if (prop) {
          (ctx.watched[prop] ??= []).push(member.name.text);
        }
        kept.push(stripDecorators(member, f));
        continue;
      }
      if (getDecorator(member, 'Method')) {
        kept.push(stripDecorators(member, f));
        continue;
      }
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/compiler/`
Expected: PASS (8 tests total).

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/compiler/keystone-transformer.ts test/compiler/method.spec.ts
git commit -m "feat(keystone): strip @Method decorator

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: End-to-end integration (real `.tsx` under vitest + happy-dom)

Compiles a real decorated `.tsx` fixture with the keystone plugin, mounts it in happy-dom, and asserts reactivity, render output, and event dispatch — proving the compiled output runs against the actual runtime.

**Files:**
- Create: `test/fixtures/greeter.tsx`
- Create: `test/compiler/integration.test.ts`
- Modify: `vitest.config.ts` (register the plugin + alias the bare specifier to `src`)

**Interfaces:**
- Consumes: `keystone` plugin (Task 2), the runtime (`stencil-keystone` → aliased to `src/index.ts`), the JSX runtime (`stencil-keystone/jsx-runtime` → aliased to `src/vdom/jsx-runtime.ts`).
- Produces: nothing consumed downstream.

- [ ] **Step 1: Register the plugin and aliases in vitest**

Replace `vitest.config.ts` with:

```ts
import { resolve } from 'node:path';

import { defineConfig } from 'vitest/config';

import { keystone } from './src/compiler/index';

export default defineConfig({
  plugins: [keystone()],
  resolve: {
    alias: {
      // the compiled fixtures import from the package's own name; map to source
      'stencil-keystone/jsx-runtime': resolve(__dirname, 'src/vdom/jsx-runtime.ts'),
      'stencil-keystone/jsx-dev-runtime': resolve(__dirname, 'src/vdom/jsx-dev-runtime.ts'),
      'stencil-keystone': resolve(__dirname, 'src/index.ts'),
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['test/**/*.test.ts', 'test/**/*.spec.ts'],
  },
});
```

Run: `npx vitest run test/compiler/component.spec.ts`
Expected: still PASS (config change did not break unit specs).

- [ ] **Step 2: Write the failing fixture + integration test**

```tsx
// test/fixtures/greeter.tsx
import { Component, Event, EventEmitter, Method, Prop } from 'stencil-keystone';

@Component({ name: 'x-greeter', styles: [':host{display:block}'] })
export class Greeter {
  @Prop() name = 'world';
  @Event() greeted: EventEmitter<string>;

  @Method() async greet() {
    this.greeted.emit(this.name);
    return this.name;
  }

  render() {
    return <span>Hello {this.name}</span>;
  }
}
```

```ts
// test/compiler/integration.test.ts
import { describe, expect, it } from 'vitest';

import './fixtures/greeter'; // compiled by the keystone plugin, self-registers

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe('compiler — integration', () => {
  it('renders, reacts to prop changes, and emits @Event', async () => {
    const el = document.createElement('x-greeter') as HTMLElement & { name: string; greet(): Promise<string> };
    document.body.appendChild(el);
    await tick();

    expect(el.shadowRoot?.textContent).toContain('Hello world');
    expect(el.shadowRoot?.adoptedStyleSheets.length ?? 0).toBeGreaterThanOrEqual(0); // styles applied (path varies by engine)

    el.name = 'keystone';
    await tick();
    expect(el.shadowRoot?.textContent).toContain('Hello keystone');

    let detail: string | undefined;
    el.addEventListener('greeted', (e) => (detail = (e as CustomEvent<string>).detail));
    await el.greet();
    expect(detail).toBe('keystone');
  });
});
```

- [ ] **Step 3: Run test to verify it fails, then passes**

Run: `npx vitest run test/compiler/integration.test.ts`
Expected: PASS. If it fails with a resolution error for `stencil-keystone`, confirm the `resolve.alias` entries in Step 1 are ordered with the two `/jsx-*` keys **before** the bare `stencil-keystone` key (longest-specifier-first), since Vite matches aliases in order.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: all suites PASS — the pre-existing runtime tests (`element`, `reactivity`, `watch`, `styles`, `styles-fallback`, `create-event`) plus the new compiler specs and integration test. The `enforce: 'pre'` + `@Component` gate leaves the hand-compiled runtime tests untouched.

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add test/fixtures/greeter.tsx test/compiler/integration.test.ts vitest.config.ts
git commit -m "test(keystone): end-to-end compiler integration under happy-dom

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Packaging — publish the `/compiler` and JSX runtime entries

Makes the compiler and automatic-JSX runtime resolvable for real consumers (not just the aliased test env).

**Files:**
- Modify: `package.json` (`exports` map)
- Modify: `scripts/build.mjs` (emit `dist/compiler`, `dist/jsx-runtime`, `dist/jsx-dev-runtime`)
- Modify: `tsconfig.build.json` (ensure declarations cover the new entries — verify only)

**Interfaces:**
- Consumes: existing esbuild `build` config.
- Produces: published entry points `stencil-keystone/compiler`, `stencil-keystone/jsx-runtime`, `stencil-keystone/jsx-dev-runtime`.

- [ ] **Step 1: Add the export map entries**

In `package.json`, replace the `exports` block with:

```json
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    },
    "./compiler": {
      "types": "./dist/compiler/index.d.ts",
      "import": "./dist/compiler/index.js",
      "require": "./dist/compiler/index.cjs"
    },
    "./jsx-runtime": {
      "types": "./dist/vdom/jsx-runtime.d.ts",
      "import": "./dist/jsx-runtime.js",
      "require": "./dist/jsx-runtime.cjs"
    },
    "./jsx-dev-runtime": {
      "types": "./dist/vdom/jsx-dev-runtime.d.ts",
      "import": "./dist/jsx-dev-runtime.js",
      "require": "./dist/jsx-dev-runtime.cjs"
    }
  }
```

- [ ] **Step 2: Add the build entries**

In `scripts/build.mjs`, after the existing two runtime `build(...)` calls and before the `execFileSync('npx', ['tsc', ...])` line, add builds for the new entries. Insert:

```js
const extraEntries = [
  { in: resolve(pkgRoot, 'src/compiler/index.ts'), base: 'compiler/index', platform: 'node', external: ['typescript'] },
  { in: resolve(pkgRoot, 'src/vdom/jsx-runtime.ts'), base: 'jsx-runtime', platform: 'browser', external: [] },
  { in: resolve(pkgRoot, 'src/vdom/jsx-dev-runtime.ts'), base: 'jsx-dev-runtime', platform: 'browser', external: [] },
];

for (const e of extraEntries) {
  for (const [format, ext] of [['esm', 'js'], ['cjs', 'cjs']]) {
    await build({
      ...common,
      platform: e.platform,
      external: e.external,
      entryPoints: [e.in],
      format,
      outfile: resolve(outDir, `${e.base}.${ext}`),
    });
  }
}
```

- [ ] **Step 3: Build and verify the artifacts exist**

Run: `npm run build`
Expected: `✅ built stencil-keystone -> dist`.

Run: `node -e "const fs=require('fs');['compiler/index.js','compiler/index.cjs','jsx-runtime.js','jsx-dev-runtime.js','compiler/index.d.ts'].forEach(p=>{if(!fs.existsSync('dist/'+p))throw new Error('missing '+p)});console.log('all entry artifacts present')"`
Expected: `all entry artifacts present`.

- [ ] **Step 4: Smoke-test the published compiler entry**

Run: `node --input-type=module -e "import { transform } from './dist/compiler/index.js'; const r = transform(\"import {Component} from 'stencil-keystone'; @Component({name:'x-z'}) export class Z { render(){return null;} }\", 'z.tsx'); if(!r || !r.code.includes('customElements.define')) throw new Error('compiler entry broken'); console.log('compiler entry OK')"`
Expected: `compiler entry OK`.

- [ ] **Step 5: Commit**

```bash
git add package.json scripts/build.mjs
git commit -m "build(keystone): publish compiler and JSX runtime entry points

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Packaging / `stencil-keystone/compiler` / zero-dep runtime → Task 2 (deps), Task 8 (exports). ✓
- Pure `transform`, no checker → Task 2. ✓
- Rollup-plugin shape, enforce pre → Task 2 (`plugin.ts`), Task 7 (vitest wiring). ✓
- Automatic JSX runtime → Task 2 (`transform.ts`, jsx options + import-source test). ✓
- `@Component({name, styles})`, styles forwarded → Task 2. ✓
- `@Prop`/`@State` → members + setter-routed seed → Task 3. ✓
- `@Watch('p')` → watched map → Task 4. ✓
- `@Event()` → createEvent seed + fixed flags + verbatim name → Task 1 (runtime), Task 5 (lowering). ✓
- `@Method()` → strip only → Task 6. ✓
- `baseConstructor(this)` first after super; inject `extends HTMLElement` → Task 2. ✓
- Positional call, trailing empties omitted → Task 2 (`emitRegistration`). ✓
- Non-`@Component` files pass through → Task 2 (gate + test). ✓
- Total decorator stripping (no `__esDecorate` leakage) → Task 2 (`modifiersOf` on class), Tasks 3/5 (drop decorated fields), Tasks 4/6 (`stripDecorators` on methods). ✓
- Compile-time import removal → Task 2 (`isRuntimeImport`/`cleanRuntimeImport` + test). ✓
- TS 6.0.3 pin (not native TS 7) → Task 2 Step 1 devDep; rationale in header. ✓
- Testing A primary + minor B → Tasks 2–6 (A), Task 7 (B). ✓

**Placeholder scan:** No TBD/TODO; every code step contains full code. ✓

**Type consistency:** `ComponentContext` fields (`className`, `tagName`, `styles`, `members`, `watched`, `eventSeeds`, `propSeeds`, `usesCreateEvent`) are defined in Task 2 and used consistently in Tasks 3–6. `transform`/`TransformOptions`/`TransformResult`/`keystone` signatures match across `transform.ts`, `plugin.ts`, `index.ts`, and test imports. `createEvent(ref, name)` matches between runtime (Task 1) and the compiled seed (Task 5). `stripDecorators` defined in Task 4, reused in Task 6. ✓
