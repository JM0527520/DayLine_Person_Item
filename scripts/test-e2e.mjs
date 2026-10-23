import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';

process.env.SCHEDULE_PORT = '4320';
const { server } = await import('./serve.mjs');
if (!server.listening) await once(server, 'listening');
const runner = spawn(process.execPath, [resolve('node_modules/@playwright/test/cli.js'), 'test', ...process.argv.slice(2)], { stdio: 'inherit' });
let interrupted = false;
process.on('SIGINT', () => { interrupted = true; runner.kill(); });
const [code] = await once(runner, 'exit');
server.closeAllConnections();
await new Promise(resolve => server.close(resolve));
process.exitCode = interrupted ? 1 : (code ?? 1);
