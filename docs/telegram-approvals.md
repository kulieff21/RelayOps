# Telegram and website purchasing approvals

The approval service, private-chat long-polling receiver and case review controls are
implemented. A human submits one immutable purchasing draft and records its decision
in Telegram or the authenticated website. Approval reserves sandbox purchasing budget;
it does not itself receive stock or complete customer delivery. A separately invoked
[sandbox continuation](purchase-continuation.md) can create the approved purchase order.

## Run the integration

Complete [private recipient onboarding](telegram-setup.md), explicitly selecting an
existing owner account and `en` or `az`. Keep the bot token and numeric mapping only in
the ignored server `.env`. Then set `TELEGRAM_APPROVALS_ENABLED=true`, restart the API
and run `npm run telegram:worker` in a separate terminal. The worker verifies bot
identity and refuses an existing webhook. Normal API startup never contacts Telegram
or starts a receiver; it reads mapping and availability for the review screen.

Sign in as purchaser/owner, open an accepted procurement case and prepare a guided
purchasing draft. **Send approval to Telegram** explicitly queues a real message.
**Create simulated approval** runs the same persisted decision policy without sending
a message; the website labels that mode. Only the mapped owner can decide, using the
Telegram buttons or a website decision with a reason. The recipient's selected locale
controls Telegram content independently of the reviewer's current UI language.

`/start` pairs a recipient; it has no automatic reply or purchasing effect. A verified
Start and bot token do not themselves send an approval. Without the live flag, real
delivery is disabled. The worker consumes messages and callback updates for this
dedicated bot; it stores only update IDs/results, not raw message text.

## Persistent policy

Migration 007 adds immutable request/delivery binding and decision guards, an outbox
and one persisted receiver lease per bot. A request stores its proposal/version,
recipient, bot/user/private chat, EN/AZ summary and two expiry bounds: frozen business
time and a real-wall deadline capped at 24 hours. The summary includes quantity,
all-in AZN cost, customer deadline, expiry and deterministic proposal rationale.
Original-language model notes remain separate.

Callback data contains an opaque request ID and decision, never an amount or role.
Validation checks the mapped numeric sender, private chat, bot-authored message,
known message ID, current owner role and current request/evidence. Fresh website
sessions use the same decision service. The first valid decision wins across channels;
duplicate update IDs and request keys return the committed outcome.

In one SQLite transaction, decision, audit, proposal status, budget allocation,
process checkpoint and one deduplicated continuation job commit. Approval selects
`purchasing_ready` / `purchase.after_approval`; rejection selects
`proposal_revision_required` / `procurement.after_rejection`. These are persisted
handoffs consumed by the explicit sandbox continuation worker. Rejection requires a
new immutable proposal and approval request; it cannot transfer its decision.

Expiry, revoked/changed recipient mapping or changed consent, inventory, quotations,
supplier capability and budget evidence invalidate the request. Its own approval
allocation is excluded when comparing remaining budget, avoiding self-invalidation;
other allocations still count. Sweeps release only this request's reserved allocation,
retain decision history, escalate the process and request a new proposal/decision.
Any future continuation executor must revalidate before executing a purchase.

## Delivery and recovery limits

Network calls never hold a SQLite transaction. The worker renews a real-wall lease,
sends at most ten queued messages per pass and records a message ID only after a
validated response. Decision and update offset commit together; a later polling call
acknowledges committed updates. A failed callback toast cannot repeat the business
effect. Terminal message edits remove controls and stop after three failed attempts;
the database decision remains authoritative even if Telegram display fails.

Telegram sendMessage provides no client idempotency key. A crash or ambiguous send
failure becomes **delivery unknown**, with no automatic resend. A callback from the
exact mapped owner/private chat and bot-authored message can authenticate the missing
message ID and recover that delivery. Otherwise review it in the website; do not
blindly resend an existing request. A website decision committed during an in-flight
send also schedules the terminal message edit after delivery succeeds.

The CLI stops after three consecutive receiver failures. Restart it after investigating
the fixed error code; preserve the database and allow an abandoned 120-second lease
to expire. It does not reset business records or invoke a model. Multi-instance hosting,
webhooks, receipt execution and unrestricted deployment are outside this
local receiver's verification scope.

## Verification

Unpaid tests use actual SQLite services, authenticated HTTP routes and synthetic
Telegram HTTP responses. They cover immutable summaries/mappings, role and message
identity, expiry, supplier/stock changes, duplicate and conflicting cross-channel
decisions, audit rollback, uncertain-send recovery, leases, bounded edits and a web
decision during sending. SQLite close/reopen verifies a pending request; a real child
process exits after decision commit and resumes with one decision/allocation/job.
EN/AZ controls and simulated mode are reviewed separately from actual delivery.
These isolated checks do not establish live Telegram button delivery. A separately
observed operator-owned live EN approval recorded one decision/allocation and the
successful terminal message edit. Receipt and delivery completion remain later.

Protocol references: [polling acknowledgement](https://core.telegram.org/bots/api#getupdates),
[inline controls](https://core.telegram.org/bots/api#inlinekeyboardbutton),
[callback response](https://core.telegram.org/bots/api#answercallbackquery) and
[message edits](https://core.telegram.org/bots/api#editmessagetext).
