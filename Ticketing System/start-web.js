// Wrapper so PM2 can start Next.js without path-with-spaces issues
process.chdir(__dirname + '/frontend')
process.argv = ['node', 'next', 'start', '--port', '3000']
require('./frontend/node_modules/next/dist/bin/next')
