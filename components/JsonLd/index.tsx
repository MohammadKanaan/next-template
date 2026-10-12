import type { Thing, WithContext } from 'schema-dts'

type JsonLdProps = {
  /** Built by `lib/structuredData`. */
  data: WithContext<Thing>
}

/**
 * Structured data for search engines, as a JSON-LD script. `JSON.stringify` does not escape HTML,
 * so every `<` becomes `<`: a title or body holding `</script>` cannot close the tag.
 */
export const JsonLd = ({ data }: JsonLdProps) => {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  )
}
