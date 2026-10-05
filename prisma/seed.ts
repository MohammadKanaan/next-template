import 'dotenv/config'
import postgres from '@prisma/orm-postgres/runtime'
import type { Contract } from './contract.d.ts'
import contractJson from './contract.json' with { type: 'json' }

const POSTS_PER_USER = 4

const SEED_USERS = [
  {
    name: 'Leanne Graham',
    username: 'leanne',
    email: 'leanne@example.com',
    phone: '1-770-736-8031',
    website: 'hildegard.org',
  },
  {
    name: 'Ervin Howell',
    username: 'ervin',
    email: 'ervin@example.com',
    phone: '010-692-6593',
    website: 'anastasia.net',
  },
  {
    name: 'Clementine Bauch',
    username: 'clementine',
    email: 'clementine@example.com',
    phone: null,
    website: null,
  },
]

// The script owns its client (and closes it); `server/db.ts` is server-only.
const db = postgres<Contract>({ contractJson, url: process.env.DATABASE_URL })

try {
  for (const data of SEED_USERS) {
    const existing = await db.orm.public.User.where({ email: data.email }).first()
    const user = existing
      ? await db.orm.public.User.where({ id: existing.id }).update(data)
      : await db.orm.public.User.create(data)

    if (!user) {
      throw new Error(`Could not seed ${data.email}`)
    }

    await db.orm.public.Post.where({ userId: user.id }).deleteAll()

    const firstName = data.name.split(' ')[0]
    for (let n = 1; n <= POSTS_PER_USER; n++) {
      await db.orm.public.Post.create({
        userId: user.id,
        title: `${firstName}'s post #${n}`,
        body: [
          `This is the body of ${firstName}'s post number ${n}.`,
          'It exists so the posts pages have something realistic to render.',
        ].join(' '),
      })
    }
  }
  console.log(`Seeded ${SEED_USERS.length} users and ${SEED_USERS.length * POSTS_PER_USER} posts.`)
} finally {
  await db.close()
}
