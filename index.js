import { watch } from 'node:fs';
import createServer from './server';

let server, watcher;

export default function HotServer({ disable, enable, hostname, port }) {
  return {
    name: 'bun-hot-server',
    setup({ onLoad, onResolve, config }) {
      if (disable || !enable) return;

      if (!server) {
        server = createServer(config.outdir, hostname, port);
        const message = `Starting at ${server.url}`;
        const hr = new Array(message.length).fill('-').join('');
        console.log(`\n${hr}\n${message}\n${hr}\n`);
      }

      if (watcher) {
        watcher.close();
        watcher = null;
      }

      let reloadTimer = null;
      watcher = watch(config.outdir, { recursive: true }, () => {
        reloadTimer && clearTimeout(reloadTimer);
        reloadTimer = setTimeout(() => {
          if (server.wsClient && server.wsClient.readyState === WebSocket.OPEN) {
            server.wsClient.send('reloading');
          }
        }, 500);
      });

      onResolve({ filter: /^__hot_server_helper__$/ }, (args) => {
        return {
          path: args.path,
          namespace: 'hot-server-helper',
        };
      });

      onLoad({ filter: /.*/, namespace: 'hot-server-helper' }, () => {
        return {
          contents: `
            (function () {
              if (globalThis._hotServer) {
                globalThis._hotServer.close();
                globalThis._hotServer = null;
              };
              globalThis._hotServer = new globalThis.WebSocket('${server.wsUrl}');
              let reloadTimer = null;
              globalThis._hotServer.addEventListener('message', () => {
                reloadTimer && clearTimeout(reloadTimer);
                reloadTimer = setTimeout(() => {
                  globalThis._hotServer.close();
                  globalThis._hotServer = null;
                  globalThis.location.reload();
                }, 500);
              });
            })();
          `,
          loader: 'js',
        };
      });

      onLoad({ filter: new RegExp(`^(${config.entrypoints.join('|')})$`) }, async (args) => {
        return {
          contents: `
            import '__hot_server_helper__';
            ${await Bun.file(args.path).text()}
          `,
          loader: args.loader,
        };
      });
    },
  };
}
