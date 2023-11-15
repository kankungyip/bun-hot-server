import { join } from 'node:path';
import { statSync } from 'node:fs';

const HOT_PATH = '__hot';

const serveFromDir = ({ directory, path }) => {
  const basePath = join(directory, path);
  const suffixes = ['', '.html', 'index.html'];

  for (const suffix of suffixes) {
    try {
      const pathWithSuffix = join(basePath, suffix);
      const stat = statSync(pathWithSuffix);
      if (stat && stat.isFile()) {
        return new Response(Bun.file(pathWithSuffix));
      }
    } catch (err) {}
  }
  return null;
};

export default function createServer(rootdir, hostname = 'localhost', port = 3000) {
  const server = {
    wsUrl: `ws://${hostname}:${port}/${HOT_PATH}`,
  };

  const { protocol } = Bun.serve({
    fetch(req, server) {
      const reqPath = new URL(req.url).pathname;

      if (reqPath === `/${HOT_PATH}`) {
        const success = server.upgrade(req);
        if (!success) {
          return new Response('WebSocket upgrade error', {
            status: 400,
          });
        }
        return;
      }

      if (rootdir) {
        const buildResponse = serveFromDir({
          directory: rootdir,
          path: reqPath,
        });
        if (buildResponse) {
          return buildResponse;
        }
      }

      return new Response('Not found', {
        status: 404,
      });
    },

    websocket: {
      open(ws) {
        if (server.wsClient && server.wsClient.readyState === WebSocket.OPEN) {
          server.wsClient.close();
          server.wsClient = null;
        }
        server.wsClient = ws;
      },
    },
  });

  server.url = `${protocol}://${hostname}:${port}`;

  return server;
}
