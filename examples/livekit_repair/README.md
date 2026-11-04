# LiveKit repair example

Run from a source checkout with Python3.12+, uv, Node and the built Studio:

```sh
uv sync --locked
npm --prefix web ci
npm --prefix web run build
uv run python -m examples.livekit_repair
```

Open http://127.0.0.1:8000/studio. Configure `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` and `OPENROUTER_API_KEY` in the repository `.env`, or enter session-only credentials in Connection settings. The example uses AssemblyAI STT and Cartesia TTS through LiveKit Inference. Provider usage is billed to your accounts. Automated tests use synthetic speech and make no paid calls.

This is LiveKit AgentSession with custom PCM input/output through Studio's existing WebSocket transport. It does not join a WebRTC room or require a room URL. Browser playback acknowledgements, matched to message and epoch, complete the SDK output and Libretto's confirmation permit. A room-based consuming application needs a separate verified-delivery capability; the room source queue draining alone is not an acknowledgement from a listening browser.

The example reuses the [repair workflow](../repair_visit/agent.yaml), its Markdown policies and [registered booking stub](../repair_visit/tools.py). No real appointment, email, phone transfer or other business action occurs. Different requests receive different fictional receipts.

Try: ask to arrange an oven repair for Taylor at an invented address in the morning. Hear the complete details and explicitly approve them. Repeat with a corrected address, refusal, and interruption halfway through the readback. No booking should occur until the latest complete readback is delivered and approved on a subsequent turn. Verify actual receipts in State/Trace rather than trusting generated wording.

For direct provider keys or optional Deepgram, set explicit speech configuration; see docs/livekit.md for supported model choices and migration limits.
