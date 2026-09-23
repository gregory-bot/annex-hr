import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/server.ts', 'src/db/migrate.ts', 'src/db/seed.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // Bundle the TypeScript-source workspace package; keep real npm deps external.
  noExternal: ['@annex/shared'],
  // SQL migrations are read from disk at runtime.
  publicDir: false,
  onSuccess: 'mkdir -p dist/db/migrations && cp src/db/migrations/*.sql dist/db/migrations/',
})
