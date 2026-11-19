import { loadConfig } from './config';
import { dictionary } from './dictionary';
import { startServer } from './server';
import { errorMeta, logger, setLogLevel } from './utils/logger';

async function main(): Promise<void> {
  const config = loadConfig();
  setLogLevel(config.LOG_LEVEL);
  const words = dictionary().size; // load eagerly so the first game isn't slow
  const server = await startServer(config);
  logger.info('BlankBlitz server listening', { port: server.port, env: config.NODE_ENV, words });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('shutting down', { signal });
    const force = setTimeout(() => process.exit(1), 5000);
    force.unref();
    try {
      await server.close();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

process.on('unhandledRejection', (reason) => logger.error('unhandled rejection', errorMeta(reason)));
process.on('uncaughtException', (err) => {
  // State may be corrupt: log and exit so the process manager restarts us cleanly.
  logger.error('uncaught exception', errorMeta(err));
  process.exit(1);
});

main().catch((err: unknown) => {
  logger.error('failed to start', errorMeta(err));
  process.exit(1);
});
