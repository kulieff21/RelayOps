import type { AgentModel, ModelCompletion } from "../agent/loop.js";
import type { CompletionInput, CompletionOptions } from "./openrouter.js";
import { MockModel, type MockResponse } from "./mock.js";
import type { ProcurementRequest } from "../shared/procurement.js";
import type { ToolResult } from "../agent/tools.js";

// Explicit free demonstration of the actual proposal services, not a live AI.
export class ProcurementMock implements AgentModel {
  constructor(
    private caseId: string,
    private request: ProcurementRequest,
  ) {}
  async complete(
    input: CompletionInput,
    options?: CompletionOptions,
  ): Promise<ModelCompletion> {
    const result = await new MockModel([
      (request) => this.response(request),
    ]).complete(input, options);
    return { ...result, model: "relayops/procurement-mock" };
  }
  private response(input: CompletionInput): MockResponse {
    const az = input.messages[0]?.content?.includes("Respond in Azerbaijani.");
    const observations = input.messages.filter((m) => m.role === "tool");
    const results = observations.map(
      (m) => JSON.parse(m.content!) as ToolResult,
    );
    const call = (name: string, args: unknown): MockResponse => ({
      content: null,
      finishReason: "tool_calls",
      toolCalls: [
        {
          id: `procurement-${observations.length}-${name}`,
          type: "function",
          function: { name, arguments: JSON.stringify(args) },
        },
      ],
    });
    const end = (value: unknown): MockResponse => ({
      content: JSON.stringify(value),
      toolCalls: [],
      finishReason: "stop",
    });
    const last = results.at(-1);
    if (last?.status === "rejected")
      return end({
        status: "escalation",
        reason: "manual_review",
        evidenceToolCallIds: [last.toolCallId],
        message: az
          ? "Təklif hazırlana bilmədi; məlumatları yeniləyin və səbəbi yoxlayın."
          : "The proposal could not be prepared; refresh the case and review the recorded error.",
      });
    for (const name of [
      "getProcurementRequirements",
      "getSupplierQuotes",
      "compareQuotes",
    ] as const)
      if (!results.some((r) => r.status === "completed" && r.name === name))
        return call(name, { caseId: this.caseId });
    const compared = results.find(
      (r) => r.status === "completed" && r.name === "compareQuotes",
    );
    if (
      !compared ||
      compared.status !== "completed" ||
      compared.name !== "compareQuotes"
    )
      throw new Error("Missing comparison");
    if (!compared.data.selectedQuoteId)
      return end({
        status: "escalation",
        reason: "no_feasible_quote",
        evidenceToolCallIds: [compared.toolCallId],
        message: az
          ? "Uyğun təchizatçı təklifi yoxdur. Çatışmayan məlumatı tamamlayın və ya tarix/büdcə üçün insan yoxlaması istəyin. Satınalma təklifi yaradılmadı."
          : "No feasible supplier offer. Clarify missing quotation data or request human review of the deadline/budget. No purchasing proposal was created.",
      });
    const prepared = results.find(
      (r) => r.status === "completed" && r.name === "preparePurchaseProposal",
    );
    if (!prepared)
      return call("preparePurchaseProposal", {
        caseId: this.caseId,
        expectedVersion: this.request.expectedVersion,
        evidenceFingerprint: compared.data.evidenceFingerprint,
        revisionReason: this.request.revisionReason,
        rationale: az
          ? "Yönləndirilmiş demo: qeydə alınmış uyğun variantlar arasında deterministik seçim."
          : "Guided demo: deterministic selection among recorded feasible options.",
      });
    return end({
      status: "completion",
      evidenceToolCallIds: [compared.toolCallId, prepared.toolCallId],
      message: az
        ? "Versiyalı satınalma layihəsi saxlanıldı. İnsan qərarı tələb olunur; satınalma icra edilməyib."
        : "The versioned purchasing draft was saved. A human decision is required; no purchase has been executed.",
    });
  }
}
