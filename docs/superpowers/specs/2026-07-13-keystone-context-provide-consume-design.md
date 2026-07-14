# Design: `stencil-keystone/context` — internalized `@Provide` / `@Consume`

**Date:** 2026-07-13
**Status:** Approved (design), pending spec review
**Scope:** Port the W3C Context Protocol (`@Provide` / `@Consume` and its machinery) from
`byted-web-components-copy/packages/ui-next/core/src/framework/runtime-context` into
`stencil-keystone`, decoupled from `@stencil/core`.

## Motivation

The component library (`ui-next/core`) owns a `runtime-context` module — a fork of Google's
`@lit/context` (BSD-3 headers intact) with ByteDance extensions — that still imports from
`@stencil/core` (`getElement`, `forceUpdate`, `ComponentInterface`). `stencil-keystone` is the
standalone, `@stencil/core`-free runtime that the library targets. To let the library drop its
Stencil dependency, keystone must natively own the context protocol, exactly as it already owns
`@Prop` / `@State` / `@Event` / `@Method` / `@Watch` / `@Controllable`.

## Decisions (locked)

1. **Runtime port, not compiler-integrated.** `@Provide` / `@Consume` stay plain legacy runtime
   decorators. keystone's transformer already leaves unrecognized decorators for TS to lower
   (`experimentalDecorators`), so **no `keystone-transformer` change is required**.
2. **New export subpath `stencil-keystone/context`** (4th alongside `.`, `./compiler`,
   `./jsx-runtime`, `./jsx-dev-runtime`). Keeps the protocol opt-in and out of the core bundle.
3. **`path` supports deep paths via one-line `reduce`, function-form dropped.** See below.

## Reference vs. Lit vs. keystone port

The reference is a fork of `@lit/context`. The port keeps 3 intentional ByteDance extensions and
omits 1 Lit feature. Each is evidence-backed against real component usage.

| Aspect | Lit `@lit/context` | keystone port | Rationale |
| --- | --- | --- | --- |
| `createContext<V,K>(key)` | ✓ | identical | — |
| Decorator casing | `@provide` / `@consume` (lower) | **`@Provide` / `@Consume` (Pascal)** | keystone's own decorators are all PascalCase; components already author PascalCase. Consistency > matching Lit. |
| `@Provide` options | `{ context }` | `{ context, callback? }` | `callback` used by `ks-form`, `ks-form-item`, `ks-form-list` to dispatch a `context-change` DOM event on every set. |
| `@Consume` options | `{ context, subscribe? }` | `{ context, subscribe?, path? }` | `path` used by ~a dozen components for sub-value subscription narrowing. |
| `ContextRoot` | ✓ (buffers late providers) | **omitted** | Reference never had it; components rely on provider-before-consumer mount + `onProviderRequest` re-parenting. YAGNI. Recorded as a known limitation. |
| Event `contextTarget` member | ✓ (newer Lit) | omitted; use `composedPath()[0]` | Matches reference; simpler. |
| `setValue(v, force)`, bubbling+composed events | ✓ | identical | — |

## The three de-couplings from `@stencil/core`

| reference (`@stencil/core`) | keystone port |
| --- | --- |
| `getElement(this)` | `this` — keystone is **eager**, the instance *is* the element |
| `forceUpdate(host)` | `import { forceUpdate } from '../element'` (`forceUpdate(elm)`) |
| `ComponentInterface` (type only) | local `ContextHost` interface (`connectedCallback?` / `disconnectedCallback?`), no runtime import |

## Module layout (`src/context/`)

```
create-context.ts        createContext, Context<K,V>, ContextType             (pure, no deps)
context-request-event.ts ContextRequestEvent, ContextCallback, ContextRequest (pure)
value-notifier.ts        ValueNotifier<T> + inlined get(); path: string[]     (pure)
context-provider.ts      ContextProvider (extends ValueNotifier); ContextProviderEvent
context-consumer.ts      ContextConsumer (uses keystone forceUpdate)
provide.ts               @Provide
consume.ts               @Consume
index.ts                 public re-exports
```

### `path` — final form (simplest, deep-capable)

`path` is `string[] | undefined` throughout `ValueNotifier`, `ContextConsumer`, and `@Consume`.
Deep traversal via a single `reduce`; no `es-toolkit`, keeping keystone's zero-runtime-dep record:

```ts
const get = (o: unknown, p: string[]): unknown =>
  p.reduce<unknown>((a, k) => (a == null ? undefined : (a as Record<string, unknown>)[k]), o);
```

- Handles single-level (`['disabled']` → `ctx.disabled`) and deep (`['a','b']` → `ctx.a.b`).
- **Dropped from the reference:** the `typeof path === 'function'` branch, its
  `Promise<() => string[]>` type, and the `__propsReady` await. Verified: **zero** components use
  a function-form path anywhere in the repo. Components' own `__propsReady` fields are unrelated
  and keep working — the port simply never references `__propsReady`.

### Public API (authoring unchanged from the reference)

```ts
import { createContext, Provide, Consume } from 'stencil-keystone/context';

export const FormContext = createContext<FormContextValue>('form-context');

@Provide({ context: FormContext, callback: (instance) => { /* ... */ } })
private context: FormContextValue = { /* ... */ };

@Consume({ context: FormContext, subscribe: true, path: ['disabled'] })
private disabled?: boolean;
```

Also exported (as in Lit/reference): `ContextProvider`, `ContextConsumer`, `ContextRequestEvent`,
and types `Context`, `ContextType`, `ContextCallback`.

## Lifecycle composition (the one real risk)

Both `proxyCustomElement` (runs in the component's static block) and `@Provide` / `@Consume`
wrap `connectedCallback` / `disconnectedCallback` by capture-original-then-call. Legacy property
decorators apply **after** the static block, so a decorator's wrapper is outermost:

```
@Provide.connectedCallback  →  proxy.connectedCallback  →  user.connectedCallback
```

Order is correct: the provider/consumer controller is created and `hostConnected()` fires, then
the proxy schedules the first render. Disconnect unwinds symmetrically. A cross-shadow-boundary
provide+consume test pins this down (see Testing).

## Fidelity call-outs

- **Fix:** reference `@Provide` does `this['controller'] = controller`, clobbering any real
  `controller` field. Dropped — the `WeakMap<HTMLElement, ContextProvider>` already tracks it.
- **Fix:** reference descriptor-branch setter does `controllerMap.get(this)!.setValue(v)` with a
  non-null assertion that throws if the prop is set before connect (framework wrappers set props
  pre-mount). Routed through the same pending-value path as the no-descriptor branch.
- **Keep:** `onProviderRequest` re-parenting (`context-provider` event → re-dispatch
  subscriptions) — nested providers of the same context depend on it.

## Packaging

- `package.json` `exports`: add
  `"./context": { "types": "./dist/context/index.d.ts", "import": "./dist/context/index.js", "require": "./dist/context/index.cjs" }`.
- `scripts/build.mjs` `extraEntries`: add
  `{ in: 'src/context/index.ts', base: 'context/index', platform: 'browser', external: [] }`.
- `.d.ts` is emitted by the whole-tree `tsc -p tsconfig.build.json` pass — no manual declaration.

## Testing (`test/context/`)

Vitest + happy-dom, following existing `test/element.test.ts` style (real custom elements).

1. Provider → consumer one-shot delivery (`subscribe: false`).
2. `subscribe: true` re-delivers on `setValue`; `Object.is`-unchanged sets do **not** re-notify.
3. `path` narrows both the change-trigger and the delivered value; deep two-level path.
4. Nested same-context providers: inner provider re-parents subscriptions (`onProviderRequest`).
5. Consumer re-renders via keystone `forceUpdate` when its context value changes.
6. Self-exclusion: an element that both provides and consumes the same context does not satisfy
   its own request.
7. `disconnectedCallback` unsubscribes (no callback after disconnect).
8. Lifecycle composition: `@Provide` + proxy `connectedCallback` compose in the right order.

## Out of scope (follow-ups, not this change)

- **`ks-asset-tile` latent bug** (component repo): its `@Consume({ path: ['value','disabled'] })`
  targets a context whose `value` is a primitive, so deep-get yields `undefined` and never
  updates. The port implements correct context semantics; the component fixes its own path. Not
  touched here.
- **`ContextRoot`** — not ported (see table). Add only if a real late-provider ordering need
  appears.
- Wiring `ui-next/core` to import from `stencil-keystone/context` — a separate migration in the
  component repo.
