import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { JsonLd } from '@/components/JsonLd'

describe('JsonLd', () => {
  it('renders the data as a JSON-LD script that parses back to it', () => {
    const data = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: 'Hello',
    } as const
    const { container } = render(<JsonLd data={data} />)
    const script = container.querySelector('script[type="application/ld+json"]')
    expect(JSON.parse(script?.textContent ?? '')).toEqual(data)
  })

  it('escapes every < so a value cannot close the script', () => {
    const name = '</script><script>alert(1)</script>'
    const { container } = render(
      <JsonLd data={{ '@context': 'https://schema.org', '@type': 'Article', headline: name }} />,
    )
    const script = container.querySelector('script[type="application/ld+json"]')
    expect(script?.innerHTML).not.toContain('<')
    expect(JSON.parse(script?.textContent ?? '')).toMatchObject({ headline: name })
  })
})
