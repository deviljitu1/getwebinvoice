# Invoice assistant

The static form remains usable without AI. The assistant uses a Netlify Function to call Groq, validates the returned edits, and applies them to the editable form. Totals and PDF generation remain local. No database is used.

## Deployment

- Netlify builds with `node scripts/build.cjs` and publishes `dist/`.
- Set `GROQ_API_KEY` as a **secret production environment variable** in Netlify, available to Functions. Never put it in source, browser JavaScript, GitHub files, or `netlify.toml`.
- Optionally set `GROQ_MODEL` (default: `openai/gpt-oss-20b`; requires strict structured-output support).
- Optionally set `INVOICE_AI_ACCESS_CODE` to restrict assistant use. Enter that code in the assistant's access section. Without it the endpoint is public, with a configured Netlify limit of 10 requests/minute per IP/domain. Check the deploy log to verify Netlify accepted the rate-limit rule. This is not a global spending cap.
- Redeploy after changing environment variables. A key previously shared in chat should be rotated in Groq and replaced in Netlify.

## Validation

Run `node tests/invoice.test.cjs` and `node tests/assistant.test.cjs`. Build with `node scripts/build.cjs`. API keys are not needed for these tests; provider calls are mocked.

## Usage

Describe the client, service, brands, unit or package prices, tax/discount and advance terms. Follow up with changes such as “add another brand” or “client paid another ₹5,000.” The assistant asks for uncertain details. Review its questions and the invoice before downloading.

Existing service presets are extracted from the form during the build and supplied to the assistant. Named presets reuse their listed prices unless you explicitly override them.

Undo preserves newer manual edits. Conflicting edits made while a request is pending require explicit application. Only the current invoice and up to eight recent conversation messages are sent to Groq when submitting a request. Conversation and form state stay in memory and reset on reload.
