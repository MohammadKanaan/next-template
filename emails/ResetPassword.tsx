import { Button, Heading, Section, Text } from '@react-email/components'
import { EmailLayout, styles } from './EmailLayout'

export type ResetPasswordProps = {
  name: string
  url: string
}

export function ResetPassword({ name, url }: ResetPasswordProps) {
  return (
    <EmailLayout preview="Reset your password">
      <Heading as="h1" style={styles.heading}>
        Reset your password
      </Heading>
      <Text style={styles.text}>
        {`Hi ${name}, we received a request to reset your password. The link expires in one hour.`}
      </Text>
      <Section>
        <Button href={url} style={styles.button}>
          Choose a new password
        </Button>
      </Section>
      <Text style={styles.text}>
        Or open this link: <a href={url}>{url}</a>
      </Text>
      <Text style={styles.text}>If you did not ask for this, you can ignore this email.</Text>
    </EmailLayout>
  )
}
