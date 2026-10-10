// Public read contracts. Provider payloads, checkpoints and tool arguments stay private.
export interface CaseRecord {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  budget: number;
  status: string;
  created_at: string;
}
export interface AuditRecord {
  id: string;
  action: string;
  entity_id: string;
  created_at: string;
}
export interface ProposalRecord {
  id: string;
  case_id: string;
  version: number;
  quote_id: string;
  quote_version: number;
  supplier_id: string;
  supplier_name: string;
  product_id: string;
  quantity: number;
  total: number;
  status: string;
  expires_at: string;
  approval: {
    id: string;
    recipient_id: string;
    status: string;
    expires_at: string;
    elapsed: boolean;
    decision: {
      actor_id: string;
      decision: string;
      reason: string;
      created_at: string;
    } | null;
  } | null;
  elapsed: boolean;
}
export interface ReceiptRecord {
  id: string;
  purchase_order_id: string;
  quantity: number;
  inspection: string;
  serials: string[];
  exception_reason: string | null;
  created_at: string;
}
export interface PurchaseRecord {
  id: string;
  proposal_id: string;
  case_id: string;
  product_id: string;
  supplier_name: string;
  quantity: number;
  received_quantity: number;
  cancelled_quantity: number;
  remaining_quantity: number;
  status: string;
  created_at: string;
  receipts: ReceiptRecord[];
}
export interface PurchasingRecords {
  businessClock: string;
  proposals: ProposalRecord[];
  purchaseOrders: PurchaseRecord[];
}
export interface RunRecord {
  id: string;
  case_id: string | null;
  agent: string;
  mode: "mock" | "live";
  model: string | null;
  status: string;
  started_at: string;
  toolCalls: { id: string; name: string; status: string }[];
  usage: {
    id: string;
    input_tokens: number | null;
    output_tokens: number | null;
    cost_microusd: number | null;
  }[];
}
export interface CaseDetail {
  businessClock: string;
  case: CaseRecord;
  order: {
    id: string;
    status: string;
    deadline: string;
    destination: string;
    allow_partial: number;
    allow_substitution: number;
    consent_offer_id: string;
    consent_version: number;
    quantity: number;
    delivered_quantity: number;
  };
  consent: {
    productSpecs: Record<string, string | number | boolean> | null;
    quantity: number | null;
    total: number | null;
    availableAllocation: number | null;
    shortage: number | null;
    supportedDelivery: string | null;
  };
  inventory: { physical: number; available: number; reservedForOrder: number };
  reservations: {
    id: string;
    quantity: number;
    status: string;
    expires_at: string;
    effectiveStatus: string;
  }[];
  budget: { reserved: number; committed: number; remaining: number };
  processes: {
    id: string;
    state: string;
    version: number;
    updated_at: string;
  }[];
  fulfillment: {
    id: string;
    quantity: number;
    promised_at: string;
    status: string;
    evidence: string | null;
  }[];
  audit: AuditRecord[];
}
