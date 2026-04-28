import { defineConfig } from 'vite'
import build from '@hono/vite-build/cloudflare-pages'

export default defineConfig({
  plugins: [
    build({
      entry: 'src/index.tsx',
      // Playwright는 Node.js 전용 - Cloudflare Workers 번들에서 완전 제외
      external: [
        'playwright',
        'playwright-core',
        '@playwright/browser-chromium',
        'chromium-bidi',
        'chromium-bidi/lib/cjs/bidiMapper/BidiMapper',
        'chromium-bidi/lib/cjs/cdp/CdpConnection',
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
  ssr: {
    external: [
      'playwright',
      'playwright-core',
      '@playwright/browser-chromium',
    ],
    noExternal: [],
  },
})
