# stencil-keystone

A standalone client-side VDOM render kernel, originally extracted from Stencil's
runtime internals and now **fully independent of `@stencil/core`** — it owns its
own types and has no runtime or type dependency on Stencil.

The web component is the source of truth in the surrounding component library;
this kernel is the client-side runtime that creates VNodes and patches them into
a (shadow) DOM. Framework wrappers (React, Vue2) sit above it.

## Scope

- VNode creation (`h`, `newVNode`, `Host`)
- JSX runtimes (`jsx`, `jsxs`, `jsxDEV`)
- DOM patching (`renderVdom`, `patch`, `isSameVnode`)
- Element attribute/prop patching (`updateElement`, `setAccessor`)
- Lightweight container render API (`render`)

## Public entrypoint

```ts
import { h, render } from 'stencil-keystone';
```

## Build

```bash
cd packages/stencil-keystone
npm run build
```

Build output is written to `packages/stencil-keystone/dist`.

## VNode shape

VNodes keep the historical `$name$` field convention, but the type is now owned
locally (`src/internal/types.ts`) rather than imported from Stencil:

- `$tag$`, `$text$`, `$elm$`, `$children$`, `$attrs$`, `$key$`
- `$isHost$: boolean` — marks the single root (`<Host>`) node so `setAccessor`
  reflects its members as attributes. (This replaced the former numeric
  `$flags$` bitmask; the slot-projection flags were dropped along with Stencil's
  SSR/hydration coupling.)
- `key` and `ref` behavior
- `renderVdom(hostRef, renderFnResults, isInitialLoad?)`, where `hostRef` is the
  minimal `RenderHostRef` (`{ $hostElement$, $vnode$? }`).

Server-side rendering is **not** part of this kernel. Stencil's SSR/hydration
annotation was removed; a new React-only SSR is planned separately.
