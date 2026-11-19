import { createServer, type Server } from 'node:http';
import type { Config } from './config';
import { createApp } from './http/app';
import { createRealtime, type Realtime } from './socket';

export interface RunningServer {
  http: Server;
  realtime: Realtime;
  port: number;
  close(): Promise<void>;
}

/** Builds and starts the HTTP + WebSocket server. Exported separately so tests can boot it. */
export async function startServer(config: Config): Promise<RunningServer> {
  let realtime: Realtime | null = null;
  const app = createApp(config, () => ({ rooms: realtime?.rooms.size ?? 0, sockets: realtime?.io.engine.clientsCount ?? 0 }));
  const http = createServer(app);
  realtime = createRealtime(http, config);
  const rt = realtime;

  await new Promise<void>((resolve, reject) => {
    http.once('error', reject);
    http.listen(config.PORT, config.HOST, () => resolve());
  });
  const address = http.address();
  const port = typeof address === 'object' && address ? address.port : config.PORT;

  return {
    http,
    realtime: rt,
    port,
    close: () => rt.close(),
  };
}
