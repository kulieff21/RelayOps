import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Auth } from "../domain/auth.js";
import { Business } from "../domain/business.js";
import {
  BusinessError,
  id,
  localeSchema,
  requireRole,
  toolContracts,
  type Actor,
} from "../shared/contracts.js";
import { toolCallSchema, type ToolCall } from "../shared/tool-call.js";
import type { CompletionInput } from "../model/openrouter.js";
import { agentInstructions } from "./prompts.js";
import type { HandoffQueue } from "../shared/agent-outcome.js";

export type ToolName = keyof typeof toolContracts;
export type ToolInput<N extends ToolName> = z.infer<
  (typeof toolContracts)[N]["input"]
>;
type Outputs = {
  searchProducts: ReturnType<Business["search"]>;
  getOrder: ReturnType<Business["getOrder"]>;
  prepareOrder: ReturnType<Business["prepareOrder"]>;
  confirmOrder: ReturnType<Business["confirmOrder"]>;
  cancelOrder: ReturnType<Business["cancelOrder"]>;
  requestReturn: ReturnType<Business["requestReturn"]>;
  compareQuotes: ReturnType<Business["compareQuotes"]>;
};
type ConfirmationTool = "confirmOrder" | "cancelOrder" | "requestReturn";
type Completed<N extends ToolName> = {
  status: "completed";
  toolCallId: string;
  name: N;
  data: Outputs[N];
};
type Pending<N extends ConfirmationTool> = {
  status: "confirmation_required";
  toolCallId: string;
  name: N;
  input: ToolInput<N>;
};
type Rejected = {
  status: "rejected";
  toolCallId: string | null;
  error: { code: string; correlationId: string };
};
export type ToolResult<N extends ToolName = ToolName> =
  | Rejected
  | {
      [K in N]: K extends ConfirmationTool ? Pending<K> : Completed<K>;
    }[N];

const contextSchema = z.discriminatedUnion("agent", [
  z.strictObject({
    agent: z.literal("customer"),
    sessionToken: z.string().min(1).max(200),
    locale: localeSchema.optional(),
  }),
  z.strictObject({
    agent: z.literal("procurement"),
    sessionToken: z.string().min(1).max(200),
    caseId: id,
    locale: localeSchema.optional(),
  }),
]);
export type ToolContext = z.infer<typeof contextSchema>;
const allowlist = {
  customer: [
    "searchProducts",
    "getOrder",
    "prepareOrder",
    "confirmOrder",
    "cancelOrder",
    "requestReturn",
  ],
  procurement: ["searchProducts", "getOrder", "compareQuotes"],
} as const satisfies Record<ToolContext["agent"], readonly ToolName[]>;
const descriptions: Record<ToolName, string> = {
  searchProducts:
    "Search stored products, specifications, prices and current availability. The selected application locale takes precedence.",
  getOrder:
    "Read an authorized order and its actual stored status. Customer mode reads own orders; procurement mode reads only the bound case order.",
  prepareOrder:
    "Prepare an expiring versioned order summary without reserving stock. This is not an accepted order or a supply guarantee.",
  confirmOrder:
    "Request customer confirmation of an owned versioned offer. Model-supplied confirmed=true never accepts an order; this tool only returns confirmation_required.",
  cancelOrder:
    "Request customer confirmation of cancellation of an owned order. This tool only returns confirmation_required; it does not cancel the order.",
  requestReturn:
    "Request customer confirmation of return/refund/exchange details for an owned order. This tool only returns confirmation_required; it does not create or resolve a return.",
  compareQuotes:
    "Compare stored quotations for the bound procurement case using deterministic feasibility and budget rules. Does not approve or purchase.",
};

export class ToolDispatcher {
  constructor(
    private business: Business,
    private auth: Auth,
  ) {}
  bind(raw: ToolContext) {
    const parsed = contextSchema.safeParse(raw);
    if (!parsed.success) throw new BusinessError("TOOL_CONTEXT_INVALID", 400);
    // Capture validated scalar values. No model-supplied actor/role enters this context.
    const context = parsed.data;
    this.actor(context);
    return {
      handoffQueue: (): HandoffQueue => {
        this.actor(context);
        return context.agent === "customer"
          ? "customer_support"
          : "procurement_review";
      },
      instructions: () =>
        agentInstructions(
          context.agent,
          this.actor(context).locale,
          context.agent === "procurement" ? context.caseId : undefined,
        ),
      definitions: (): NonNullable<CompletionInput["tools"]> => {
        const actor = this.actor(context);
        return allowlist[context.agent]
          .filter((name) =>
            toolContracts[name].roles.some((role) =>
              actor.roles.includes(role),
            ),
          )
          .map((name) => ({
            type: "function",
            function: {
              name,
              description: descriptions[name],
              parameters: z.toJSONSchema(toolContracts[name].input),
            },
          }));
      },
      dispatch: (rawCall: unknown): ToolResult =>
        this.dispatch(context, rawCall),
    };
  }
  private actor(context: ToolContext): Actor {
    const actor = this.auth.authenticate(context.sessionToken);
    if (context.agent === "customer") {
      requireRole(actor, "customer");
      // A multi-role account still has customer-only authority in this assistant.
      return {
        ...actor,
        roles: ["customer"],
        locale: context.locale ?? actor.locale,
      };
    }
    requireRole(actor, "purchaser", "owner");
    if (
      !this.business.store.one(
        "SELECT id FROM procurement_cases WHERE id=?",
        context.caseId,
      )
    )
      throw new BusinessError("CASE_NOT_FOUND", 404);
    return {
      ...actor,
      roles: actor.roles.filter(
        (role) => role === "purchaser" || role === "owner",
      ),
      locale: context.locale ?? actor.locale,
    };
  }
  private invoke<N extends Exclude<ToolName, ConfirmationTool>>(
    name: N,
    actor: Actor,
    input: ToolInput<N>,
  ): Outputs[N] {
    const handlers: {
      [K in Exclude<ToolName, ConfirmationTool>]: (
        actor: Actor,
        input: ToolInput<K>,
      ) => Outputs[K];
    } = {
      searchProducts: (actor, input) =>
        this.business.search(input.query, actor.locale),
      getOrder: (actor, input) => this.business.getOrder(actor, input.orderId),
      prepareOrder: (actor, input) => this.business.prepareOrder(actor, input),
      compareQuotes: (actor, input) =>
        this.business.compareQuotes(actor, input.caseId),
    };
    return handlers[name](actor, input);
  }
  private execute<N extends ToolName>(
    context: ToolContext,
    actor: Actor,
    call: ToolCall<N>,
    input: ToolInput<N>,
  ): ToolResult<N> {
    const name = call.function.name;
    // The schema/name pair has been checked before entering here. Narrowing by the
    // name cannot narrow TypeScript's indexed generic, so casts stay at this boundary.
    if (context.agent === "procurement") {
      if (
        name === "compareQuotes" &&
        (input as ToolInput<"compareQuotes">).caseId !== context.caseId
      )
        throw new BusinessError("TOOL_CASE_MISMATCH", 403);
      if (name === "getOrder") {
        const row = this.business.store.one<{ order_id: string }>(
          "SELECT order_id FROM procurement_cases WHERE id=?",
          context.caseId,
        )!;
        if ((input as ToolInput<"getOrder">).orderId !== row.order_id)
          throw new BusinessError("TOOL_CASE_MISMATCH", 403);
      }
    }
    if (name === "confirmOrder") {
      const args = input as ToolInput<"confirmOrder">;
      const offer = this.business.store.one<{
        version: number;
        expires_at: string;
      }>(
        "SELECT version,expires_at FROM order_offers WHERE id=? AND customer_id=?",
        args.offerId,
        actor.id,
      );
      if (!offer) throw new BusinessError("OFFER_NOT_FOUND", 404);
      if (offer.version !== args.version)
        throw new BusinessError("CONSENT_VERSION_MISMATCH");
      if (offer.expires_at <= this.business.clock.now())
        throw new BusinessError("CONSENT_EXPIRED");
    }
    if (name === "cancelOrder" || name === "requestReturn")
      this.business.getOrder(
        actor,
        (input as ToolInput<"cancelOrder" | "requestReturn">).orderId,
      );
    if (
      name === "confirmOrder" ||
      name === "cancelOrder" ||
      name === "requestReturn"
    ) {
      return {
        status: "confirmation_required",
        toolCallId: call.id,
        name,
        input,
      } as ToolResult<N>;
    }
    const data = this.invoke(
      name as Exclude<ToolName, ConfirmationTool>,
      actor,
      input as ToolInput<Exclude<ToolName, ConfirmationTool>>,
    );
    return {
      status: "completed",
      toolCallId: call.id,
      name,
      data,
    } as ToolResult<N>;
  }
  private dispatch(context: ToolContext, rawCall: unknown): ToolResult {
    let callId: string | null = null;
    try {
      const parsed = toolCallSchema.safeParse(rawCall);
      if (parsed.success) callId = parsed.data.id;
      const actor = this.actor(context); // Recheck expiry/logout/role changes on every call.
      if (!parsed.success) throw new BusinessError("INVALID_TOOL_CALL", 400);
      const call = parsed.data;
      callId = call.id;
      const name = call.function.name;
      if (!Object.hasOwn(toolContracts, name))
        throw new BusinessError("UNKNOWN_TOOL", 400);
      const knownName = name as ToolName;
      if (!(allowlist[context.agent] as readonly string[]).includes(knownName))
        throw new BusinessError("TOOL_NOT_ALLOWED", 403);
      requireRole(actor, ...toolContracts[knownName].roles);
      if (Buffer.byteLength(call.function.arguments) > 16000)
        throw new BusinessError("INVALID_TOOL_ARGUMENTS", 400);
      let args: unknown;
      try {
        args = JSON.parse(call.function.arguments) as unknown;
      } catch {
        throw new BusinessError("INVALID_TOOL_ARGUMENTS", 400);
      }
      const validated = toolContracts[knownName].input.safeParse(args);
      if (!validated.success)
        throw new BusinessError("INVALID_TOOL_ARGUMENTS", 400);
      return this.execute(
        context,
        actor,
        call as ToolCall<ToolName>,
        validated.data,
      );
    } catch (error) {
      return {
        status: "rejected",
        toolCallId: callId,
        error: {
          code:
            error instanceof BusinessError ? error.code : "TOOL_INTERNAL_ERROR",
          correlationId: randomUUID(),
        },
      };
    }
  }
}
