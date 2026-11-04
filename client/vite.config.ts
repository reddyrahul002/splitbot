import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const repoRoot = resolve(import.meta.dirname, '..');

export default defineConfig(({ mode }) => {
  // Only PORT* is read from the root .env, so the Gemini key never reaches Vite.
  const port = loadEnv(mode, repoRoot, 'PORT').PORT || '3001';
  return {
    plugins: [react()],
    server: {
      proxy: { '/api': `http://localhost:${port}` },
    },
  };
});
