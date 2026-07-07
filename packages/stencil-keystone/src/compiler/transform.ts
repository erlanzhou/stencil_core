import ts from 'typescript';

import { containsKeystoneComponent, keystoneTransformer } from './keystone-transformer';

export interface TransformOptions {
  dev?: boolean;
  jsxImportSource?: string;
  runtimeModule?: string;
}

export interface TransformResult {
  code: string;
  map: string;
}

/**
 * Compile a single source file. Returns `null` for files without a
 * provenance-matched `@Component` (they pass through the bundler untouched).
 *
 * @param code the source text
 * @param id the file path (used for the JSX/TS script kind and sourcemap)
 * @param opts compiler options (dev mode, JSX import source, runtime module)
 * @returns the compiled code and sourcemap, or `null` to skip the file
 */
export const transform = (code: string, id: string, opts: TransformOptions = {}): TransformResult | null => {
  // Cheap substring pre-filter: bail before paying for a real parse when the
  // file couldn't possibly reference the runtime's `Component` decorator.
  // Deliberately looser than `/@Component\s*\(/` — an aliased import
  // (`import { Component as C } from '...'`) never spells "@Component(" in
  // the decorator usage itself, only in the import specifier, so matching
  // just the identifier "Component" is required to let aliased files reach
  // the real provenance check below instead of being rejected here.
  if (!/Component/.test(code)) {
    return null;
  }
  const { dev = false, jsxImportSource = 'stencil-keystone', runtimeModule = 'stencil-keystone' } = opts;

  // Cheap regex above only says the token appears; confirm a real keystone
  // component (a class whose @Component resolves to a runtime-module import)
  // before transforming — otherwise pass the file through untouched.
  if (!containsKeystoneComponent(code, id, runtimeModule)) {
    return null;
  }

  const out = ts.transpileModule(code, {
    fileName: id,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: dev ? ts.JsxEmit.ReactJSXDev : ts.JsxEmit.ReactJSX,
      jsxImportSource,
      // Legacy (experimental) decorators + assignment-semantics class fields,
      // matching the component library's tsconfig. `useDefineForClassFields:false`
      // makes a class-field initializer a setter-routed assignment (not a shadowing
      // define), so a reactive `@Prop` can coexist on the same field as a custom
      // (legacy) decorator; the transformer strips only its OWN decorators and
      // leaves unrecognized ones for TS to lower, so they run at runtime.
      useDefineForClassFields: false,
      experimentalDecorators: true,
      sourceMap: true,
    },
    transformers: { before: [keystoneTransformer({ runtimeModule })] },
  });

  return { code: out.outputText, map: out.sourceMapText ?? '' };
};
