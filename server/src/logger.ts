import pino from 'pino';
import config from './config';

const isDev = config.NODE_ENV === 'development';

const root = pino({
  level: config.LOG_LEVEL,
  ...(isDev && {
    transport: { target: 'pino-pretty', options: { colorize: true } },
  }),
});

export class ServiceLogger {
  private log: pino.Logger;

  constructor(service: string) {
    this.log = root.child({ service });
  }

  debugInfoCall(fn: string, info: Record<string, unknown>, debug: Record<string, unknown> = {}) {
    if (this.log.isLevelEnabled('debug')) {
      this.log.debug({ fn, ...info, ...debug }, 'call');
    } else {
      this.log.info({ fn, ...info }, 'call');
    }
  }

  debugInfoRet(fn: string, info: Record<string, unknown>, debug: Record<string, unknown> = {}) {
    if (this.log.isLevelEnabled('debug')) {
      this.log.debug({ fn, ...info, ...debug }, 'ret');
    } else {
      this.log.info({ fn, ...info }, 'ret');
    }
  }

  traceCall(fn: string, info: Record<string, unknown>, debug: Record<string, unknown> = {}) {
    if (this.log.isLevelEnabled('trace')) {
      this.log.trace({ fn, ...info, ...debug }, 'call');
    } 
  }

  traceRet(fn: string, info: Record<string, unknown>, debug: Record<string, unknown> = {}) {
    if (this.log.isLevelEnabled('trace')) {
      this.log.trace({ fn, ...info, ...debug }, 'ret');
    } 
  }

  info(...args: Parameters<pino.Logger['info']>)  { return this.log.info(...args); }
  warn(...args: Parameters<pino.Logger['warn']>)  { return this.log.warn(...args); }
  error(...args: Parameters<pino.Logger['error']>) { return this.log.error(...args); }
  debug(...args: Parameters<pino.Logger['debug']>) { return this.log.debug(...args); }
  trace(...args: Parameters<pino.Logger['trace']>) { return this.log.trace(...args); }
}

export function createLogger(service: string) {
  return new ServiceLogger(service);
}

export default root;
