# OpenRouter setup and adapter

The server-side adapter, persistent spending guard and authenticated business-tool
dispatcher, bounded agent loop and durable conversation/run recovery are implemented.
The [website customer assistant](customer-assistant.md) is connected. Adapter and read-only agent diagnostics
have separate scopes; neither is a business-task performance evaluation.

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
ASSISTANT_LIVE_ENABLED=false
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
key use. The adapter never grants business authority; implemented tool dispatch validates
arguments and derives identity from authenticated server context, following the
[tool-calling contract](https://openrouter.ai/docs/guides/features/tool-calling).

## Verification commands

```sh
npm run model:verify           # public metadata only, no key or inference
npm run check                  # unpaid mocked tests and application checks
npm run model:smoke -- --live  # explicitly paid synthetic adapter diagnostic: at most two calls
npm run agent:smoke -- --mock  # unpaid deterministic business-tool loop and cached resume
npm run agent:smoke -- --live  # explicitly paid read-only business-tool loop: at most two calls
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

## Recorded business-tool loop check (2026-10-11)

After all 111 unpaid tests and the deterministic mock smoke passed, an explicitly
bounded live Conversations run used the existing shared ledger. Fresh endpoint metadata
was verified before each request. The diagnostic allowed only searchProducts, forced
one real RelaySwitch catalog read and then required a strict completion with tools disabled.
It persisted the real tool result, actual usage, terminal outcome and conversation.
Authenticated cached resume returned the same outcome with no extra inference.

| Request                             | Input tokens | Output tokens | Rounded cost (micro-USD) |
| ----------------------------------- | -----------: | ------------: | -----------------------: |
| Real catalog tool call              |          886 |            23 |                      101 |
| Evidence-backed terminal completion |        1,033 |           132 |                      170 |

The completion correctly described the recorded 24-port managed non-PoE switch with
zero available and zero incoming stock. No order, stock, shortage, approval or purchasing
mutation occurred. Reference case fixture-006 remains open with 12 missing and its
4,580 AZN accepted sale total. Mock and live diagnostic records are labelled separately.

The two new requests cost **271 micro-USD ($0.000271)**. Across all six recorded live
requests, total known spending is **359 micro-USD ($0.000359)**, held funds are zero
and remaining budget is **$0.999641**. Evaluation remains disabled at USD 0. The original
ledger and named business demo were preserved; no reset or budget renewal occurred.
Evidence is local under artifacts/model/agent-live-smoke.json and agent-mock-smoke.json.
This single read-only round trip establishes tool/loop/persistence capability, not
reliability across business tasks, semantic accuracy in general or measurable AI gains.

## Recorded website live turn (2026-10-11)

After 128 unpaid tests and the isolated EN/AZ browser review, one explicitly selected
live website request queried the real RelaySwitch catalog in Azerbaijani. Unlike the
earlier forced-tool diagnostic, this used the ordinary authenticated customer HTTP
queue/poll path and full customer tool definitions. It selected searchProducts and
returned a strict completion describing the stored 24 ports, no PoE and zero available/
incoming units. Fresh endpoint verification preceded both requests. Repeating the HTTP
request and explicitly resuming its cached outcome caused no further inference.
Orders, lines, reservations, cases, fulfillment, returns, movements and product stock/
price/spec records remained unchanged. Only conversation/run/tool/usage evidence was added.

| Request                         | Input tokens | Output tokens | Rounded cost (micro-USD) |
| ------------------------------- | -----------: | ------------: | -----------------------: |
| Customer catalog selection      |        1,847 |            27 |                      199 |
| Azerbaijani terminal completion |        2,013 |           121 |                      262 |

This turn cost **461 micro-USD ($0.000461)**. The original ledger now contains eight
live requests, **820 micro-USD ($0.000820)** known, zero held and **$0.999180** remaining.
Evaluation stays disabled. A reporting-only SQL column typo occurred after all turn/
retry/no-mutation assertions passed; reporting was recovered from the same persisted
run with no new inference. Local evidence: artifacts/model/customer-live-smoke.json.
This single read verifies the connected path, not general customer-task reliability.
