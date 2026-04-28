module.exports = {
  apps: [
    {
      name: 'k-content',
      script: 'node',
      args: '--import tsx/esm src/server.ts',
      cwd: '/home/user/webapp',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      error_file: '/home/user/webapp/logs/error.log',
      out_file: '/home/user/webapp/logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }
  ]
}
