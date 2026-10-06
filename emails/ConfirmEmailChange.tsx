import { Button, Heading, Section, Text } from '@react-email/components'
import { EmailLayout, styles } from './EmailLayout'

export type ConfirmEmailChangeProps = {
  name: string
  newEmail: string
  url: string
}

/** Sent to the current address: the owner of the account approves moving it to `newEmail`. */
export const ConfirmEmailChange = ({ name, newEmail, url }: ConfirmEmailChangeProps) => {
  return (
    <EmailLayout preview="Confirm your email change">
      <Heading as="h1" style={styles.heading}>
        Confirm your email change
      </Heading>
      <Text style={styles.text}>
        {`Hi ${name}, you asked to change the email on your account to ${newEmail}. Confirm to continue; we will then send a verification link to the new address.`}
      </Text>
      <Section>
        <Button href={url} style={styles.button}>
          Confirm change
        </Button>
      </Section>
      <Text style={styles.text}>
        Or open this link: <a href={url}>{url}</a>
      </Text>
      <Text style={styles.text}>
        If you did not ask for this, ignore this email and your address stays as it is.
      </Text>
    </EmailLayout>
  )
}
