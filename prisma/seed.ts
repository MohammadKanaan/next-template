import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { hashPassword } from 'better-auth/crypto'
import { PrismaClient, type Role } from '../generated/prisma/client.ts'

/** Dev-only password shared by every seeded account. */
const SEED_PASSWORD = 'password123'
const POSTS_PER_USER = 4

const SEED_USERS: {
  name: string
  username: string
  email: string
  phone: string | null
  website: string | null
  role: Role
}[] = [
  {
    name: 'Ada Admin',
    username: 'admin',
    email: 'admin@example.com',
    phone: null,
    website: null,
    role: 'admin',
  },
  {
    name: 'Leanne Graham',
    username: 'leanne',
    email: 'leanne@example.com',
    phone: '1-770-736-8031',
    website: 'hildegard.org',
    role: 'user',
  },
  {
    name: 'Ervin Howell',
    username: 'ervin',
    email: 'ervin@example.com',
    phone: '010-692-6593',
    website: 'anastasia.net',
    role: 'user',
  },
  {
    name: 'Clementine Bauch',
    username: 'clementine',
    email: 'clementine@example.com',
    phone: null,
    website: null,
    role: 'user',
  },
]

// The script owns its client (and disconnects it); `lib/data/db.ts` is server-only.
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

try {
  const password = await hashPassword(SEED_PASSWORD)

  for (const data of SEED_USERS) {
    // Re-seeding replaces the user; sessions, accounts, and posts cascade.
    await db.user.deleteMany({ where: { email: data.email } })

    const id = randomUUID()
    const firstName = data.name.split(' ')[0]
    await db.user.create({
      data: {
        ...data,
        id,
        emailVerified: true,
        accounts: {
          create: { id: randomUUID(), accountId: id, providerId: 'credential', password },
        },
        posts: {
          create: Array.from({ length: POSTS_PER_USER }, (_, index) => ({
            title: `${firstName}'s post #${index + 1}`,
            body: [
              `This is the body of ${firstName}'s post number ${index + 1}.`,
              'It exists so the posts pages have something realistic to render.',
            ].join(' '),
          })),
        },
      },
    })
  }

  console.log(
    `Seeded ${SEED_USERS.length} users (password "${SEED_PASSWORD}") and ` +
      `${SEED_USERS.length * POSTS_PER_USER} posts.`,
  )
} finally {
  await db.$disconnect()
}
