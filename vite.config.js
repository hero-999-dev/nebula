import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron/simple';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: 'src',
  base: './',
  build: {
    outDir: path.join(projectRoot, 'dist'),
    emptyOutDir: true,
  },
  plugins: [
    electron({
      main: {
        entry: path.join(projectRoot, 'electron/main.js'),
        vite: {
          build: {
            outDir: path.join(projectRoot, 'dist-electron'),
            emptyOutDir: true,
            rollupOptions: {
              // electron-updater is a real runtime dependency loaded from the
              // packaged node_modules. Bundling it silently produces a main
              // process that cannot check for updates.
              external: ['electron-updater'],
            },
          },
        },
      },
      preload: {
        input: path.join(projectRoot, 'electron/preload.js'),
        vite: {
          build: {
            outDir: path.join(projectRoot, 'dist-electron'),
            rollupOptions: {
              output: { entryFileNames: 'preload.js' },
            },
          },
        },
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    root: projectRoot,
    include: ['tests/**/*.test.js'],
    testTimeout: 30000,
  },
});
