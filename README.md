# RelayOps

AI-powered retail and procurement operations for an electronics and IT equipment retailer.

RelayOps connects customer requests, inventory shortages, supplier quotations and human
purchasing decisions in a persistent business process. English is the original interface
language; Azerbaijani is a supported locale for both customer and business experiences.

## Status

Early development. The repository currently contains the project overview and working
specification. There is no runnable application yet. Features described below are the
intended scope, not a claim of completed functionality.

The [product specification](docs/product-spec.md) defines roles, order/return policies,
procurement rules, approval states and 34 observable acceptance criteria. Its monetary
values and supplier offers are fictional demo fixtures.

## Planned capabilities

- Customer storefront with product specifications, orders, cancellations and returns.
- A customer AI assistant that uses business tools and requests confirmation for changes.
- Business operations for inventory, supplier quotations and procurement proposals.
- A procurement agent that explains feasible supplier choices using actual quote records.
- Telegram approval or rejection by an authorized person, followed by process resumption.
- Stock receipt and allocation to waiting customer orders.
- Durable state, duplicate prevention, permission boundaries and a business audit trail.
- Reproducible demo data, a mock integration mode and measured comparative evaluation.

## Example process

A customer needs 20 identical managed network switches before a deadline, while the
retailer has only 8 available. RelayOps captures the shortage, compares supplier offers,
prepares a purchase proposal and requests approval. Following a valid decision, it
creates a sandbox purchase order. Stock becomes available to the customer only after
goods receipt and allocation.

## Integration boundaries

OpenRouter and Telegram are the intended live integrations. Supplier transactions,
payments and fulfillment use an explicitly labelled sandbox. Model/provider selection
and technical architecture have not been finalized.

Setup, runnable examples, screenshots and evaluation results will be added as the
corresponding capabilities are implemented and verified.
