import { z } from "zod";
import {
  PurchaseExecution,
  type ContinuationResult,
} from "../domain/purchase-execution.js";
import { BusinessError } from "../shared/contracts.js";

const payload = z.strictObject({
  requestId: z.string().uuid(),
  proposalId: z.string().uuid(),
});
type Job = {
  id: string;
  process_id: string;
  kind: string;
  payload: string;
  attempts: number;
  max_attempts: number;
};

export class ContinuationWorker {
  constructor(
    readonly execution: PurchaseExecution,
    readonly wallTime = () => Date.now(),
  ) {}
  runOne(
    supplierOutcome: "acknowledged" | "failed" = "acknowledged",
  ): ContinuationResult | null {
    const { store, business } = this.execution.approvals;
    // Claim, business effect, audit and job completion are one synchronous transaction.
    // No network awaits; a process crash can expose either the entire commit or none.
    return store.transaction(() => {
      const wall = new Date(this.wallTime()).toISOString();
      const job = store.one<Job>(
        `SELECT * FROM jobs WHERE kind IN ('purchase.after_approval','procurement.after_rejection')
        AND available_at<=? AND (status='ready' OR (status='leased' AND lease_until<=?)) ORDER BY available_at,id LIMIT 1`,
        business.clock.now(),
        wall,
      );
      if (!job) return null;
      if (job.attempts >= job.max_attempts)
        return this.fail(job, "CONTINUATION_ATTEMPTS_EXHAUSTED");
      store.run(
        "UPDATE jobs SET status='leased',lease_until=?,attempts=attempts+1 WHERE id=?",
        new Date(this.wallTime() + 60_000).toISOString(),
        job.id,
      );
      let result: ContinuationResult;
      try {
        result = store.transaction(() => {
          const parsed = payload.safeParse(JSON.parse(job.payload));
          if (!parsed.success)
            throw new BusinessError("CONTINUATION_BINDING_INVALID");
          const input = parsed.data,
            row = this.execution.approvals.row(input.requestId);
          if (
            row.proposal_id !== input.proposalId ||
            row.process_id !== job.process_id
          )
            throw new BusinessError("CONTINUATION_BINDING_INVALID");
          return job.kind === "purchase.after_approval"
            ? this.execution.purchase(input.requestId, supplierOutcome)
            : this.execution.revise(input.requestId);
        });
      } catch (error) {
        if (error instanceof BusinessError) return this.fail(job, error.code);
        // Infrastructure/audit failure rolls back claim as well as effect, allowing
        // the CLI's bounded retry to revisit the same durable ready checkpoint.
        throw error;
      }
      if (result.status === "escalated")
        return this.fail(job, result.reason ?? "SUPPLIER_FAILURE", result);
      store.run(
        "UPDATE jobs SET status='done',lease_until=NULL WHERE id=?",
        job.id,
      );
      return result;
    });
  }
  private fail(
    job: Job,
    reason: string,
    result?: ContinuationResult,
  ): ContinuationResult {
    const { store, business, auth, options } = this.execution.approvals;
    store.run(
      "UPDATE jobs SET status='failed',lease_until=NULL WHERE id=?",
      job.id,
    );
    store.run(
      "UPDATE processes SET state='escalated',checkpoint=?,version=version+1,updated_at=? WHERE id=?",
      JSON.stringify({
        step: "continuation_review_required",
        jobId: job.id,
        reason,
      }),
      business.clock.now(),
      job.process_id,
    );
    if (options)
      business.audit(
        auth.actor(options.mapping.accountId),
        "continuation.escalated",
        job.id,
        { reason },
        job.process_id,
      );
    return result ?? { status: "escalated", reason };
  }
}
