# Sandbox approval continuation

The explicit local worker consumes persisted approval/rejection jobs. It has no
supplier network, payment, model inference or goods-receipt capability. Ordinary
API startup and the Telegram receiver do not start this business worker.

```sh
npm run process:worker -- --once
# Isolated failure demonstrations only: fails queued sandbox supplier acknowledgements.
npm run process:worker -- --once-fail-supplier
```

The command handles at most ten jobs and exits. Configuration uses the existing
named demo, frozen business clock and verified owner mapping. It does not seed/reset
the database, change credentials, renew the model budget or send Telegram messages.

For approval, the worker freshly validates owner authority, request/proposal/decision
binding, business and real-wall expiry, consent, inventory, supplier/quote evidence
and the exact reserved allocation. Material changes invalidate/release the request
and escalate instead of purchasing. The historical first decision remains immutable.

One transaction creates a unique PO, converts reserved budget to committed, marks
the proposal executed and records a labelled mock supplier acknowledgement. The
reference case creates an acknowledged twelve-unit PO for 1,920 AZN. Physical stock,
receipts and customer order/delivery state remain unchanged. Incoming supply is shown
separately. Active unexpired customer reservations extend only to the accepted deadline,
with audit; no expired reservation is silently revived.

The simulated failure mode retains a failed PO/acknowledgement, releases the sandbox
commitment, excludes it from incoming supply and escalates for review. It does not
pretend to cancel a real supplier obligation or automatically replan a different order.
Supplier cancellation, delay handling and explicit receipt/inspection/allocation are
connected through separate authenticated routes; see [goods handling](goods-fulfillment.md).

For rejection, the worker recomputes current deterministic evidence, prepares an
immutable next draft with the rejection reason and returns to human review. The same
offer may remain best under unchanged evidence. No decision carries over and no new
message is automatically sent. Existing human revisions are reused; missing/infeasible
quotes escalate rather than becoming invented offers.

Claim, business effect, audit and completed job commit together under SQLite's immediate
write transaction. There is no asynchronous work inside this lock. Competing workers
serialize; unique proposal/PO binding prevents repeat purchases. Real-wall lease expiry
recovers earlier abandoned jobs. Business denials and exhausted attempts persist a
failed job/escalation. An infrastructure or audit error rolls back the complete claim;
the bounded CLI exits with a fixed error rather than entering an unbounded retry loop.

After execution, an approval is historical authorization. Later expiry, evidence or
role changes cannot erase its recorded PO or release a committed supplier obligation.
The purchasing panel displays mock acknowledgement separately from physical receipt.
Migration 008 adds append-only acknowledgements and an immutable PO binding without
rewriting applied migrations.

Thirteen unpaid checks cover these paths, transactional rollback, expired/stale/role
denials, rejection/new review, incoming-stock separation, lease recovery, actual
child-process exit after commit and two independent competing OS processes. These are
sandbox consistency checks, not evidence of real supplier fulfillment or AI gains.
