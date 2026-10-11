import { randomUUID } from "node:crypto";
import { MockModel, type MockResponse } from "./mock.js";
import type { AgentModel, ModelCompletion } from "../agent/loop.js";
import type { CompletionInput, CompletionOptions } from "./openrouter.js";
import type { GuidedAction } from "../shared/assistant.js";

// Explicit deterministic demo: guided actions plus a small, documented EN/AZ
// vocabulary. It selects real tools; it is not presented as natural-language AI.
export class CustomerMock implements AgentModel {
  constructor(private action?: GuidedAction) {}
  async complete(
    input: CompletionInput,
    options?: CompletionOptions,
  ): Promise<ModelCompletion> {
    const result = await new MockModel([
      (request) => this.response(request),
    ]).complete(input, options);
    return { ...result, model: "relayops/customer-mock" };
  }
  private response(input: CompletionInput): MockResponse {
    const az = input.messages[0]?.content?.includes("Respond in Azerbaijani.");
    let start = 0;
    input.messages.forEach((m, i) => {
      if (m.role === "user") start = i;
    });
    const observations = input.messages
      .slice(start + 1)
      .filter((m) => m.role === "tool");
    const text = (input.messages[start]?.content ?? "").toLowerCase();
    const terminal = (value: unknown): MockResponse => ({
      content: JSON.stringify(value),
      toolCalls: [],
      finishReason: "stop",
    });
    const call = (name: string, args: unknown): MockResponse => ({
      content: null,
      finishReason: "tool_calls",
      toolCalls: [
        {
          id: `demo-${name}-${start}-${observations.length}`,
          type: "function",
          function: { name, arguments: JSON.stringify(args) },
        },
      ],
    });
    if (observations.length) {
      const observed = observations.at(-1)!;
      const result = JSON.parse(observed.content!) as {
        status: string;
        name?: string;
        data?: { id: string; version: number };
        error?: { code: string };
      };
      const evidence = observed.role === "tool" ? [observed.tool_call_id] : [];
      if (result.status === "rejected")
        return terminal({
          status: "escalation",
          message: az
            ? "Bu sorğu üçün əməkdaşın baxışı lazımdır."
            : "This request needs a staff review.",
          reason: "manual_review",
          evidenceToolCallIds: evidence,
        });
      if (result.name === "prepareOrder")
        return call("confirmOrder", {
          offerId: result.data!.id,
          version: result.data!.version,
          confirmed: true,
          key: randomUUID(),
        });
      return terminal({
        status: "completion",
        message: az
          ? "Qeydə alınmış nəticə aşağıda göstərilir."
          : "The stored result is shown below.",
        evidenceToolCallIds: evidence,
      });
    }
    if (this.action) return call(this.action.name, this.action.input);
    const pairs = [
      [/switch|kommutator|24g/, "NET-SW-24G"],
      [/mini|kompüter|computer|\bpc\b/, "PC-MINI-16"],
      [/ram|memory|operativ/, "RAM-DDR5-16"],
      [/ssd|storage|yaddaş/, "SSD-EXT-1T"],
      [/monitor|display|ekran/, "MON-QHD-27"],
      [/ups|power|enerji/, "UPS-900"],
    ] as const;
    const product = pairs.find(([match]) => match.test(text))?.[1];
    const allUserText = input.messages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join(" ");
    const wantsOrder =
      /buy|order|sifariş|almaq|purchase/.test(text) &&
      !/status|lookup|vəziyyət/.test(text);
    if (wantsOrder) {
      const quantity = allUserText.match(/\b(\d{1,4})\s*(?:units?|ədəd)/i)?.[1];
      const deadline = allUserText.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
      const missing = [
        !product && "product",
        !quantity && "quantity",
        !deadline && "deadline",
      ].filter(Boolean);
      if (missing.length)
        return terminal({
          status: "clarification",
          question: az
            ? "Məhsulu, ədəd sayını və son tarixi (YYYY-MM-DD) qeyd edin. Uyğunluq üçün tələb olunan spesifikasiyanı da yazın."
            : "Specify the product, quantity in units and deadline (YYYY-MM-DD). Include required specifications for compatibility.",
          missingFields: missing,
          evidenceToolCallIds: [],
        });
      // Preferences and destination need an explicit guided request in mock mode.
      return terminal({
        status: "clarification",
        question: az
          ? "Sifariş formasında Bakı ünvanını və qismən icra/əvəzləmə seçimini təsdiqləyin."
          : "Use the order form to confirm Baku delivery and partial fulfillment/substitution preferences.",
        missingFields: ["destination", "partial_fulfillment", "substitution"],
        evidenceToolCallIds: [],
      });
    }
    if (/compatible|uyğunluq/.test(text))
      return terminal({
        status: "clarification",
        question: az
          ? "Hansı cihaz və tələb olunan spesifikasiya ilə uyğunluq lazımdır?"
          : "Which device and required specification should compatibility be checked against?",
        missingFields: ["specification"],
        evidenceToolCallIds: [],
      });
    if (product)
      return call("searchProducts", {
        query: product,
        locale: az ? "az" : "en",
      });
    return terminal({
      status: "clarification",
      question: az
        ? "Hansı məhsul və ya sifariş barədə kömək lazımdır? Demo üçün aşağıdakı hazır əməliyyatlardan istifadə edin."
        : "Which product or order do you need help with? Use a guided action below for the demo.",
      missingFields: ["product", "order"],
      evidenceToolCallIds: [],
    });
  }
}
