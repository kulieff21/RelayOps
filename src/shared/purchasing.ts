import { z } from "zod";
import { id, key, money, quantity } from "./contracts.js";

export const categorySchema = z.enum([
  "networking",
  "computers",
  "components",
  "storage",
  "peripherals",
  "power",
]);
export const capabilitiesSchema = z.strictObject({
  categories: z
    .array(categorySchema)
    .min(1)
    .max(6)
    .refine((values) => new Set(values).size === values.length),
  zone: z.literal("baku"),
});
export const supplierInput = z.strictObject({
  name: z.string().trim().min(1).max(120),
  capabilities: capabilitiesSchema,
  expectedVersion: z.number().int().nonnegative(),
  key,
});
export const specsSchema = z
  .record(
    z.string().min(1).max(80),
    z.union([z.string().max(500), z.number().finite(), z.boolean()]),
  )
  .refine(
    (value) => Object.keys(value).length > 0 && Object.keys(value).length <= 40,
  );
export const quoteInput = z.strictObject({
  supplier_id: id,
  product_id: id,
  expectedVersion: z.number().int().nonnegative(),
  available: z.number().int().nonnegative().max(10000).nullable(),
  moq: quantity.nullable(),
  unit_price: money.nullable(),
  currency: z.literal("AZN").nullable(),
  delivery_fee: money.nullable(),
  other_fees: money.nullable(),
  valid_until: z.iso.datetime().nullable(),
  receipt_at: z.iso.datetime().nullable(),
  destination: z.literal("baku").nullable(),
  availability_at: z.iso.datetime().nullable(),
  specs: specsSchema.nullable(),
  terms: z.string().trim().min(1).max(2000).nullable(),
  evidence: z.string().trim().min(1).max(4000),
  revisionReason: z.string().trim().min(1).max(1000),
  key,
});
export const quoteQuery = z.strictObject({
  supplier: id.optional(),
  product: id.optional(),
});
export interface Supplier {
  id: string;
  name: string;
  capabilities: z.infer<typeof capabilitiesSchema>;
  version: number;
  updated_at: string | null;
}
export type QuoteFields = Omit<
  z.infer<typeof quoteInput>,
  "expectedVersion" | "key" | "revisionReason"
>;
export interface QuoteRecord extends QuoteFields {
  id: string;
  version: number;
  recorded_at: string | null;
  revision_reason: string | null;
  isCurrent: boolean;
  status: "current" | "superseded" | "incomplete" | "expired";
}
