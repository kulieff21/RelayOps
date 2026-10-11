# Observe/action/result execution loop

`src/agent/loop.ts` implements the server-only 09.09/09.10 loop and explicit terminal outcomes over the existing OpenRouter
adapter and authenticated tool dispatcher. It is an internal module, not a conversation
endpoint or a connected website assistant. Server startup does not invoke it.

## Invocation

```ts
const loop = new AgentLoop(openRouter, new ToolDispatcher(business, auth));
const result = await loop.run(
  {
    agent: "customer",
    sessionToken: tokenFromAuthenticatedRequest,
    locale: "az",
  },
  { userText: "Check the stored availability of RelaySwitch 24G." },
);
```

Construct `openRouter` with the existing validated configuration and persistent
`runtime/model-budget.sqlite` ledger. Never construct a new spending pool per run.
The interface permits injecting scripted completions or synthetic HTTP for unpaid
tests. The example is not a command that runs automatically or a new paid diagnostic.

Each invocation starts with one trusted system instruction and one user message.
The caller cannot supply arbitrary conversation history or system messages. Context
is validated and captured by ToolDispatcher; session tokens and account roles are
not forwarded to the model. Canonical English instructions in `src/agent/prompts.ts`
select English/Azerbaijani responses from authenticated application context, explain
the sandbox and require stored evidence, clarification and human confirmation.
Procurement instructions include the server-bound case ID, never a model-created scope.

## Execution

1. Recheck the session and current roles, refresh instructions/tool definitions and
   validate the whole outgoing context before any provider call.
2. Observe the adapter completion. Check finish reason, normalized calls, advertised
   tool names and unique IDs before dispatching any call in the batch. IDs cannot be
   reused within the same invocation.
3. Recheck authentication after inference, including for text-only replies. Execute
   calls sequentially through the existing dispatcher and retain their typed results.
4. Send each exact result back as a `tool` message with the matching `tool_call_id`.
   Ordinary argument/domain rejections remain explicit observations the model may
   correct. Authentication failures and unexpected tool exceptions halt execution.
5. Repeat until a validated terminal outcome, human-confirmation request or bounded stop.

The loop defaults to four model iterations; server callers may select one through
eight. A batch contains at most eight calls. Each request retains the adapter's
32-message/16 KB input boundary and per-call deadline/output-token/spending controls.
Oversized results or growing context stop without truncating business evidence or
making a further provider request. Failed requests are never automatically retried.
Aggregate run deadlines/token limits and a classified retry policy remain 09.11/09.12.

## Returned evidence and boundaries

- `completion` closes the current assistant turn with a message and one or more
  successful tool call IDs from this invocation. It does not complete a business process.
- `clarification` carries a concrete question, unique missing-field identifiers and
  optional references to this invocation's successful or rejected tool results.
- `escalation` carries a message, a controlled reason and optional local evidence IDs.
  Its queue is server-derived: customer_support or procurement_review. Handoff state
  is explicitly not_created; this outcome creates no ticket, notification or approval.
- `confirmation_required` returns the dispatcher's validated pending action and stops
  before later calls in that batch or any additional inference. It grants no consent
  or eligibility guarantee. A future human-confirmation flow must use and revalidate
  the existing authenticated business routes.
- `stopped` returns a stable error code and independent correlation ID. Empty or
  truncated replies, invalid calls, authority loss, limits and provider failures
  cannot become successful responses. Unexpected errors omit private details.

Final text must be exactly one JSON object matching `src/shared/agent-outcome.ts`.
Canonical prompts embed its JSON schema and ask for localized message/question text;
status, reason, field identifiers and evidence IDs remain stable in both locales.
The adapter needs no new response-format parameter or provider capability. The loop
validates the response itself; arbitrary prose, Markdown fences, malformed/extra fields,
unknown outcomes and duplicate/missing identifiers are not silently treated as completion.
Invalid structure yields AGENT_OUTCOME_INVALID. Invented/previous-run evidence, rejected
completion evidence or pending/skipped references yield AGENT_EVIDENCE_INVALID.

Completion requires at least one real successful tool result. With no actionable request
or missing requirements, ask for clarification; unsupported requests can be escalated.
The no_feasible_quote reason requires citing the latest successful compareQuotes result
in this invocation with actual clarification_or_escalation data. A feasible or uncited
later comparison invalidates that reason. Other reason labels are model requests for
review, not server proof of a policy exception. No model-created handoff destination,
identity, role, consent flag or business-completion assertion is accepted.

For example, a clarification before tools can return:

```json
{
  "status": "clarification",
  "question": "How many units and by which date?",
  "missingFields": ["quantity", "deadline"],
  "evidenceToolCallIds": []
}
```

Confirmation-required results take precedence over terminal-looking text in a tool-call
response. Unexpected/system failures remain stopped; they are not model-selected
escalation. Neither clarification nor escalation resumes automatically or mutates the
business database. A future caller must gather human input and use authenticated routes.

All results carry attempted model iteration counts and separate `steps`. Each step
contains the adapter completion/usage, exact typed tool results and IDs of calls
skipped after a stop. A prepared order summary remains recorded if later inference
fails; no retry or rollback claim erases that committed business effect. Model prose
is kept apart from tool evidence and is never used to authorize an order mutation.
In-flight failures still use the adapter's durable billing ledger and usage observer;
the loop does not invent usage for a failed call or convert unknown values to zero.

These traces are internal and invocation-local. Do not expose them as public API
payloads: they may include owned order details, model prose and proposed action inputs.
There is no persistent run/conversation checkpoint, replay, resume or atomic transaction
across a tool batch. Calls following confirmation are explicitly skipped, not executed
in the background. Durable state/tool-result storage belongs to 09.13/09.14.

## Verification

Eighteen unpaid tests in `test/agent.test.ts` exercise real isolated SQLite services,
scripted model completions and the real OpenRouter adapter with synthetic HTTP. They
cover multiple iterations/batched calls, EN/AZ instructions, deterministic quotation
evidence, preparation followed by confirmation, unexecuted cancellation/return,
argument correction, customer/case scope, duplicate IDs, inconsistent replies,
iteration/context bounds, logout/expiry/role revocation during inference, empty/truncated
replies, provider failures without retries, transaction rollback and concurrent run
isolation. The adapter round trip retains known zero usage/cost independently of tools.

No paid general-loop call, named-demo mutation, Telegram message or website conversation
was used to verify this stage. Ten additional unpaid tests in `test/outcomes.test.ts` cover the three outcomes,
EN/AZ questions, actual successful/rejected evidence, strict schema/authority rejection,
invented/cross-run IDs, feasible/no-feasible/superseded comparison evidence, server queue
binding even after caller-object changes, confirmation precedence, session revocation
and independently retained known billing for invalid terminal JSON. No paid call or
named-demo mutation was used. Evidence references are validated; arbitrary prose can
still misdescribe that evidence. These tests do not establish live model reliability,
semantic grounding of every sentence or general prompt-injection resistance.
