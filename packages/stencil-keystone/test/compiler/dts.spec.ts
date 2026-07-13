import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { emitKeystoneDeclarations } from '../../src/compiler/dts-transformer';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, '../..');
const SRC = path.join(pkgRoot, 'src');
const VDIR = path.join(pkgRoot, '__virtual__'); // a real dir so relative imports resolve on disk semantics

const scriptKind = (fileName: string): ts.ScriptKind =>
  fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : fileName.endsWith('.d.ts') ? ts.ScriptKind.TS : ts.ScriptKind.TS;

// A compiler host that serves an in-memory overlay first, delegating to disk otherwise.
const overlayHost = (overlay: Map<string, string>, options: ts.CompilerOptions): ts.CompilerHost => {
  const host = ts.createCompilerHost(options, true);
  const baseGetSourceFile = host.getSourceFile.bind(host);
  const baseFileExists = host.fileExists.bind(host);
  const baseReadFile = host.readFile.bind(host);
  const baseDirExists = host.directoryExists?.bind(host);
  host.fileExists = (fn) => overlay.has(fn) || baseFileExists(fn);
  host.readFile = (fn) => (overlay.has(fn) ? overlay.get(fn) : baseReadFile(fn));
  // Overlay files live under a directory that may not exist on disk; module
  // resolution probes directoryExists before candidate files, so report it.
  host.directoryExists = (dir) =>
    [...overlay.keys()].some((f) => f.startsWith(`${dir}/`) || f.startsWith(dir)) || (baseDirExists?.(dir) ?? true);
  host.getSourceFile = (fn, lang, onError, shouldCreate) =>
    overlay.has(fn)
      ? ts.createSourceFile(fn, overlay.get(fn)!, lang, true, scriptKind(fn))
      : baseGetSourceFile(fn, lang, onError, shouldCreate);
  return host;
};

const LIB = ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'];

// Emit the keystone `.d.ts` for a single component source.
const emitDts = (fileName: string, source: string): string => {
  const overlay = new Map([[fileName, source]]);
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    jsxImportSource: 'stencil-keystone',
    experimentalDecorators: true,
    declaration: true,
    emitDeclarationOnly: true,
    skipLibCheck: true,
    lib: LIB,
  };
  const program = ts.createProgram([fileName], options, overlayHost(overlay, options));
  let out = '';
  emitKeystoneDeclarations(program, (f, text) => {
    if (f.endsWith('.d.ts')) out = text;
  });
  return out;
};

// Type-check `consumer.tsx` (importing the generated `button.d.ts`) and return its diagnostics.
const typecheckConsumer = (dts: string, consumer: string): ts.Diagnostic[] => {
  const buttonPath = path.join(VDIR, 'button.d.ts');
  const consumerPath = path.join(VDIR, 'consumer.tsx');
  const overlay = new Map([
    [buttonPath, dts],
    [consumerPath, consumer],
  ]);
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    jsxImportSource: 'stencil-keystone',
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    lib: LIB,
    baseUrl: pkgRoot,
    // Resolve the bare specifier to the real runtime source (exercises the real
    // `KeystoneComponent` type + JSX namespace, not a hand-written shim).
    paths: {
      'stencil-keystone': [path.relative(pkgRoot, path.join(SRC, 'index.ts'))],
      'stencil-keystone/jsx-runtime': [path.relative(pkgRoot, path.join(SRC, 'vdom/jsx-runtime.ts'))],
    },
  };
  const program = ts.createProgram([consumerPath, buttonPath], options, overlayHost(overlay, options));
  const consumerSf = program.getSourceFile(consumerPath)!;
  return [...program.getSemanticDiagnostics(consumerSf), ...program.getSyntacticDiagnostics(consumerSf)];
};

const messages = (diags: ts.Diagnostic[]): string[] =>
  diags.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));

// Assert real type errors were reported (and not merely an unresolved import).
const expectTypeError = (diags: ts.Diagnostic[]): void => {
  const msgs = messages(diags);
  expect(msgs.some((m) => m.includes('Cannot find module'))).toBe(false);
  expect(msgs.length).toBeGreaterThan(0);
};

const COMPONENT = `
import { Component, Prop, Event, EventEmitter, Method } from 'stencil-keystone';

@Component({ name: 'my-button' })
export class MyButton {
  @Prop() label: string;          // required (no ? / no default)
  @Prop() disabled?: boolean;     // optional (?)
  @Prop() size: string = 'md';    // optional (default)
  @State() internal = 0;          // excluded from props
  @Event() change: EventEmitter<number>;
  @Method() async focusInput(): Promise<void> {}
  render() { return null; }
}
`;

describe('compiler — d.ts type generation (component references)', () => {
  it('rewrites the component class into a KeystoneComponent<Props, Methods> const', () => {
    const dts = emitDts(path.join(VDIR, 'src.tsx'), COMPONENT);
    expect(dts).toContain('import type { KeystoneComponent } from "stencil-keystone"');
    expect(dts).toContain('export declare const MyButton: KeystoneComponent<');
    expect(dts).toContain('label: string'); // required @Prop keeps its type, no ?
    expect(dts).toContain('disabled?: boolean'); // optional via ?
    expect(dts).toContain('size?: string'); // optional via default
    expect(dts).not.toContain('internal'); // @State excluded
    expect(dts).toContain('onChange?: (event: CustomEvent<number>) => void'); // @Event → onX
    expect(dts).toContain('focusInput(): Promise<void>'); // @Method → ref surface
    expect(dts).not.toContain('class MyButton'); // the class declaration is gone
  });

  it('type-checks correct JSX usage (props, event detail, children, method ref)', () => {
    const dts = emitDts(path.join(VDIR, 'src.tsx'), COMPONENT);
    const diags = typecheckConsumer(
      dts,
      `import { MyButton } from './button';
       export const ok = (
         <MyButton
           label="hi"
           disabled
           size="lg"
           onChange={(e) => e.detail.toFixed(2)}
           ref={(el) => el?.focusInput()}
         >child text</MyButton>
       );`,
    );
    expect(messages(diags)).toEqual([]);
  });

  it('errors when a required prop is missing', () => {
    const dts = emitDts(path.join(VDIR, 'src.tsx'), COMPONENT);
    const diags = typecheckConsumer(dts, `import { MyButton } from './button';\nexport const bad = <MyButton disabled />;`);
    expectTypeError(diags);
  });

  it('errors when a prop has the wrong type', () => {
    const dts = emitDts(path.join(VDIR, 'src.tsx'), COMPONENT);
    const diags = typecheckConsumer(dts, `import { MyButton } from './button';\nexport const bad = <MyButton label={123} />;`);
    expectTypeError(diags);
  });

  it('errors when an event handler gets the wrong detail type', () => {
    const dts = emitDts(path.join(VDIR, 'src.tsx'), COMPONENT);
    const diags = typecheckConsumer(
      dts,
      `import { MyButton } from './button';\nexport const bad = <MyButton label="x" onChange={(e) => e.detail.toUpperCase()} />;`,
    );
    expectTypeError(diags); // detail is number, .toUpperCase() is a string method
  });
});
