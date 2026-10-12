// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { GET } from '@/app/api/docs/route'

describe('GET /api/docs', () => {
  it('serves standalone HTML to anonymous callers with a same-origin specification and pinned renderer', async () => {
    const response = GET()
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(response.headers.get('set-cookie')).toBeNull()
    const html = await response.text()
    expect(html).toMatch(/<!doctype html>/i)
    expect(html).toMatch(/"url"\s*:\s*"\/api\/openapi"/)
    expect(html).toMatch(
      /https:\/\/cdn\.jsdelivr\.net\/npm\/@scalar\/api-reference@\d+\.\d+\.\d+\/dist\/browser\/standalone\.js/,
    )
    expect(html).not.toContain('proxy.scalar.com')
  })
})
