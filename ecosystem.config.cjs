module.exports = {
  apps: [
    // ── Hono 대시보드 앱 (Cloudflare Pages dev) ──────────────
    {
      name: 'dashboard',
      script: 'npx',
      args: 'wrangler pages dev dist --d1=webapp-production --local --ip 0.0.0.0 --port 3000',
      cwd: '/home/user/webapp',
      env: { NODE_ENV: 'development' },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
    },
    // ── Playwright 크롤러 서버 (Node.js, port 3001) ──────────
    {
      name: 'crawler',
      script: 'dist-crawler/crawler-server.js',
      cwd: '/home/user/webapp',
      env: { NODE_ENV: 'development' },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
    },
  ],
}
