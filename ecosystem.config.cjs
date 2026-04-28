module.exports = {
  apps: [
    // ── Hono 앱 (Cloudflare Pages Dev) ──────────────────────
    {
      name: 'webapp',
      script: 'npx',
      args: 'wrangler pages dev dist --d1=webapp-production --local --ip 0.0.0.0 --port 3000',
      cwd: '/home/user/webapp',
      env: { NODE_ENV: 'development', PORT: 3000 },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
    },
    // ── 크롤러 서버 (Node.js CJS - Playwright 실행) ──────────
    {
      name: 'crawler',
      script: '/home/user/webapp/crawler-server.cjs',
      interpreter: 'node',
      cwd: '/home/user/webapp',
      env: { NODE_ENV: 'development', PORT: 3001 },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
    },
  ],
}
