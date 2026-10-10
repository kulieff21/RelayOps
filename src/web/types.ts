export type Locale = "en" | "az";
export interface Product {
  id: string;
  category: string;
  name: string;
  description: string;
  specs: Record<string, unknown>;
  price: number;
  currency: string;
  available: number;
  incoming: number;
}
export interface Account {
  id: string;
  roles: string[];
  locale: Locale;
}
export interface Session {
  token: string;
  expiresAt: string;
  account: Account;
}
export interface CartLine {
  productId: string;
  quantity: number;
}
export interface Order {
  id: string;
  customer_id: string;
  status: string;
  total: number;
  deadline: string;
  created_at: string;
  delivered_at: string | null;
  lines: {
    id: string;
    product_id: string;
    quantity: number;
    unit_price: number;
    delivered_quantity: number;
  }[];
}
export interface Return {
  id: string;
  order_id: string;
  product_id: string;
  customer_id: string;
  quantity: number;
  reason: string;
  resolution: string;
  status: string;
  outcome: string | null;
  created_at: string;
}
export interface Offer {
  id: string;
  version: 1;
  expiresAt: string;
  supplyPromise: string;
  summary: {
    productId: string;
    quantity: number;
    total: number;
    unitPrice: number;
    availableAllocation: number;
    shortage: number;
    supportedDelivery: string | null;
    deadline: string;
    exchangeCredit?: number;
  };
}
export interface ProcurementCase {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  budget: number;
  status: string;
  created_at: string;
}
export interface Workspace {
  orders: Order[];
  returns: Return[];
  inventory: { id: string; stock: number }[];
  movements: {
    id: string;
    product_id: string;
    delta: number;
    source: string;
    created_at: string;
  }[];
  cases: ProcurementCase[];
  suppliers: { id: string; name: string }[];
  audit: {
    id: string;
    action: string;
    entity_id: string;
    created_at: string;
  }[];
  approvals: { id: string; status: string; expires_at: string }[];
}
export interface Comparison {
  id: string;
  supplier: string;
  feasible: boolean;
  reasons: string[];
  total: number | null;
  customerDelivery: string | null;
  quantity: number | null;
  excess: number | null;
}
