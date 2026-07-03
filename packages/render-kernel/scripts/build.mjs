import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

cpSync(resolve(pkgRoot, 'index.d.ts'), resolve(outDir, 'index.d.ts'));

console.log('✅ built @stencil/render-kernel -> dist');
