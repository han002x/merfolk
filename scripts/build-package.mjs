import { build } from 'esbuild';
import { copyFile, chmod } from 'node:fs/promises';
await build({ entryPoints: ['server/cli.ts'], outfile: 'dist/cli.js', bundle: true, platform: 'node', format: 'esm', packages: 'external', target: 'node22' });
await copyFile('ONTOLOGY.md', 'dist/guide.md');
await copyFile('server/example.json', 'dist/example.marmerlade.json');
await chmod('dist/cli.js', 0o755);
