import * as path from 'node:path';
import { statSync, watch } from 'node:fs';
import HotLoader from './hot-loader';

const HOT_PATH = '__hot';

const serveFromDir = (option) => {
  const basePath = path.join(option.directory, option.path);
  const suffixes = ['', '.html', 'index.html'];

  for (const suffix of suffixes) {
    try {
      const pathWithSuffix = path.join(basePath, suffix);
      const stat = statSync(pathWithSuffix);
      if (stat && stat.isFile()) {
        return new Response(Bun.file(pathWithSuffix));
      }
    } catch (err) {}
  }

  return null;
};

import(`${process.cwd()}/serve.config`).then(async ({ default: option = {} }) => {
  const directory = option.directory || {};

  const buildOption = option.build;
  buildOption.minify = false;

  let watcher;
  if (directory.watch) {
    watcher = watch(directory.watch, { recursive: true });
  }

  const { protocol, hostname, port } = Bun.serve({
    hostname: option.hostname,
    port: option.port,
    development: option.development === true ? true : false,

    fetch(req, server) {
      const reqPath = new URL(req.url).pathname;

      if (watcher && reqPath === `/${HOT_PATH}`) {
        const success = server.upgrade(req);
        if (!success) {
          return new Response('WebSocket upgrade error', {
            status: 400,
          });
        }
        return;
      }

      console.log(req.method, reqPath);

      if (directory.public) {
        const publicResponse = serveFromDir({
          directory: directory.public,
          path: reqPath,
        });
        if (publicResponse) {
          return publicResponse;
        }
      }

      if (directory.build) {
        const buildResponse = serveFromDir({
          directory: directory.build,
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

    websocket: watcher
      ? {
          open(ws) {
            watcher.addListener('change', async () => {
              console.log('\nrebuilding...');
              const result = await Bun.build(buildOption);
              if (result.success) {
                console.log('build complete.\n');
                ws.send('reloading');
              } else {
                console.error(result.logs, '\n');
              }
            });
          },
          close(ws) {
            watcher.removeAllListeners('change');
          },
        }
      : null,
  });

  buildOption.plugins = buildOption.plugins || [];
  buildOption.plugins.push(HotLoader({ url: `ws://${hostname}:${port}/${HOT_PATH}` }));

  console.log('\nbuilding...');

  const result = await Bun.build(buildOption);
  if (result.success) {
    console.log('build complete.\n');

    const message = `Starting at ${protocol}://${hostname}:${port}`;
    const hr = new Array(message.length).fill('-').join('');
    console.log(`${hr}\n${message}\n${hr}\n`);
  } else {
    console.error(result.logs, '\n');
    process.exit();
  }
});
