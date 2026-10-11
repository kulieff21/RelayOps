export function auditName(locale: string, action: string) {
  const labels: Record<string, [string, string]> = {
    "proposal.prepared": [
      "Purchasing draft prepared",
      "Satınalma layihəsi hazırlandı",
    ],
    "proposal.superseded": [
      "Proposal replaced by a new version",
      "Təklif yeni versiya ilə əvəzləndi",
    ],
    "proposal.submitted": [
      "Purchasing proposal submitted",
      "Satınalma təklifi təqdim edildi",
    ],
    "approval.decided": [
      "Human decision recorded",
      "İnsan qərarı qeydə alındı",
    ],
    "purchase.created": [
      "Purchase order recorded",
      "Satınalma sifarişi qeydə alındı",
    ],
    "goods.received": ["Goods receipt recorded", "Mal qəbulu qeydə alındı"],
    "agent.completed": ["Agent run completed", "Agent icrası tamamlandı"],
    "tool.completed": ["Tool call completed", "Alət çağırışı tamamlandı"],
    "supplier.created": ["Supplier added", "Təchizatçı əlavə edildi"],
    "supplier.updated": ["Supplier updated", "Təchizatçı yeniləndi"],
    "quote.version_recorded": [
      "Quotation version recorded",
      "Təklif versiyası qeydə alındı",
    ],
    "order.offer_prepared": [
      "Order summary prepared",
      "Sifariş xülasəsi hazırlandı",
    ],
    "order.confirmed": ["Order confirmed", "Sifariş təsdiqləndi"],
    "procurement.shortage_created": [
      "Supply case opened",
      "Təchizat işi açıldı",
    ],
    "fixture.delivery": [
      "Demo delivery recorded",
      "Demo çatdırılma qeydə alındı",
    ],
    "order.cancellation": ["Cancellation recorded", "Ləğv qeydə alındı"],
    "order.status_changed": [
      "Order status updated",
      "Sifariş vəziyyəti yeniləndi",
    ],
    "return.requested": ["Return requested", "Qaytarma tələb edildi"],
    "return.status_changed": [
      "Return status updated",
      "Qaytarma vəziyyəti yeniləndi",
    ],
    "return.inspected": [
      "Returned goods inspected",
      "Qaytarılan məhsullar yoxlanıldı",
    ],
    "return.resolved": ["Return resolved", "Qaytarma tamamlandı"],
    "exchange.confirmed": ["Exchange confirmed", "Dəyişdirmə təsdiqləndi"],
    "exchange.offer_linked": [
      "Replacement summary prepared",
      "Əvəzləyici xülasə hazırlandı",
    ],
    "stock.reservation_expired": [
      "Reservation expired",
      "Rezervasiyanın müddəti bitdi",
    ],
  };
  return labels[action]?.[locale === "az" ? 1 : 0] ?? action;
}
