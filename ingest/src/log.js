// Minimal levelled JSON-ish logger. Keeps ingest dependency-free at runtime.
import { config } from './config.js';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[config.logLevel] ?? LEVELS.info;

function emit(level, scope, msg, extra) {
  if (LEVELS[level] < threshold) return;
  const ts = new Date().toISOString();
  const tail = extra ? ' ' + JSON.stringify(extra) : '';
  const line = `${ts} ${level.toUpperCase().padEnd(5)} [${scope}] ${msg}${tail}`;
  (level === 'error' || level === 'warn' ? console.error : console.log)(line);
}

export const logger = (scope) => ({
  debug: (m, e) => emit('debug', scope, m, e),
  info: (m, e) => emit('info', scope, m, e),
  warn: (m, e) => emit('warn', scope, m, e),
  error: (m, e) => emit('error', scope, m, e),
});
