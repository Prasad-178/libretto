# Realistic fictional testing and public-access boundaries

Keep the receptionist graph and provider-neutral engine. Recast the bundled business as Northline Workspace, a fictional coworking reception desk. Seed consistent public facts about memberships, rooms, support, cancellations and accessibility. Add caller scenarios with clearly fictional contact details, scripted turns, expected sources/tool outcomes and manual checks. Scenario selection only prepares input and simulated transfer outcome; it must never start paid requests automatically or inject expected answers into agent context.

Keep the site/editor/knowledge public. Public Vercel deployments must require visitor keys by default even if provider environment variables are accidentally configured; an explicit operator opt-in may enable the previously planned hosted budget. Preserve local .env development behavior. Add missing-key/no-provider-call tests, a fixed pre-start socket deadline, bounded control request frequency and frame-size enforcement. Do not claim these are distributed DDoS protection.

Verified baseline: public config reports both keys missing; Vercel production has no environment variables. Keyless text/voice starts return missing-key errors; a placeholder OpenRouter key still requires a Deepgram key for voice, with no inference call. Local .env contains development keys, excluded from Git and deployment; never print/copy them. Public probes of secret/source paths returned no sensitive content (currently 500, not disclosure).

Review the security scope using the security-review skill and current primary documentation. Vercel platform DDoS mitigation is distinct from app access checks. No firewall draft or live rule changes are part of this implementation: the firewall skill requires users to publish staged rules, and no such rule should be represented as active.

Verify data/fixture consistency, RAG source retrieval, scenario UI behavior, credential policy, limits and all existing runtime tests. Commit coherent changes and deploy the tested batch. Paid live API test runs require deliberate user initiation; guided scenarios are manual expectations, not fabricated model-evaluation passes.

## Verified outcome

Implemented in `92590ac`, `25f67ff`, `c6db3cf` and `5e90daa`.

- The final fixture corpus contains 15 guided scenarios, four knowledge documents and three fictional departments. Tests check scenario consistency and source-backed business facts. Browser checks verified expanding scripts, preparing lines, advancing a draft without connecting, and the explicit visitor-key dialog.
- A fresh independent review found a contextual retrieval defect in two actual script sequences. Reproduced it with real Session turns and controlled providers, then fixed search to weight current-question terms above prior-user context. Both failing sequences now receive the required £32 room price / 24-hour policy in the composed model prompt. No classifier request was added.
- 74 backend tests and 23 frontend tests pass. Ruff, TypeScript/Vite production build and whitespace checks pass. The clean Vercel build also passes.
- A value-based scan confirmed local development credentials are absent from tracked files and generated frontend assets; an excluded-company identifier scan found no matches. No credential values were printed or copied.
- Application head `5e90daa` deployed as `dpl_Bk1roMcUYgSFto47Mc7DAXbNj22e`, aliased to https://libretto.prasadjs.me. Public config reports visitor-only mode, both hosted keys missing and all 15 scenarios. Homepage/assets return 200.
- Public WSS checks rejected keyless text/voice starts and a voice start missing its selected speech key before any provider request. An 8,193-byte frame was rejected with a 1009 close; an idle pre-start connection expired with 1008. No paid inference was initiated by these checks.
- No custom firewall rules were staged/published or paid security resources added. Existing Vercel protections remain unchanged. Connection-level bounds do not prevent distributed traffic from consuming hosting quota; that limitation is documented explicitly.

Manual live model/voice execution of the scripts remains deliberate user-initiated testing, with API keys and provider billing. Expected outcomes are not fabricated pass/fail results. Acoustic latency and a model-quality score are not claimed.
