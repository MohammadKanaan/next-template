import { createDocument, createSchema } from 'zod-openapi'
import { z } from 'zod'
import { PUBLIC_API_LIMIT } from '@/lib/constants-rateLimit'
import { idSchema } from '@/lib/dto/common'
import { errorBodySchema } from '@/lib/dto/errors'
import { healthSchema } from '@/lib/dto/health'
import {
  listPostsQuery,
  POST_SEARCH_MAX_LENGTH,
  postDetailSchema,
  postsPageSchema,
} from '@/lib/dto/posts'
import { env } from '@/lib/env'

// Every public Route Handler (`app/api/**`) has a path here; a new handler adds its own. Query
// coercion accepts strings at runtime, but clients need the parsed numeric constraints, so each
// coerced number is documented with its output schema (`numeric`) while the original defaulted
// schema keeps the input optionality.

/** A coerced numeric query field, documented with its parsed integer bounds and default. */
const numeric = <S extends z.ZodType>(schema: S): S =>
  schema.meta({ override: createSchema(schema, { io: 'output' }).schema })

const postsQuery = listPostsQuery.extend({
  page: numeric(listPostsQuery.shape.page),
  perPage: numeric(listPostsQuery.shape.perPage),
  q: listPostsQuery.shape.q.describe(
    `Trimmed before validation, at most ${POST_SEARCH_MAX_LENGTH} characters. Matches titles with case-insensitive literal search; wildcard characters are treated literally.`,
  ),
  authorId: listPostsQuery.shape.authorId.describe('Only posts written by this user.'),
  sort: listPostsQuery.shape.sort.describe('Order by creation date: newest first or oldest first.'),
  published: listPostsQuery.shape.published.describe(
    'Anonymous callers only ever see published posts. A signed-in author listing their own posts, and admins, may ask for drafts only (false).',
  ),
})

const postParams = z.object({ id: idSchema.describe('The post’s id.') })

const postsPage = postsPageSchema.meta({ id: 'PostsPage' })
const post = postDetailSchema.meta({ id: 'Post' })
const errorBody = errorBodySchema.meta({ id: 'ErrorBody' })
const health = healthSchema.meta({ id: 'Health' })

const author = {
  id: '0199c2e8-4f1a-7c3b-9d2e-5a6b7c8d9e10',
  name: 'Ada Lovelace',
  username: 'ada',
  website: null,
}

const postExample = {
  id: '0199c2e8-4f1a-7c3b-9d2e-5a6b7c8d9e0f',
  title: 'Hello world',
  excerpt: 'The first post.',
  published: true,
  createdAt: '2026-10-10T08:00:00.000Z',
  author,
}

const postDetailExample = {
  id: postExample.id,
  title: postExample.title,
  body: 'The first post, in full.',
  published: true,
  createdAt: postExample.createdAt,
  updatedAt: postExample.createdAt,
  author,
  permissions: { update: false, delete: false },
}

const invalidQuery = {
  description: 'Invalid search, filter or pagination query, with per-field errors.',
  content: { 'application/json': { schema: errorBody } },
}

const rateLimited = {
  description: `More than ${PUBLIC_API_LIMIT.max} requests to this endpoint from one client address in a minute.`,
  content: { 'application/json': { schema: errorBody } },
}

/** DTO-only documentation: generating it never initializes the DAL, auth, DB, or Redis. */
export const generateOpenApi = () =>
  createDocument(
    {
      openapi: '3.1.0',
      info: {
        title: `${env.appName} API`,
        version: '1.0.0',
        description:
          'Public read endpoints. Writing posts needs a signed-in session and is not part of this contract; account operations use Server Actions. Selected Better Auth account HTTP routes are intentionally disabled to enforce application rules. See the [Better Auth documentation](https://www.better-auth.com/docs) for the upstream authentication library.',
      },
      servers: [{ url: '/' }],
      paths: {
        '/api/v1/posts': {
          get: {
            operationId: 'listPosts',
            summary: 'List posts',
            description:
              'Paginated post list, searched by title and optionally filtered by author. Anonymous callers see published posts only.',
            tags: ['Posts'],
            requestParams: { query: postsQuery },
            responses: {
              200: {
                description: 'Paginated post summaries.',
                content: {
                  'application/json': {
                    schema: postsPage,
                    example: {
                      items: [postExample],
                      page: 1,
                      perPage: 10,
                      totalItems: 1,
                      totalPages: 1,
                    },
                  },
                },
              },
              422: invalidQuery,
              429: rateLimited,
            },
          },
        },
        '/api/v1/posts/{id}': {
          get: {
            operationId: 'getPost',
            summary: 'Get a post',
            description:
              'One published post in full. A draft answers 404 unless the caller is its author or an admin.',
            tags: ['Posts'],
            requestParams: { path: postParams },
            responses: {
              200: {
                description: 'The post, with what the caller may do with it.',
                content: { 'application/json': { schema: post, example: postDetailExample } },
              },
              404: {
                description: 'No such post, a malformed id, or a draft the caller may not read.',
                content: { 'application/json': { schema: errorBody } },
              },
              429: rateLimited,
            },
          },
        },
        '/api/health': {
          get: {
            operationId: 'checkHealth',
            summary: 'Check service health',
            description:
              'Public, live database and Redis probe. Only dependency status is returned.',
            tags: ['Health'],
            responses: {
              200: {
                description: 'Healthy: both dependencies responded successfully.',
                content: {
                  'application/json': {
                    schema: health,
                    example: { status: 'ok', checks: { db: 'ok', redis: 'ok' } },
                  },
                },
              },
              503: {
                description: 'Degraded: at least one dependency failed or timed out.',
                content: {
                  'application/json': {
                    schema: health,
                    example: { status: 'degraded', checks: { db: 'fail', redis: 'ok' } },
                  },
                },
              },
            },
          },
        },
      },
    },
    {
      override: ({ jsonSchema, zodSchema, io }) => {
        // Response.json serializes the DTO's Date objects as ISO strings.
        if (zodSchema._zod.def.type === 'date' && io === 'output') {
          jsonSchema.type = 'string'
          jsonSchema.format = 'date-time'
        }
      },
    },
  )
