import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { hashPassword } from 'better-auth/crypto'
import { PrismaClient, type PostStatus, type Role } from '../generated/prisma/client.ts'

/** Dev-only password shared by every seeded account. */
const SEED_PASSWORD = 'password123'
const POSTS_PER_USER = 4

const SEED_TAGS = ['typescript', 'nextjs', 'prisma', 'postgres', 'design', 'testing']

/** Three published posts each, and a draft (even users) or an archived post (odd users) as the fourth. */
const seedStatus = (userIndex: number, postIndex: number): PostStatus => {
  if (postIndex < POSTS_PER_USER - 1) {
    return 'published'
  }
  return userIndex % 2 === 0 ? 'draft' : 'archived'
}

/** One to three tags per post, rotating through `SEED_TAGS`. */
const seedTags = (userIndex: number, postIndex: number) => {
  const start = userIndex * POSTS_PER_USER + postIndex
  const count = (postIndex % 3) + 1
  return Array.from(
    { length: count },
    (_, offset) => SEED_TAGS[(start + offset) % SEED_TAGS.length],
  )
}

const SEED_COMMENTS = [
  'Nice write-up, thanks for sharing.',
  'I ran into the same thing last week.',
  'Could you say more about the second part?',
]

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
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, options: '-c timezone=UTC' }),
})

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000)

try {
  const password = await hashPassword(SEED_PASSWORD)

  for (const [userIndex, data] of SEED_USERS.entries()) {
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
          create: Array.from({ length: POSTS_PER_USER }, (_, index) => {
            const status = seedStatus(userIndex, index)
            return {
              title: `${firstName}'s post #${index + 1}`,
              body: [
                `This is the body of ${firstName}'s post number ${index + 1}.`,
                'It exists so the posts pages have something realistic to render.',
              ].join(' '),
              status,
              // Each user's four posts fall on the last four days, so the dashboard chart has something to show.
              publishedAt: status === 'draft' ? null : daysAgo(index % 14),
              tags: {
                create: seedTags(userIndex, index).map((name) => ({
                  tag: { connectOrCreate: { where: { name }, create: { name } } },
                })),
              },
            }
          }),
        },
      },
    })
  }

  // Each user comments on the first published post of the next one (comments need a published post).
  const users = await db.user.findMany({
    where: { email: { in: SEED_USERS.map((user) => user.email) } },
    select: { id: true, email: true },
  })
  const commentRows = []
  for (const [userIndex, data] of SEED_USERS.entries()) {
    const author = users.find((user) => user.email === data.email)
    const target = users.find(
      (user) => user.email === SEED_USERS[(userIndex + 1) % SEED_USERS.length].email,
    )
    const post = target
      ? await db.post.findFirst({
          where: { userId: target.id, status: 'published' },
          orderBy: { id: 'asc' },
          select: { id: true },
        })
      : null
    if (author && post) {
      for (const body of SEED_COMMENTS.slice(0, (userIndex % SEED_COMMENTS.length) + 1)) {
        commentRows.push({ body, postId: post.id, userId: author.id })
      }
    }
  }
  await db.comment.createMany({ data: commentRows })

  console.log(
    `Seeded ${SEED_USERS.length} users (password "${SEED_PASSWORD}"), ` +
      `${SEED_USERS.length * POSTS_PER_USER} posts (drafts, published and archived), ` +
      `${SEED_TAGS.length} tags and ${commentRows.length} comments.`,
  )
} finally {
  await db.$disconnect()
}
