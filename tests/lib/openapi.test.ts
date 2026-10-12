// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { generateOpenApi } from '@/lib/openapi'

const parameterNamed = (path: string, name: string) => {
  const parameters = generateOpenApi().paths?.[path]?.get?.parameters ?? []
  return parameters.find((parameter) => 'name' in parameter && parameter.name === name)
}

describe('generated OpenAPI document', () => {
  it('documents every public HTTP operation and nothing else', () => {
    const spec = generateOpenApi()
    expect(Object.keys(spec.paths ?? {}).sort()).toEqual([
      '/api/health',
      '/api/v1/posts',
      '/api/v1/posts/{id}',
    ])
    expect(Object.keys(spec.paths?.['/api/v1/posts']?.get?.responses ?? {})).toEqual([
      '200',
      '422',
      '429',
    ])
    expect(Object.keys(spec.paths?.['/api/v1/posts/{id}']?.get?.responses ?? {})).toEqual([
      '200',
      '404',
      '429',
    ])
    expect(Object.keys(spec.paths?.['/api/health']?.get?.responses ?? {})).toEqual(['200', '503'])
    expect(spec.security).toBeUndefined()
  })

  it('keeps every list query optional while documenting numeric bounds and defaults', () => {
    const parameters = generateOpenApi().paths?.['/api/v1/posts']?.get?.parameters ?? []
    expect(
      parameters.map((parameter) => ('name' in parameter ? parameter.name : '')).sort(),
    ).toEqual(['authorId', 'page', 'perPage', 'published', 'q', 'sort'])
    for (const parameter of parameters) {
      expect(parameter).not.toHaveProperty('required', true)
    }
    expect(parameterNamed('/api/v1/posts', 'page')).toMatchObject({
      schema: expect.objectContaining({
        type: 'integer',
        exclusiveMinimum: 0,
        maximum: 1000,
        default: 1,
      }),
    })
    expect(parameterNamed('/api/v1/posts', 'perPage')).toMatchObject({
      schema: expect.objectContaining({
        type: 'integer',
        exclusiveMinimum: 0,
        maximum: 100,
        default: 10,
      }),
    })
    expect(parameterNamed('/api/v1/posts', 'sort')).toMatchObject({
      schema: expect.objectContaining({ enum: ['newest', 'oldest'], default: 'newest' }),
    })
  })

  it('publishes post DTOs with ISO date-time strings on the wire', () => {
    const schemas = generateOpenApi().components?.schemas
    expect(schemas?.PostsPage).toMatchObject({
      required: ['items', 'page', 'perPage', 'totalItems', 'totalPages'],
      properties: {
        items: {
          items: {
            required: expect.arrayContaining(['id', 'title', 'excerpt', 'author']),
            properties: { createdAt: { type: 'string', format: 'date-time' } },
          },
        },
      },
    })
    expect(schemas?.Post).toMatchObject({
      required: expect.arrayContaining(['body', 'permissions']),
      properties: { updatedAt: { type: 'string', format: 'date-time' } },
    })
  })

  it('uses health and error DTOs for documented response bodies', () => {
    const schemas = generateOpenApi().components?.schemas
    expect(schemas?.Health).toMatchObject({
      required: ['status', 'checks'],
      properties: { status: { enum: ['ok', 'degraded'] } },
    })
    expect(schemas?.ErrorBody).toMatchObject({
      required: ['code', 'message'],
      properties: {
        code: { enum: ['UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'VALIDATION', 'RATE_LIMITED'] },
      },
    })
  })
})
