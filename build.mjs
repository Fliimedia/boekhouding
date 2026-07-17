// esbuild compile van App.jsx naar public/bundle.js
// Gebruik: node build.mjs  (bouwt) of node build.mjs --check (alleen compileren)
import { build } from 'esbuild';

const check = process.argv.includes('--check');

await build({
  entryPoints: ['App.jsx'],
  bundle: true,
  outfile: 'public/bundle.js',
  format: 'iife',
  jsx: 'automatic',
  minify: !check,
  logLevel: 'info',
});

console.log(check ? 'compile-check ok' : 'build ok');
