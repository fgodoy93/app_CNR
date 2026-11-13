import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts', 'src/mcp/stdio.ts', 'prisma/seed.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // bundle the workspace package (TS sources) into the output
  noExternal: ['@terreno/shared'],
});
