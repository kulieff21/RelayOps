import { z } from "zod";
import { key, quantity } from "./contracts.js";

export const receiptInput = z.strictObject({
  quantity,
  serials: z.array(z.string().trim().min(1).max(100)).max(10000).default([]),
  evidence: z.string().trim().min(1).max(1000),
  key,
});
export const receiptInspectionInput = z.strictObject({
  outcome: z.enum(["sellable", "damaged", "incomplete", "wrong_item"]),
  notes: z.string().trim().min(1).max(1000),
  key,
});
export const supplierEventInput = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("delay"),
    receiptAt: z.iso.datetime(),
    evidence: z.string().trim().min(1).max(1000),
    key,
  }),
  z.strictObject({
    kind: z.literal("cancellation"),
    quantity,
    evidence: z.string().trim().min(1).max(1000),
    key,
  }),
]);
export interface OrderProgress {
  businessClock: string;
  reserved: number;
  required: number;
  batches: {
    id: string;
    quantity: number;
    promised_at: string;
    status: string;
    evidence: string | null;
  }[];
  timeline: { id: string; action: string; created_at: string }[];
  notifications: {
    id: string;
    message_key: string;
    parameters: {
      orderId: string;
      quantity?: number;
      deliveryAt?: string;
      reason?: string;
    };
    locale: "en" | "az";
    created_at: string;
  }[];
}
