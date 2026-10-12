import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { hashPassword } from 'better-auth/crypto'
import { PrismaClient } from '../generated/prisma/client.ts'

/** Dev-only password shared by every seeded account. */
const SEED_PASSWORD = 'password123'
const POSTS_PER_USER = 4

const SEED_USERS: {
  name: string
  username: string
  email: string
  website: string | null
  role: string
}[] = [
  {
    name: 'Ada Admin',
    username: 'admin',
    email: 'admin@example.com',
    website: null,
    role: 'admin',
  },
  {
    name: 'Leanne Graham',
    username: 'leanne',
    email: 'leanne@example.com',
    website: 'hildegard.org',
    role: 'user',
  },
  {
    name: 'Ervin Howell',
    username: 'ervin',
    email: 'ervin@example.com',
    website: null,
    role: 'user',
  },
]

// The seeded accounts have a public password and one of them is an admin, so a production
// container must not be seeded by accident.
if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED !== '1') {
  console.error(
    'Refusing to seed in production (the seed creates admin@example.com / password123). Set ALLOW_SEED=1 to override.',
  )
  process.exit(1)
}

// The script owns its client (and disconnects it); `lib/data/db.ts` is server-only.
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, options: '-c timezone=UTC' }),
})

try {
  const password = await hashPassword(SEED_PASSWORD)

  for (const data of SEED_USERS) {
    // Re-seeding replaces the user; sessions, accounts and posts cascade.
    await db.user.deleteMany({ where: { email: data.email } })

    // Ids come from the schema's `@default(uuid(7))`. Better Auth's credential account uses the
    // user's id as its `accountId`, so the account is created once the id is known.
    const firstName = data.name.split(' ')[0]
    const user = await db.user.create({
      data: {
        ...data,
        emailVerified: true,
        // Three published posts and one draft each.
        posts: {
          create: Array.from({ length: POSTS_PER_USER }, (_, index) => ({
            title: `${firstName}'s post #${index + 1}`,
            body: [
              `This is the body of ${firstName}'s post number ${index + 1}.`,
              'It exists so the posts pages have something realistic to render.',
            ].join(' '),
            published: index < POSTS_PER_USER - 1,
          })),
        },
      },
      select: { id: true },
    })
    await db.account.create({
      data: { accountId: user.id, providerId: 'credential', password, userId: user.id },
    })
  }

  console.log(
    `Seeded ${SEED_USERS.length} users (password "${SEED_PASSWORD}") and ` +
      `${SEED_USERS.length * POSTS_PER_USER} posts (one draft each).`,
  )
} finally {
  await db.$disconnect()
}
