# stencil-keystone compiler — design

**Date:** 2026-07-03
**Status:** Approved (design), pending implementation plan

## Goal

A minimal build-time compiler that transforms author-facing Stencil-style
components (decorators + JSX) into the compiled runtime shape the
`stencil-keystone` element runtime already consumes: setter-routed constructor
assignments, `baseConstructor(this)`, and a `proxyCustomElement(...)` +
`customElements.define(...)` tail.

It must run in three places from **one** implementation: the production bundler
(Rollup/Vite `build`), the `vitest` + `happy-dom` test environment, and any
end-user bundler that consumes the library.

## Non-goals

- No TypeScript type checker. Every transform is purely syntactic (decorators,
  class fields, method decorators). No `ts.Program`, no `getTypeChecker()`.
- No attribute reflection / `observedAttributes` / `attributeChangedCallback`.
  React owns props and sets them as JS properties; there is no HTML-attribute
  interactivity to serialize.
- No `@Element`, no `@Method` metadata collection (see `@Method` below).
- No CSS file IO or scoping in the compiler — styles arrive as a `string[]`
  expression in the `@Component` decorator and are forwarded verbatim.
- No React/Vue wrapper codegen. That is a separate downstream concern.

## Packaging

- Lives in `src/compiler/`, published under a separate export
  `stencil-keystone/compiler`.
- Core is a pure function:
  `transform(code: string, id: string, opts?): { code: string; map: string } | null`
  (returns `null` / early-returns for files with no `@Component`).
- Wrapped as a **Rollup-plugin-shaped object**:
  `{ name: 'keystone', enforce: 'pre', transform }`.
  - Vite (and therefore `vitest`) consumes Rollup plugins natively — no
    `unplugin`, no extra runtime deps. `unplugin` is only warranted later if a
    Webpack/Rspack consumer appears.
- Adds a **`typescript` devDependency**, reachable only from the `/compiler`
  entry. The runtime entry (`.`) stays zero-dependency.

## Compilation pipeline

Per file, `enforce: 'pre'` runs our transform before Vite/esbuild:

1. Our transform runs `ts.transpileModule` (no Program, no checker) with a
   single custom `before` transformer, emitting **plain JS** — types stripped,
   JSX lowered, decorators lowered.
2. Vite's subsequent esbuild pass is a harmless no-op (no JSX, no TS syntax
   remains).

### JSX — automatic runtime

Set `jsx: 'react-jsx'` (`'react-jsxdev'` in dev) and
`jsxImportSource: 'stencil-keystone'`. TypeScript auto-imports `jsx`/`jsxs`/
`Fragment` from `stencil-keystone/jsx-runtime` (and `jsxDEV` from
`stencil-keystone/jsx-dev-runtime`), which already exist. The compiler injects
**no** JSX imports itself. (Deliberately unlike upstream Stencil's classic
`jsxFactory: 'h'`, which never uses those runtime files.)

### Custom transformer (syntactic)

Acts only on classes decorated with `@Component`. Files without `@Component`
early-return untouched (so existing hand-written runtime tests are undisturbed).

| Decorator | Constraint | Compile action | Metadata | Injected import |
|---|---|---|---|---|
| `@Component({ name, styles })` | shadow-only; `name: string`, `styles: string[]` | extract `name` (string literal); forward the `styles` **expression** verbatim | `name` → arg1, `styles` → arg3 | `proxyCustomElement` |
| `@Prop()` | **no arguments** | `x = init` → `declare x` + ctor `this.x = init` (routes through the reactive setter) | name → `members[]` | — |
| `@State()` | **no arguments** | identical to `@Prop` (no runtime distinction) | name → `members[]` | — |
| `@Watch('p')` | takes the watched prop name | collect | `watched: { p: [methodName] }` | — |
| `@Event()` | **no arguments**; fixed `bubbles:false, composed:false` | drop the field; ctor-inject `this.x = createEvent(this, 'x')` | none | `createEvent` |
| `@Method()` | — | **strip the decorator only**; method stays on the prototype (native model, no lazy-load, so it is already callable on the element) | none | — |
| (all classes) | — | inject `baseConstructor(this)` as the first statement after `super()` (creating a constructor if absent) | — | `baseConstructor` |

Class tail emitted once per component:

```js
proxyCustomElement('x-foo', XFoo, /* styles expr */ [...], /* members */ ['a','b'], /* watched */ { p: ['onP'] });
customElements.define('x-foo', XFoo);
```

Omit trailing args that are empty (`members`/`watched`/`styles`) to keep output
small, matching `proxyCustomElement`'s positional-optional signature.

### Constructor assembly order

Within the (possibly synthesized) constructor, after `super()`:

1. `baseConstructor(this)` — registers the host ref before any reactive write.
2. `@Event` seeds: `this.x = createEvent(this, 'x')`.
3. `@Prop`/`@State` seeds: `this.p = <init>` (routes through the setter defined
   by `defineReactiveMembers`).

The event name is the property name **verbatim** (no kebab conversion).

## New runtime piece: `createEvent`

The runtime currently has no event support. Add a minimal emitter (its own
module under `src/element/`, exported from the runtime entry):

```ts
export const createEvent = <T>(ref: RenderHostRef, name: string) => ({
  emit: (detail?: T): CustomEvent<T> => {
    const ev = new CustomEvent(name, {
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

Fixed `bubbles:false, composed:false`; `cancelable:true`.

## Testing (approach A primary + minor B)

**A — compiler unit tests** (`test/compiler/*.spec.ts`): call the pure
`transform(source)` and assert the emitted code (snapshot + targeted
`toContain`). No DOM needed. Cases:

- `baseConstructor(this)` injected as first post-`super()` statement, including
  the synthesize-a-constructor case.
- `@Prop`/`@State`: field init moves to setter-routed ctor assignment; name in
  `members`; `@State` treated identically.
- `@Watch('p')`: entry in `watched`, decorator stripped, method preserved.
- `@Event()`: field replaced by `this.x = createEvent(this, 'x')`; `createEvent`
  imported; not in any metadata.
- `@Method()`: decorator stripped, method untouched, no metadata/import.
- `@Component({ name, styles })`: correct `name` arg, `styles` expression
  forwarded, `customElements.define` emitted.
- JSX automatic-runtime imports auto-injected; compiler adds none itself.
- Files without `@Component` pass through unchanged.

**B — integration** (1–2 real `.tsx` fixtures compiled by the plugin under
`vitest` + `happy-dom`): author a component with `@Prop`/`@Event`/`@Method`/JSX,
mount it, and assert reactivity, render output, and event dispatch end-to-end.
The keystone plugin is added to `vitest.config.ts` `plugins`; its early-return
on non-`@Component` files leaves the existing hand-compiled runtime tests
untouched.

## Open items deferred

- `@Method` name collection for downstream React/Vue imperative-handle codegen —
  revisit in the wrapper-generation work, not here.
