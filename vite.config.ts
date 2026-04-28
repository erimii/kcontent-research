import { defineConfig } from 'vite'
import build from '@hono/vite-build/cloudflare-pages'

export default defineConfig({
  plugins: [
    build({
      entry: 'src/index.tsx',
      external: [
        'playwright',
        'playwright-core',
        '@playwright/browser-chromium',
        'chromium-bidi',
      ],
    }),
  ],
  build: {
    outDir: 'dist',
    rollupOptions: {
      external: [
        'playwright',
        'playwright-core',
        '@playwright/browser-chromium',
        'chromium-bidi',
      ],
    },
  },
})
