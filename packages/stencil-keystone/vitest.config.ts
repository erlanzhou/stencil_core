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
