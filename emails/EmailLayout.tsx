import { Body, Container, Head, Html, Preview, Text } from '@react-email/components'
import type { CSSProperties, ReactNode } from 'react'
import { env } from '@/lib/env'

type EmailLayoutProps = {
  preview: string
  children: ReactNode
}

/** Shared frame for transactional emails. Email clients need inline styles, not CSS Modules. */
export const EmailLayout = ({ preview, children }: EmailLayoutProps) => {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          {children}
          <Text style={styles.footer}>{env.appName}</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const styles = {
  body: { backgroundColor: '#f6f6f6', fontFamily: 'Helvetica, Arial, sans-serif' },
  container: {
    backgroundColor: '#ffffff',
    margin: '40px auto',
    padding: '32px',
    maxWidth: '480px',
    borderRadius: '8px',
  },
  heading: { fontSize: '20px', fontWeight: 600, margin: '0 0 16px', color: '#111111' },
  text: { fontSize: '15px', lineHeight: '24px', color: '#333333' },
  button: {
    backgroundColor: '#111111',
    color: '#ffffff',
    borderRadius: '6px',
    fontSize: '15px',
    padding: '12px 20px',
    textDecoration: 'none',
  },
  footer: { fontSize: '12px', color: '#888888', marginTop: '32px' },
} satisfies Record<string, CSSProperties>
