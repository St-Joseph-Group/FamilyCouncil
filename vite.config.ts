import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

function buildVersionPlugin() {
  return {
    name: 'build-version',
    buildStart() {
      const version = Date.now().toString(36);
      mkdirSync(resolve(__dirname, 'public'), { recursive: true });
      writeFileSync(resolve(__dirname, 'public/version.json'), JSON.stringify({ version }));
    },
  };
}

export default defineConfig({
  plugins: [react(), buildVersionPlugin()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
