# OpenRouter model preparation

Verified on 2026-10-10. This records model/budget selection; the adapter, agent loop
and website conversation are not implemented yet. No inference call was made.

## Model and capability verification

The suggested "Luna 6" resolves to **`openai/gpt-6-luna`**, named OpenAI: GPT-6 Luna in
the [official catalogue](https://openrouter.ai/api/v1/models) and
[model page](https://openrouter.ai/openai/gpt-6-luna).
Use this identifier rather than a latest-family alias. It has a 1,050,000-token context
window; catalogue support includes `tools`, `tool_choice`, `response_format`,
`structured_outputs` and reasoning controls. This is advertised capability, not
evidence of RelayOps agent reliability.

The [endpoint catalogue](https://openrouter.ai/api/v1/models/openai/gpt-6-luna/endpoints)
independently lists tool-capable OpenAI, Azure and Amazon Bedrock routes. Standard
OpenAI and Azure list **$0.10 per million input tokens and $0.50 per million output tokens**.
Cache-read/write prices are $0.01/$0.125 per million; long-context price overrides
begin at 272,000 prompt tokens. Provider variants can charge different rates. Keep
initial requests small and verify metadata again before live use.

Function calls are requests for application code to execute; the model does not
gain direct authority over business services. Follow the official
[tool-calling guide](https://openrouter.ai/docs/guides/features/tool-calling), validate
arguments and derive roles/customer identity from the authenticated server context.
The future adapter must require parameter support and constrain provider prices;
see [provider routing](https://openrouter.ai/docs/guides/routing/provider-selection).

## Local configuration and budget

`.env` is ignored. Credentials remain server-side; `.env.example` contains a blank
key field and the selected model. Do not use a `VITE_` variable for the API key.
Current preparation settings are not consumed by an inference adapter yet:

```dotenv
OPENROUTER_MODEL=openai/gpt-6-luna
OPENROUTER_BUDGET_USD=1
OPENROUTER_EVALUATION_BUDGET_USD=0
```

The authorized ceiling is **$1 total** across development and initial live smoke
tests, not $1 per call or session. Evaluation spending is disabled until a sample
and allocation are selected; it must not silently create another spending pool.
These values record the policy, not an implemented spending guard or a changed
OpenRouter account/key limit. Implement persistent spend reservations, bounded
tokens/time/retries and conservative handling of unknown charges before inference.

## Reproduce the public metadata check

```sh
npm run model:verify
```

This performs unauthenticated GET requests to the official model/endpoint APIs and
checks the exact ID and tool parameters. It records selected public metadata under
ignored `artifacts/model`; it sends no key and does not test key validity, model
output, latency or agent execution. Ordinary application tests remain unpaid.
