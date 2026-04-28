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
    // ── 크롤러 서버 (Node.js + tsx) ──────────────────────────
    {
      name: 'crawler',
      script: 'npx',
      args: 'tsx src/server.ts',
      cwd: '/home/user/crawler',
      env: { NODE_ENV: 'development', PORT: 3001 },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
    },
  ],
}
