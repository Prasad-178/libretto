# Public demo access and limits

This is a scoped implementation review, not a penetration-test certification or a claim that a public application cannot be attacked.

## Who can use what

The website, YAML editor, workflow visualization, fictional knowledge and scenario library are public. These features intentionally do not require API keys. Inference requires an OpenRouter key; the shipped voice configuration additionally requires a Deepgram key. Empty or missing credentials are rejected before provider adapters are created. A nonempty but invalid model key can create an in-memory text session, but the provider rejects it when inference is attempted; a key-presence check is not user authentication.

Vercel deployments default to visitor-supplied keys even if provider environment variables are present. Enabling a shared hosted budget requires the explicit operator setting `LIBRETTO_ALLOW_HOSTED_KEYS=true`. Local development retains .env key support; `LIBRETTO_ALLOW_HOSTED_KEYS=false` forces visitor-only mode there too. With shared hosted access enabled, public visitors can intentionally consume that budget, so dedicated provider-side limits are necessary.

At the initial deployment audit for this change, Vercel production had no environment variables and public config reported both providers missing. The local development .env contains credentials; it is ignored by Git and excluded from deployment. No credential values were printed or copied into source, test fixtures or documentation. Visitor keys stay in their own WebSocket session and tab memory, are redacted from public status and cleared on connection cleanup. They are not shared with subsequent connections, placed in browser storage or included in app-generated exports.

## Application boundaries

- One connection owns one session, capped at five minutes. Key replacement does not reset that timer.
- A connection must start within 15 seconds of acceptance; failed starts do not reset the deadline.
- Text/start/key-change controls have a token bucket with a burst of three and refill of one event per second. All incoming frames have a separate burst of 128 and refill of 64 frames/second to accommodate streaming microphone audio.
- Oversized audio frames above 8,192 bytes and text frames above 128,000 UTF-8 bytes close the connection. YAML is separately bounded to 100 KB and nesting depth 20, with aliases, custom object construction and duplicate keys rejected.
- YAML cannot load Python, select provider URLs or read arbitrary files. Knowledge paths are confined to bundled examples and selectable only from the bundled allowlist. Business tools are an explicit registry of session-only transfer/capture simulations.
- The frontend renders text through React escaping. Provider errors returned to visitors use sanitized messages. No cross-session conversation store or real business delivery exists.

## Remaining public-traffic risk

The connection budgets are local controls, not a distributed per-IP limit or global spending cap. A client can open new connections. Public HTTP endpoints and WebSocket handshakes still consume hosting resources, so omitting API keys does not prevent traffic from using the free hosting quota or guarantee availability. There is no login, CAPTCHA or custom edge/IP rate-limit rule configured by this change.

Vercel provides automatic platform DDoS mitigation; it is distinct from application authorization and deployment-wide quota controls. Existing firewall settings were inspected but not modified. See [Vercel Firewall](https://vercel.com/docs/vercel-firewall) and the [OWASP WebSocket security guidance](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html) for those separate controls. No paid hosting add-on, database or security plan was provisioned.
