# Reserved worker boundary

The explicit continuation worker consumes approval/rejection jobs in one synchronous
transaction: validated sandbox PO/mock acknowledgement or a new draft requiring review.
Use `npm run process:worker -- --once`. No supplier network, inference, receipt or
fulfillment execution runs here. See `docs/purchase-continuation.md` for recovery limits.
