import { Button, Heading, Section, Text } from '@react-email/components'
import { EmailLayout, styles } from './EmailLayout'

export type VerifyEmailProps = {
  name: string
  url: string
}

export function VerifyEmail({ name, url }: VerifyEmailProps) {
  return (
    <EmailLayout preview="Confirm your email address">
      <Heading as="h1" style={styles.heading}>
        Confirm your email address
      </Heading>
      <Text style={styles.text}>
        {`Hi ${name}, confirm your email to finish setting up your account.`}
      </Text>
      <Section>
        <Button href={url} style={styles.button}>
          Verify email
        </Button>
      </Section>
      <Text style={styles.text}>
        Or open this link: <a href={url}>{url}</a>
      </Text>
      <Text style={styles.text}>If you did not create an account, you can ignore this email.</Text>
    </EmailLayout>
  )
}
