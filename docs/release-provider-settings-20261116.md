# Admin-managed image provider settings

Administrators can configure an OpenAI-compatible HTTPS API base URL, image
model, optional craft-notes model, and API key from System Settings. Changes
apply to subsequent provider requests. Leaving the key empty preserves the
existing key; a separate action explicitly clears it.

Provider credentials are encrypted with AES-256-GCM before being saved in the
existing system configuration table. The encryption key is held in the
server-only `NAIL_CONFIG_ENCRYPTION_KEY` environment variable. Back up and
preserve that variable with the database: losing or rotating it makes saved
provider credentials unreadable. Admin reads expose only whether a key exists;
the value and encrypted ciphertext are excluded from responses and audit rows.

External base URLs must use HTTPS; the existing internal gateway at
`http://nail-gateway:3000/v1` is also supported. URLs must not contain user info,
query parameters, or fragments. `/v1` is appended when omitted. The image model uses
the configured endpoint's `/images/edits` route. The optional notes model uses
`/chat/completions`; leaving it blank disables craft notes.

Validation: 31 unit and integration tests, including encryption-at-rest,
redaction, authorization, key retention/clearing, URL validation, and mocked
image/chat requests. Existing gateway settings and disabled craft notes are
preserved on the first administrator save. Desktop/mobile browser tests passed
against an isolated QA database, including reload persistence, explicit key
clearing, interrupted polling recovery, one submission, and 1K/4K repeat billing.
`npm run build` passed with TypeScript checks. No paid provider calls were made.
