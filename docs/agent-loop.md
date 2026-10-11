# Agent execution and durable conversations

Phase 09 implements a server-only observe/action/result loop, strict outcomes, bounded
execution and authenticated durable conversations. Phase 10 connects the website through
the scoped [customer assistant](customer-assistant.md). Telegram, purchasing workers and
approval executors remain later stages. Startup, check and CI never make paid requests.

## Invocation and explicit modes

```ts
const conversations = new Conversations(store, dispatcher, {
  mode: "mock",
  id: "relayops/deterministic-mock",
  adapter: new MockModel({ scenario: "catalog", query: "RelaySwitch" }),
});
const turn = await conversations.start(
  { agent: "customer", sessionToken: authenticatedToken, locale: "az" },
  { userText: "Check the stored switch availability." },
);
const cached = await conversations.resume(context, turn.runId);
const followUp = await conversations.start(
  context,
  { userText: "My next requirement." },
  turn.conversationId,
);
```

For live mode, explicitly select an OpenRouter adapter backed by the existing shared
`runtime/model-budget.sqlite`. Never create a budget per run. A live failure never
silently becomes a mock success. The mock adapter requires no key/network/ledger and
supports deterministic catalog, quotation and clarification demos plus scripted fixtures.
Its functional response is deterministic for identical inputs; attempt UUIDs identify
separate executions. Mock cost is known zero; provider token counts remain null because
no provider tokenization occurred. The run record labels mock/live explicitly.

Callers provide user text and trusted application context, never arbitrary history,
roles or system messages. Conversations owns history and binds its account, agent mode
and procurement case. Selected locale can change between turns/resume without losing
the conversation. Canonical English instructions select EN/AZ replies and sandbox,
evidence, clarification and human-confirmation rules. Tokens and account roles are not
sent to the model or persisted in checkpoints. User text itself is stored as user data.

## Execution and limits

Before each request the loop reauthenticates, refreshes definitions/instructions and
validates the outgoing context. It normalizes/validates the completion, rechecks
permissions after inference, validates the entire batch and dispatches tools sequentially.
Exact typed tool results are sent back with matching IDs. A duplicate ID in the current
run, unadvertised function, inconsistent finish reason, empty/truncated reply or malformed
outcome cannot become success. Ordinary argument/domain rejections may be corrected.

| Run option      | Default | Allowed maximum |
| --------------- | ------: | --------------: |
| maxIterations   |       4 |               8 |
| maxTimeMs       |  60,000 |         120,000 |
| maxTokens       |  64,000 |         128,000 |
| maxOutputTokens |     512 |           2,048 |
| maxRetries      |       1 |               2 |

Iterations include failed catalogue attempts. A batch has at most eight calls. Requests
retain the adapter's 32-message and 16,000-byte bounds. Output caps use the smaller of
adapter configuration and the run cap. A run-wide AbortSignal covers metadata, completion
and retry backoff; a timeout race also prevents late replies from executing tools if a
model implementation ignores cancellation. Limits are checked between synchronous tools.
SQLite transactions cannot be preempted halfway; an already committed tool remains
recorded if a subsequent boundary detects elapsed time.

Token admission reserves serialized input bytes + 1,024 framing units + the output cap.
This is a conservative allowance, not an exact provider tokenizer measurement. After a
response, known input/output counts replace that allowance in the run total; missing
counts consume the full allowance and remain null in usage records. Further requests
are refused if their allowance would exceed maxTokens. Reported aggregate/output
overruns stop before tool execution. Provider input counts are only known afterward;
this policy cannot promise an exact pre-billing input-token ceiling if a provider's
reported count exceeds the allowance. Independent input/output and spending caps apply.

The elapsed execution budget and iteration/token/retry counters persist across resume;
time while the process is offline does not consume active execution time. In-flight
model requests interrupted by a crash are stopped, never reissued.

## Classified retries

One shared run retry counter bounds metadata and tool retries. Only catalogue GET
failures, which occur before any billable POST/reservation, are provider-retry eligible.
Backoff is 100/200 ms and consumes the aggregate deadline/iteration budget. No retry for
ambiguous completion transport/non-2xx/body failures, authentication/credit errors,
invalid model prose or unknown charges. Their reservations remain held in the shared
ledger until independently known billing is available.

SQLite BUSY/LOCKED tool failures can retry after rollback. The durable service wraps
effect, audit, evidence and checkpoint in one synchronous transaction; nested business
transactions use savepoints. Outer transaction lock failures also retry with backoff.
An exhausted transient error stops later calls. Argument/domain failures are model
observations, not automatically repeated writes. Unexpected tool errors halt execution.
No SQL transaction spans a model request or retry wait.

## Outcomes and human boundaries

Final text must be exactly one object matching `src/shared/agent-outcome.ts`; no fences,
extra fields or arbitrary prose. Canonical prompts embed its schema. Message/question
text follows locale; status, reason, missing fields and evidence IDs are stable.

- completion closes this assistant turn and requires successful current-run tool IDs.
  It does not complete a business process or prove every sentence is semantically grounded.
- clarification carries a concrete question, unique missing fields and optional real
  successful/rejected evidence. Supply new human input through start in the same conversation.
- escalation carries a controlled reason and optional evidence. The queue is selected
  by the server (customer_support/procurement_review) with handoff state not_created.
  The internal loop creates no ticket, notification or approval; the website service
  persists its support handoff after this outcome. no_feasible_quote requires the latest
  successful deterministic comparison with actual clarification_or_escalation evidence;
  a later feasible comparison invalidates it.
- confirmation_required stops before remaining calls or inference. It is a proposal,
  not customer consent. Cached resume returns it without executing skipped tools. A
  website human action uses a run-bound decision route, which revalidates ownership,
  version, expiry and business state through the existing authenticated business services.
- stopped carries a stable error code and independent correlation ID, without provider
  bodies, SQL details, credentials or private exception text.

Previous-turn evidence IDs do not authorize completion in a new run. Pending/skipped,
invented and rejected completion references are refused. Customer mode stays customer-only
for multi-role accounts; procurement remains bound to one real case/order.

## Persistence and recovery

Migration 003 adds agent_conversations and agent_execution without changing applied
migration checksums. Conversation history stores user/outcome messages, including
clarification and pending-action summaries; it does not leave dangling tool-call pairs
between turns. Active execution stores the exact working transcript, phase, batch cursor,
seen IDs, counters and traces. Private state is internal and is not a public API payload.

Tool evidence is separately recorded in tool_calls, with a run-scoped storage ID and
original tool ID in correlation_id/result. Model usage is separately recorded in
model_usage. Checkpoints include recoverable copies of observations; business audit
remains an independent append-only trail. Procurement runs link to case-scoped diagnostic
process records without advancing or completing the purchasing business process. Existing
staff read views expose only selected status/tool/usage fields, never transcripts.

Only one unfinished run owns a conversation. Transactions claim a 150-second lease,
longer than the maximum active run deadline; checkpoints renew it. After an actual crash,
resume waits for lease expiry and checks fresh authentication, account/mode/case and the
original model/mode binding. A completed outcome is returned unchanged without inference.
A tools/ready checkpoint continues from the stored cursor and limits. A model_pending
checkpoint yields AGENT_INTERRUPTED_MODEL_CALL: even a received response might not have
been durably observed, so it is never paid for again automatically. Terminal tool results
committed just before a crash still enforce their stop boundary on recovery.

Each tool's business effect, audit, typed evidence and next cursor commit together.
Evidence/checkpoint failure rolls the business effect back. A prepared offer already
committed in an earlier tool remains present if later inference fails. This is not a
transaction over a whole batch, an external-provider exactly-once guarantee, a leased
business worker or an automatic recovery scheduler.

Usage observations persist the actual attempt with null values before billable POST,
and independently update known tokens/cost afterward, even for invalid terminal output.
Null never becomes an invented zero and later null observations never erase known values.
Lost/unknown requests retain held spending across restart and business reset. All live
requests use the same original USD 1 ceiling; evaluation stays disabled at USD 0.

## Verification

The previous 18 loop and 10 outcome tests remain, together with 20 new unpaid execution
tests. Coverage includes aggregate admission/output/time limits, abort-ignoring models,
bounded catalogue/SQLite retries, rollback of evidence failures, concurrent ownership,
locale/history/cross-run evidence, null/zero/known/unknown usage and spending preservation.
Three child-process fixtures exit after real commits: offer preparation, confirmation
and an in-flight model marker. Reopening the database verifies remaining-batch recovery,
no duplicate offer/audit, no skipped action and no paid replay.

```sh
npm run check
npm run agent:smoke -- --mock  # deterministic real catalog tool, no inference charge
npm run agent:smoke -- --live  # explicitly paid: at most two completion requests
```

The diagnostic restricts live inference to one real searchProducts read and a strict
terminal completion, persists actual usage/evidence and verifies cached resume. It makes
no stock/order/purchasing mutation. Generated evidence stays under ignored artifacts/model.
See model-setup.md for recorded live costs. One smoke is capability evidence, not a
reliability benchmark, AI-benefit evaluation or general prompt-injection guarantee.
