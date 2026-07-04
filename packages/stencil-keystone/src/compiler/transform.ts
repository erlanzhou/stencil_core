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
