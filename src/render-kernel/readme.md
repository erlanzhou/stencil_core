# render-kernel

Stencil runtime render kernel extracted from `src/runtime`.

## Scope

- VNode creation (`h`, `newVNode`, `Host`)
- JSX runtimes (`jsx`, `jsxs`, `jsxDEV`)
- DOM patching (`renderVdom`, `patch`, `isSameVnode`)
- Element attribute/prop patching (`updateElement`, `setAccessor`)
- Lightweight container render API (`render`)

## Compatibility contract

This module keeps the same VNode private field names and runtime semantics used by current Stencil compiler output:

- `$flags$`, `$tag$`, `$text$`, `$elm$`, `$children$`, `$attrs$`, `$key$`
- `key` and `ref` behavior
- `renderVdom(hostRef, renderFnResults, isInitialLoad?)`

`src/runtime/*` now re-exports this kernel through shim modules to preserve existing import paths.
