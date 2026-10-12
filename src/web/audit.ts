export function auditName(locale: string, action: string) {
  const labels: Record<string, [string, string]> = {
    "goods.inspected": [
      "Goods inspection recorded",
      "Mal yoxlaması qeydə alındı",
    ],
    "stock.allocated": [
      "Inspected stock allocated",
      "Yoxlanılmış stok ayrıldı",
    ],
    "order.supply_ready": [
      "All units reserved; order ready",
      "Bütün vahidlər rezerv edilib; sifariş hazırdır",
    ],
    "supply.review_required": [
      "Supply plan requires review",
      "Təchizat planına baxış lazımdır",
    ],
    "supplier.delay": [
      "Supplier delay recorded",
      "Təchizatçı gecikməsi qeydə alındı",
    ],
    "supplier.cancellation": [
      "Supplier cancellation recorded",
      "Təchizatçı ləğvi qeydə alındı",
    ],
    "supply.replanned": [
      "Supply replanned; new decision required",
      "Təchizat yenidən planlanıb; yeni qərar lazımdır",
    ],
    "supply.replan_escalated": [
      "No feasible replacement; review required",
      "Uyğun əvəzləyici təklif yoxdur; baxış lazımdır",
    ],
    "approval.requested": [
      "Purchasing decision requested",
      "Satınalma qərarı istəndi",
    ],
    "approval.expired": [
      "Approval expired; budget released",
      "Təsdiqin müddəti bitdi; büdcə azad edildi",
    ],
    "approval.invalidated": [
      "Approval invalidated; new proposal required",
      "Təsdiq etibarsızdır; yeni təklif tələb olunur",
    ],
    "approval.delivery_recovered": [
      "Telegram delivery confirmed by recipient",
      "Telegram göndərişi alıcı tərəfindən təsdiqləndi",
    ],
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
    "supplier.acknowledged": [
      "Sandbox supplier acknowledged",
      "Sandbox təchizatçı təsdiqlədi",
    ],
    "supplier.failed": [
      "Sandbox supplier failed; review required",
      "Sandbox təchizatçı uğursuz oldu; baxış tələb olunur",
    ],
    "reservation.extended": [
      "Stock hold extended within accepted deadline",
      "Stok rezervi razılaşdırılmış müddətə uzadıldı",
    ],
    "procurement.revision_ready": [
      "Revised draft requires a new decision",
      "Yenilənmiş layihəyə yeni qərar lazımdır",
    ],
    "continuation.escalated": [
      "Business process needs review",
      "Biznes prosesinə baxış lazımdır",
    ],
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
    "order.confirmed": [
      "Customer order accepted",
      "Müştəri sifarişi qəbul edildi",
    ],
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
