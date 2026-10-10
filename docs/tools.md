# Typed tool dispatch and authority

`src/agent/tools.ts` dispatches normalized model function calls to existing sandbox
services. Inputs come from the strict Zod contracts in `src/shared/contracts.ts`;
handler input/output types retain the corresponding business method's structure.
`src/shared/tool-call.ts` is shared with the OpenRouter adapter, which removes optional
provider metadata before handing the normalized ID/type/function fields to dispatch.

## Tool behavior

| Tool           | Assistant             | Result                                                                                    |
| -------------- | --------------------- | ----------------------------------------------------------------------------------------- |
| searchProducts | Customer, procurement | Actual catalog/specifications/prices/availability in the selected application locale      |
| getOrder       | Customer, procurement | Own customer order, or the order belonging to the trusted procurement case                |
| prepareOrder   | Customer              | Stored expiring summary; no accepted order or stock reservation                           |
| confirmOrder   | Customer              | confirmation_required for an owned, current offer; no order acceptance                    |
| cancelOrder    | Customer              | confirmation_required for an owned order; no cancellation                                 |
| requestReturn  | Customer              | confirmation_required for owned return/refund/exchange details; no return/refund mutation |
| compareQuotes  | Procurement           | Deterministic stored quote comparison for the trusted active case; no approval/purchase   |

The confirmation result is a proposed action, not an authorization token, eligibility
guarantee or executed business result. Model-supplied confirmed=true cannot grant consent.
The future conversation/UI must stop for affirmative human review and submit the ordinary
authenticated business route, which rechecks current ownership, eligibility, price/stock,
expiry and idempotency. This dispatcher provides no mutation bypass or consent-grant method.

## Authenticated application context

Bind tools in server code using the real session token obtained from the request:

```ts
const tools = new ToolDispatcher(business, auth).bind({
  agent: "customer",
  sessionToken: tokenFromAuthenticatedRequest,
  locale: "az",
});
const definitions = tools.definitions();
const observation = tools.dispatch(normalizedModelCall);
```

The context never enters a model request. Its strict contract accepts agent, token,
optional selected locale and (for procurement) a required trusted caseId; it rejects
supplied actor/role fields. Definitions and every dispatch resolve the current session
through Auth. Expiry, logout and role revocation take effect on subsequent calls.
Customer mode requires the customer role and uses customer-only authority even when
the account also has owner/operator roles. Procurement requires purchaser/owner and
keeps its case/order scope; model arguments cannot switch the trusted case. Selected
application locale takes precedence over the model's validated locale argument.

## Results and errors

ToolResult is a discriminated union: completed carries the typed tool's real service
data; confirmation_required carries the validated action input; rejected carries a
stable error code and server-generated correlationId. A valid call ID is retained
even if the session has expired. Invalid envelopes have no trusted call ID.

Unknown functions, arbitrary executable names, malformed JSON, non-object/extra fields,
wrong scalar types, spoofed identity and oversized arguments are rejected before effects.
Argument text is limited to 16,000 bytes. Domain errors retain their codes; unexpected
exceptions become TOOL_INTERNAL_ERROR without raw input, session tokens or SQL details.
No outcome turns model prose into evidence of a business action.

## Verified scope and remaining work

Eleven unpaid tests exercise actual in-memory business services: catalog/offers/orders,
quote totals, zero effects from model-confirmed mutation requests, customer privacy,
multi-role downscoping, case boundaries, logout/expiry/revocation, malformed input,
expired consent, closed cases and transaction rollback on an audit failure. A mocked
OpenRouter response is normalized, dispatched into a real catalog read and returned
as a valid tool message to a second mocked completion. No paid request is needed.

There is no general observe/action/result loop, conversation endpoint, persistent
execution orchestration, assistant UI confirmation/resume flow or procurement proposal
executor yet. Dispatch results are returned to the caller; the later loop must persist
them separately from model prose and handle confirmation/error outcomes explicitly.
Manual storefront/business routes continue to operate independently.
