export default function HotLoader(option) {
  const varname = Math.random().toString(36).slice(2);
  return {
    name: 'bun-loader-hot',
    setup({ onLoad, onResolve, config }) {
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
              if (globalThis._${varname}) return;
              globalThis._${varname} = new globalThis.WebSocket('${option.url}');
              globalThis._${varname}.addEventListener('message', () => {
                globalThis.location.reload();
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
