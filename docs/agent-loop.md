# Observe/action/result execution loop

`src/agent/loop.ts` implements the server-only 09.09 loop over the existing OpenRouter
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
5. Repeat until a text response, human-confirmation request or bounded stop.

The loop defaults to four model iterations; server callers may select one through
eight. A batch contains at most eight calls. Each request retains the adapter's
32-message/16 KB input boundary and per-call deadline/output-token/spending controls.
Oversized results or growing context stop without truncating business evidence or
making a further provider request. Failed requests are never automatically retried.
Aggregate run deadlines/token limits and a classified retry policy remain 09.11/09.12.

## Returned evidence and boundaries

- `responded` returns model prose. It does not mean a business process completed;
  typed completion/clarification/escalation outcomes are the next task, 09.10.
- `confirmation_required` returns the dispatcher's validated pending action and stops
  before later calls in that batch or any additional inference. It grants no consent
  or eligibility guarantee. A future human-confirmation flow must use and revalidate
  the existing authenticated business routes.
- `stopped` returns a stable error code and independent correlation ID. Empty or
  truncated replies, invalid calls, authority loss, limits and provider failures
  cannot become successful responses. Unexpected errors omit private details.

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
was used to verify this stage. Scripted test responses do not establish live model
reliability, semantic grounding of arbitrary prose or general prompt-injection resistance.
