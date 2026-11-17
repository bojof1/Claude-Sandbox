// Bundle the coach with a fake RemNote so it can run in a plain browser.
require('esbuild')
  .build({
    entryPoints: [__dirname + '/harness.tsx'],
    bundle: true,
    outfile: __dirname + '/out.js',
    jsx: 'automatic',
    alias: { '@remnote/plugin-sdk': __dirname + '/mock-sdk.tsx' },
    define: { 'process.env.NODE_ENV': '"development"' },
    logLevel: 'error',
  })
  .catch(() => process.exit(1));
