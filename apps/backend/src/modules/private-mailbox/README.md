# Private mailbox provider

The notification module persists captured email messages. This provider accepts
delivery without logging recipients, message contents, or security links. It is
used when Resend is not configured; it sends no external email. Disposable tests
can inspect messages through the key-protected test mailbox endpoint.
