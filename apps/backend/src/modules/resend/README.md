# Resend notification provider

Issue #137 sends Customer verification emails through [Resend](https://resend.com)
on the `email` channel. The provider extends `AbstractNotificationProviderService`
and sends with the `resend` package. The sending domain `corral.dk` is verified in
Resend's EU region.

## When it is used

`medusa-config.ts` registers this provider for `email` only when `RESEND_API_KEY`
is set. Without it, the backend keeps `notification-local`, which only logs. Local
development and automated tests therefore never send real mail.

| Variable            | Purpose                                                      |
| ------------------- | ------------------------------------------------------------ |
| `RESEND_API_KEY`    | Resend API key. Read only from the environment, never in Git |
| `RESEND_FROM_EMAIL` | Optional sender. Defaults to `MTogo <noreply@corral.dk>`     |

## Templates

| Template                | Data                                         |
| ----------------------- | -------------------------------------------- |
| `customer-verification` | `verification_url`, `expires_at`, `language` |

The email is Danish unless `data.language` is `en`. It contains the verification
link and the expiry time in Danish time. Any other template fails with an error.

## Failures

A failed send logs the template, the recipient's domain and Resend's error
message. It never logs the token, the link, the full address or the API key. The
provider then throws `email_delivery_failed`, so the verification step fails as
before.
