import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node prisma/seed.ts',
  },
  datasource: {
    // `?? ''` keeps `prisma generate` (postinstall, typecheck) working without a database URL.
    url: process.env.DATABASE_URL ?? '',
  },
})
