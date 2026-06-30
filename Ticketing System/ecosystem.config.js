// PM2 process manager config — run with: pm2 start ecosystem.config.js
// Manage: pm2 status | pm2 logs | pm2 restart all | pm2 stop all
const path = require('path')
const root  = __dirname

module.exports = {
  apps: [
    {
      name: 'helpdesk-api',
      script: path.join(root, 'venv', 'Scripts', 'python.exe'),
      args: '-m waitress --port=8000 --threads=8 config.wsgi:application',
      cwd: path.join(root, 'backend'),
      interpreter: 'none',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      watch: false,
      env: {
        PYTHONPATH: path.join(root, 'backend'),
        PYTHONUNBUFFERED: '1',
      },
      error_file: path.join(root, 'backend', 'logs', 'pm2-api-error.log'),
      out_file:   path.join(root, 'backend', 'logs', 'pm2-api-out.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'helpdesk-web',
      script: path.join(root, 'start-web.js'),
      cwd: root,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      watch: false,
      error_file: path.join(root, 'backend', 'logs', 'pm2-web-error.log'),
      out_file:   path.join(root, 'backend', 'logs', 'pm2-web-out.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
}
