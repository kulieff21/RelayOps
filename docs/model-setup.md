# OpenRouter setup and adapter

The server-side adapter, persistent spending guard and authenticated business-tool
dispatcher are implemented. The website conversation and general agent loop remain future work.
Adapter diagnostics exercise a synthetic connection tool, not business-task execution.

## Model and verified provider policy

Verified on 2026-10-10: **`openai/gpt-6-luna`** in the
[official catalogue](https://openrouter.ai/api/v1/models) and
[model page](https://openrouter.ai/openai/gpt-6-luna), with a 1,050,000-token context.
The [endpoint catalogue](https://openrouter.ai/api/v1/models/openai/gpt-6-luna/endpoints)
lists tool-capable providers. Standard OpenAI and Azure list **$0.10/M input and
$0.50/M output**. Cache-read/write rates are $0.01/$0.125/M; long-context overrides
begin at 272,000 prompt tokens. These are advertised prices, not a reliability result.

The adapter checks fresh endpoint metadata before every authenticated request. It
requires the selected exact provider tag, tools/tool_choice and an output-cap parameter.
OpenAI currently advertises max_tokens; Azure advertises max_completion_tokens. It
selects the advertised parameter rather than silently dropping the output cap.
Provider fallbacks are disabled, sibling variants excluded and price caps sent as
$0.10/M prompt, $0.50/M completion and zero per-request fees. See
[provider routing](https://openrouter.ai/docs/guides/routing/provider-selection).
OpenAI automatic prompt-cache writes are disabled using explicit mode without
breakpoints; see [prompt caching](https://openrouter.ai/docs/guides/best-practices/prompt-caching).

## Configuration and persistent ceiling

Copy `.env.example` to ignored `.env` and supply a server-side key. Never put it in
a VITE_ variable. The ordinary HTTP server works without provider credentials and
does not make inference calls on startup.

```dotenv
OPENROUTER_API_KEY=
OPENROUTER_MODEL=openai/gpt-6-luna
OPENROUTER_PROVIDER=openai
OPENROUTER_MAX_OUTPUT_TOKENS=512
OPENROUTER_TIMEOUT_MS=30000
OPENROUTER_BUDGET_USD=1
OPENROUTER_EVALUATION_BUDGET_USD=0
```

Model/provider IDs are configurable without code changes, subject to the same
verified tool support and low-price policy. Output configuration is 64–2048 tokens;
the total metadata/completion deadline is 1–60 seconds. Requests have at most 32
messages, 16 tools and 16,000 serialized input bytes; responses are capped at 1 MB.
There are no automatic paid retries. Errors omit provider bodies, requests and keys.

**$1 total** is shared across development and initial live tests, across sessions,
models and calls. Evaluation remains disabled. The separate ignored
`runtime/model-budget.sqlite` ledger survives application restart and business-demo
reset. Preserve it in backups; deleting the ledger loses accounting history.
The saved ceiling may be reduced but cannot silently increase; configuration also
rejects a value above $1. There is no automatic reservation-expiry or reset command.

Each request atomically reserves a conservative full-context cost using all advertised
cache/long-context rates, capped output, per-request fees and a 10% margin. Reservations
above $0.30 are refused. A current Luna request reserves about $0.29 until billing is
known. Missing cost, timeout, transport errors, non-2xx and incomplete bodies leave the
reservation held. Only known usage.cost settles it, rounded upward to integer micro-USD.
Known zero remains zero; absent usage/cost remains null. A billing overrun is recorded
and stops future calls. See [usage accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting).

This controls calls through RelayOps, assuming advertised provider pricing/token caps
are honored. It does not alter the OpenRouter account/key limit or account for unrelated
key use. The adapter never grants business authority; future tool dispatch must validate
arguments and derive identity from authenticated server context, following the
[tool-calling contract](https://openrouter.ai/docs/guides/features/tool-calling).

## Verification commands

```sh
npm run model:verify           # public metadata only, no key or inference
npm run check                  # unpaid mocked tests and application checks
npm run model:smoke -- --live  # explicitly paid: at most two completion requests
```

The live smoke forces a synthetic connectionProbe, validates its exact nonce, records
the local diagnostic result, sends it back to the model and checks a final acknowledgement.
It halts on unconfirmed billing or failure. It stores a live adapter_smoke run and actual
usage/tool records in the business database, and selected evidence under ignored
artifacts/model/live-smoke.json. It does not reserve stock, create orders or purchase
anything. The result is a connection/capability check, not an implemented business agent.

## Recorded live check (2026-10-10)

The bounded tool round trip passed with standard OpenAI: 86 input / 19 output tokens
for the forced probe, then 149 input / 31 output for the acknowledgement. Recorded
rounded costs were 19 and 31 micro-USD. Two earlier schema-diagnostic attempts cost
19 micro-USD each; their independently confirmed costs are retained. Total recorded
spending is **88 micro-USD ($0.000088)**, with zero held funds and $0.999912 remaining.
Each cost is rounded upward per call; these totals are conservative accounting values.

The provider adds metadata to tool-call objects. The adapter normalizes this metadata
while validating and retaining only ID, type, function name and arguments. An unpaid
fixture reproduces this behavior. Usage observations occur before the authenticated
request and after independently parsed billing, so invalid model responses still retain
known charges. The first diagnostic's token counts remain unknown; its recovered cost
comes from the persistent ledger, not an invented token estimate.

This is one synthetic successful round trip plus two diagnostic failures, not evidence
of business-agent reliability, order automation or model performance gains.
