import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';

const resolveFromProjectRoot = (relativePath: string) => path.resolve(process.cwd(), relativePath);
const workspaceRoot = path.resolve(process.cwd(), '..', '..');

export default defineConfig({
  server: {
    fs: {
      allow: [workspaceRoot]
    }
  },
  plugins: [
    svelte({
      compilerOptions: {
        runes: true,
        compatibility: {
          componentApi: 4
        }
      }
    }),
    svelteTesting()
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    clearMocks: true,
    restoreMocks: true,
    setupFiles: [
      resolveFromProjectRoot('./src/tests/setup.ts'),
      resolveFromProjectRoot('./src/tests/vitest-setup.ts')
    ],
    include: ['src/**/*.{test,spec}.{js,ts}'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/tests/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/demo/**',
        '**/mocks/**'
      ]
    },
    server: {
      deps: {
        inline: ['svelte']
      }
    }
  },
  resolve: {
    alias: {
      '@': '/src',
      'obsidian': '/src/tests/mocks/obsidian.ts'
    }
  },
  define: {
    global: 'globalThis'
  }
});
