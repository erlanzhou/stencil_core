import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(__dirname, '..');
const entry = resolve(pkgRoot, 'src/index.ts');
const outDir = resolve(pkgRoot, 'dist');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const common = {
  bundle: true,
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  entryPoints: [entry],
  legalComments: 'none',
  minify: false,
  platform: 'browser',
  sourcemap: false,
  target: 'es2022',
  treeShaking: true,
};

await build({
  ...common,
  format: 'esm',
  outfile: resolve(outDir, 'index.js'),
});

await build({
  ...common,
  format: 'cjs',
  outfile: resolve(outDir, 'index.cjs'),
});

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

// Emit .d.ts for the whole source tree from a real tsc pass (no hand-maintained
// declaration file to drift out of sync).
execFileSync('npx', ['tsc', '-p', 'tsconfig.build.json'], { cwd: pkgRoot, stdio: 'inherit' });

console.log('✅ built stencil-keystone -> dist');
