import type { Locale } from "./types.js";

// A tuple always carries both source and translation; missing keys are type errors.
export const messages = {
  pending: ["Pending", "Gözlənilir"],
  approved: ["Approved", "Təsdiqləndi"],
  expired: ["Expired", "Müddəti bitdi"],
  invalidated: ["Invalidated", "Etibarsız oldu"],
  AMOUNT_OVERFLOW: [
    "The order amount is too large.",
    "Sifariş məbləği çox böyükdür.",
  ],
  OWNER_REQUIRED: [
    "An owner decision is required.",
    "Sahibin qərarı tələb olunur.",
  ],
  IDEMPOTENCY_CONFLICT: [
    "This request changed. Close and review it again.",
    "Bu sorğu dəyişib. Bağla və yenidən nəzərdən keçir.",
  ],
  PRODUCT_NOT_FOUND: [
    "This equipment could not be found.",
    "Bu avadanlıq tapılmadı.",
  ],
  INVALID_LOCALE: ["Choose a supported language.", "Dəstəklənən dili seç."],
  OFFER_NOT_FOUND: [
    "This order summary is no longer available.",
    "Bu sifariş xülasəsi artıq əlçatan deyil.",
  ],
  CONSENT_VERSION_MISMATCH: [
    "The summary version changed. Review it again.",
    "Xülasənin versiyası dəyişib. Yenidən nəzərdən keçir.",
  ],
  STOCK_CONFLICT: [
    "Stock changed. Refresh before continuing.",
    "Stok dəyişib. Davam etməzdən əvvəl yenilə.",
  ],
  INVALID_RETURN_TRANSITION: [
    "This return status changed. Refresh before continuing.",
    "Qaytarmanın vəziyyəti dəyişib. Davam etməzdən əvvəl yenilə.",
  ],
  RETURN_NOT_SELLABLE: [
    "Inspection must confirm sellable goods before resolution.",
    "Tamamlamadan əvvəl yoxlama məhsulun satışa yararlı olduğunu təsdiqləməlidir.",
  ],
  REPLACEMENT_CONSENT_REQUIRED: [
    "The customer must confirm the replacement first.",
    "Əvvəlcə müştəri əvəzləyici sifarişi təsdiqləməlidir.",
  ],
  EXCHANGE_NOT_READY: [
    "The exchange is not ready for confirmation.",
    "Dəyişdirmə təsdiq üçün hazır deyil.",
  ],
  EXCHANGE_PRICE_REVIEW_REQUIRED: [
    "The replacement price changed and needs review.",
    "Əvəzləyici məhsulun qiyməti dəyişib və yoxlanılmalıdır.",
  ],
  CASE_NOT_FOUND: [
    "This supply case could not be found.",
    "Bu təchizat işi tapılmadı.",
  ],
  CASE_CLOSED: ["This supply case is closed.", "Bu təchizat işi bağlanıb."],
  collection: ["Collection", "Kolleksiya"],
  business: ["For business", "Biznes üçün"],
  workspace: ["Workspace", "İdarəetmə"],
  account: ["My account", "Hesabım"],
  cart: ["Bag", "Səbət"],
  home: ["Home", "Ana səhifə"],
  shop: ["Explore the collection", "Kolleksiyaya bax"],
  details: ["Discover the details", "Ətraflı bax"],
  heroTitle: [
    "Your next idea.\nBetter equipped.",
    "Növbəti ideyan.\nDaha yaxşı təchizat.",
  ],
  heroText: [
    "Considered technology for the way you work, create and connect.",
    "İşləmək, yaratmaq və əlaqə qurmaq üçün düşünülmüş texnologiya.",
  ],
  heroMini: [
    "Big possibilities.\nSmall footprint.",
    "Böyük imkanlar.\nKiçik ölçü.",
  ],
  heroDrive: [
    "Carry more.\nCreate anywhere.",
    "Daha çoxunu daşı.\nHər yerdə yarat.",
  ],
  connected: [
    "A thoughtfully connected setup",
    "Düşünülmüş və əlaqəli iş mühiti",
  ],
  monitorCaption: ["See the bigger picture", "Daha geniş baxış"],
  miniCaption: ["Power, neatly packaged", "Kompakt ölçüdə güc"],
  driveCaption: ["Room for what comes next", "Növbəti işlər üçün yer"],
  view: ["View product", "Məhsula bax"],
  pause: ["Pause motion", "Hərəkəti dayandır"],
  play: ["Resume motion", "Hərəkəti davam etdir"],
  stock: ["Available", "Mövcuddur"],
  units: ["units", "ədəd"],
  supply: ["Supply on request", "Sifarişlə təchizat"],
  incoming: ["Incoming", "Gözlənilir"],
  curated: [
    "Good tools.\nGreat possibilities.",
    "Yaxşı alətlər.\nBöyük imkanlar.",
  ],
  curatedText: [
    "From the first connection to the final export. Find the right piece for your setup.",
    "İlk bağlantıdan son ixraca qədər. İş mühitin üçün uyğun avadanlığı tap.",
  ],
  all: ["All equipment", "Bütün avadanlıq"],
  networking: ["Networking", "Şəbəkə"],
  computers: ["Computers", "Kompüterlər"],
  components: ["Components", "Komponentlər"],
  storage: ["Storage", "Yaddaş"],
  peripherals: ["Displays", "Monitorlar"],
  power: ["Power", "Enerji"],
  search: ["Search equipment", "Avadanlıq axtar"],
  searchHint: ["Search by name or SKU…", "Ad və ya SKU ilə axtar…"],
  sort: ["Sort", "Sıralama"],
  featured: ["Featured", "Seçilmişlər"],
  lowPrice: ["Price: low to high", "Qiymət: ucuzdan bahaya"],
  highPrice: ["Price: high to low", "Qiymət: bahadan ucuza"],
  inStockOnly: ["Available now", "Hazırda mövcuddur"],
  noResults: [
    "No equipment matches these filters.",
    "Bu filtrlərə uyğun avadanlıq yoxdur.",
  ],
  resetFilters: ["Clear filters", "Filtrləri təmizlə"],
  results: ["products", "məhsul"],
  driveTitle: [
    "Small drive.\nWide-open possibilities.",
    "Kiçik disk.\nGeniş imkanlar.",
  ],
  driveText: [
    "Keep your projects close. RelayDrive pairs a terabyte of space with a simple USB-C connection.",
    "Layihələrini yanında saxla. RelayDrive bir terabayt yaddaşı sadə USB-C bağlantısı ilə birləşdirir.",
  ],
  bulkTitle: [
    "One setup?\nOr the whole team?",
    "Bir iş yeri?\nYoxsa bütün komanda?",
  ],
  bulkText: [
    "Tell us the equipment, quantity and deadline. We check stock and arrange a supply request for anything that needs sourcing.",
    "Avadanlığı, miqdarı və son tarixi seç. Stoku yoxlayıb çatışmayan məhsullar üçün təchizat sorğusu yaradaq.",
  ],
  bulkCTA: ["Plan your business order", "Biznes sifarişini planlaşdır"],
  verified: ["Verified availability", "Yoxlanılmış mövcudluq"],
  verifiedText: [
    "Stock is checked before you confirm.",
    "Təsdiqdən əvvəl stok yoxlanılır.",
  ],
  returnsPolicy: ["14-day return requests", "14 gün ərzində qaytarma sorğusu"],
  returnsText: [
    "Delivered goods are inspected before resolution.",
    "Çatdırılmış məhsullar qərardan əvvəl yoxlanılır.",
  ],
  delivery: ["Baku delivery", "Bakıya çatdırılma"],
  deliveryText: [
    "Your order summary shows supported timing.",
    "Sifariş xülasəsində mümkün tarix göstərilir.",
  ],
  footer: [
    "Equipment for the ideas ahead.",
    "Gələcək ideyalar üçün avadanlıq.",
  ],
  sandbox: [
    "Sandbox store · fictional equipment and simulated payment",
    "Demo mağaza · şərti avadanlıq və simulyasiya edilmiş ödəniş",
  ],
  originalArt: [
    "Illustrative product rendering",
    "Məhsulun illüstrativ təsviri",
  ],
  specs: ["The details that matter", "Vacib texniki xüsusiyyətlər"],
  specsText: [
    "Know exactly what fits your setup.",
    "İş mühitinə nəyin uyğun olduğunu dəqiq bil.",
  ],
  addBag: ["Add to bag", "Səbətə əlavə et"],
  added: ["Added to your bag", "Səbətə əlavə edildi"],
  quantity: ["Quantity", "Miqdar"],
  unitPrice: ["Unit price", "Vahid qiyməti"],
  total: ["Total", "Cəmi"],
  backCollection: ["Back to collection", "Kolleksiyaya qayıt"],
  notFound: ["This page could not be found.", "Bu səhifə tapılmadı."],
  related: ["Complete your setup", "İş mühitini tamamla"],
  ports: ["Ports", "Portlar"],
  speedMbps: ["Network speed", "Şəbəkə sürəti"],
  managed: ["Managed", "İdarə olunan"],
  poe: ["PoE", "PoE"],
  ramGb: ["Memory (GB)", "Yaddaş (GB)"],
  storageGb: ["Storage (GB)", "Disk (GB)"],
  cpu: ["Processor", "Prosessor"],
  os: ["Operating system", "Əməliyyat sistemi"],
  type: ["Type", "Növ"],
  capacityGb: ["Capacity (GB)", "Tutum (GB)"],
  form: ["Form factor", "Format"],
  speedMTs: ["Transfer rate (MT/s)", "Ötürmə sürəti (MT/s)"],
  interface: ["Interface", "İnterfeys"],
  speedGbps: ["Link speed (Gbps)", "Bağlantı sürəti (Gbps)"],
  inches: ["Display size (in)", "Ekran ölçüsü (düym)"],
  width: ["Horizontal resolution", "Üfüqi təsvir ölçüsü"],
  height: ["Vertical resolution", "Şaquli təsvir ölçüsü"],
  inputs: ["Inputs", "Girişlər"],
  va: ["Capacity (VA)", "Tutum (VA)"],
  watts: ["Power (W)", "Güc (W)"],
  yes: ["Yes", "Bəli"],
  no: ["No", "Xeyr"],
  none: ["Not included", "Daxil deyil"],
  emptyBag: [
    "Your next setup starts here.",
    "Növbəti iş mühitin buradan başlayır.",
  ],
  remove: ["Remove", "Sil"],
  checkout: ["Review this order", "Bu sifarişi nəzərdən keçir"],
  bagNote: [
    "Each item is confirmed as a separate order. Stock and prices are rechecked at review.",
    "Hər məhsul ayrıca sifariş kimi təsdiqlənir. Xülasədə stok və qiymət yenidən yoxlanılır.",
  ],
  signIn: ["Sign in", "Daxil ol"],
  signOut: ["Sign out", "Çıxış"],
  welcome: ["Welcome to your workspace.", "İdarəetmə panelinə xoş gəldin."],
  email: ["Email", "E-poçt"],
  password: ["Password", "Şifrə"],
  demoAccounts: ["Try a demo account", "Demo hesabı seç"],
  demoPassword: [
    "All demo accounts use the password shown below.",
    "Bütün demo hesabları aşağıdakı şifrədən istifadə edir.",
  ],
  customer: ["Customer", "Müştəri"],
  operator: ["Operator", "Operator"],
  purchaser: ["Purchaser", "Satınalma mütəxəssisi"],
  owner: ["Owner", "Sahib"],
  orders: ["Orders", "Sifarişlər"],
  myOrders: ["Your orders", "Sifarişlərin"],
  ordersText: [
    "Follow your equipment, from confirmation to delivery.",
    "Avadanlığını təsdiqdən çatdırılmaya qədər izlə.",
  ],
  noOrders: [
    "No orders yet. Find something for your next setup.",
    "Hələ sifariş yoxdur. Növbəti iş mühitin üçün avadanlıq seç.",
  ],
  order: ["Order", "Sifariş"],
  orderDetails: ["Order details", "Sifariş detalları"],
  deadline: [
    "Requested delivery deadline",
    "İstənilən çatdırılma üçün son tarix",
  ],
  destination: ["Destination", "Çatdırılma yeri"],
  baku: ["Baku", "Bakı"],
  partial: ["Allow partial delivery", "Hissə-hissə çatdırılmaya icazə ver"],
  substitution: [
    "Allow an alternative product",
    "Alternativ məhsula icazə ver",
  ],
  review: ["Review and confirm", "Nəzərdən keçir və təsdiqlə"],
  reviewText: [
    "Check this exact summary before creating the order.",
    "Sifarişi yaratmazdan əvvəl bu xülasəni yoxla.",
  ],
  prepare: ["Check availability and total", "Mövcudluğu və cəmi yoxla"],
  reserve: [
    "Units allocated on confirmation",
    "Təsdiqdən sonra ayrılacaq məhsullar",
  ],
  shortage: ["Units requiring supply", "Təchizat tələb edən məhsullar"],
  supportedDelivery: ["Supported delivery", "Mümkün çatdırılma"],
  supplyPending: [
    "Supplier confirmation is needed. Your requested deadline is not a delivery guarantee.",
    "Təchizatçı təsdiqi lazımdır. İstədiyin son tarix çatdırılma zəmanəti deyil.",
  ],
  consent: [
    "I confirm this equipment, quantity, total and supply conditions.",
    "Bu avadanlığı, miqdarı, məbləği və təchizat şərtlərini təsdiqləyirəm.",
  ],
  confirmOrder: ["Confirm sandbox order", "Demo sifarişi təsdiqlə"],
  confirmedMessage: ["Your order is recorded.", "Sifarişin qeydə alındı."],
  simulation: ["No real payment will be taken.", "Real ödəniş tutulmayacaq."],
  close: ["Close", "Bağla"],
  cancel: ["Cancel", "Ləğv et"],
  reason: ["Reason", "Səbəb"],
  cancelOrder: ["Request cancellation", "Ləğv sorğusu göndər"],
  cancelText: [
    "Before dispatch, cancellation may need an operator decision.",
    "Göndərişdən əvvəl ləğv üçün operator qərarı lazım ola bilər.",
  ],
  returnRequest: ["Request a return", "Qaytarma sorğusu"],
  returnText: [
    "Returns are inspected. Refunds and exchanges are simulated.",
    "Qaytarılan məhsullar yoxlanılır. Geri ödəniş və dəyişdirmə simulyasiya olunur.",
  ],
  resolution: ["Preferred resolution", "İstənilən həll"],
  refund: ["Refund", "Geri ödəniş"],
  exchange: ["Exchange", "Dəyişdirmə"],
  submit: ["Submit request", "Sorğunu göndər"],
  requestSaved: ["Request saved", "Sorğu qeydə alındı"],
  returns: ["Returns", "Qaytarmalar"],
  exchangeOffer: ["Review replacement", "Əvəzləyici sifarişə bax"],
  exchangeCredit: ["Exchange credit", "Dəyişdirmə krediti"],
  overview: ["Overview", "İcmal"],
  inventory: ["Inventory", "Stok"],
  procurement: ["Procurement", "Təchizat"],
  suppliers: ["Suppliers", "Təchizatçılar"],
  approvals: ["Approvals", "Təsdiqlər"],
  audit: ["Activity", "Əməliyyat tarixçəsi"],
  liveState: ["Your operations, connected.", "Əməliyyatların bir yerdə."],
  workspaceText: [
    "A clear view of customer demand, available stock and the next decision.",
    "Müştəri tələbi, mövcud stok və növbəti qərara aydın baxış.",
  ],
  refresh: ["Refresh", "Yenilə"],
  openOrders: ["Active orders", "Aktiv sifarişlər"],
  supplyCases: ["Supply cases", "Təchizat işləri"],
  availableUnits: ["Available units", "Mövcud məhsullar"],
  attention: ["Needs attention", "Diqqət tələb edir"],
  recentOrders: ["Recent orders", "Son sifarişlər"],
  nextDecision: ["The next supply decision", "Növbəti təchizat qərarı"],
  case: ["Case", "Təchizat işi"],
  budget: ["Budget", "Büdcə"],
  compare: ["Compare quotations", "Qiymət təkliflərini müqayisə et"],
  physical: ["Physical stock", "Fiziki stok"],
  movements: ["Stock movements", "Stok hərəkətləri"],
  source: ["Source", "Mənbə"],
  date: ["Date", "Tarix"],
  status: ["Status", "Vəziyyət"],
  actions: ["Actions", "Əməliyyatlar"],
  inspect: ["Inspect returned goods", "Qaytarılan məhsulları yoxla"],
  notes: ["Inspection / dispatch evidence", "Yoxlama / göndəriş sübutu"],
  outcome: ["Inspection result", "Yoxlama nəticəsi"],
  sellable: ["Sellable", "Satışa yararlı"],
  damaged: ["Damaged", "Zədələnmiş"],
  incomplete: ["Incomplete", "Natamam"],
  wrong_item: ["Wrong item", "Yanlış məhsul"],
  authorize: ["Authorize return", "Qaytarmanı qəbul et"],
  receive: ["Mark received", "Qəbul edildi kimi qeyd et"],
  reject: ["Reject request", "Sorğunu rədd et"],
  resolve: ["Resolve refund", "Geri ödənişi tamamla"],
  processingAction: ["Start processing", "Emala başla"],
  shipAction: ["Record dispatch", "Göndərişi qeyd et"],
  deliverAction: ["Record delivery", "Çatdırılmanı qeyd et"],
  confirmed: ["Confirmed", "Təsdiqləndi"],
  awaiting_supply: ["Awaiting supply", "Təchizat gözlənilir"],
  processing: ["Processing", "Emal olunur"],
  cancellation_requested: ["Cancellation requested", "Ləğv tələb olunur"],
  shipped: ["Dispatched", "Göndərildi"],
  delivered: ["Delivered", "Çatdırıldı"],
  cancelled: ["Cancelled", "Ləğv edildi"],
  draft: ["Draft", "Qaralama"],
  requested: ["Requested", "Sorğu göndərildi"],
  authorized: ["Authorized", "Qəbul olundu"],
  received: ["Received", "Qəbul edildi"],
  inspected: ["Inspected", "Yoxlanıldı"],
  resolved: ["Resolved", "Tamamlandı"],
  rejected: ["Rejected", "Rədd edildi"],
  open: ["Open", "Açıq"],
  closed: ["Closed", "Bağlandı"],
  waiting: ["Waiting", "Gözlənilir"],
  committed: ["Committed", "Öhdəlik götürüldü"],
  escalated: ["Needs review", "Baxış tələb edir"],
  noRecords: ["No records to show.", "Göstəriləcək qeyd yoxdur."],
  disconnected: ["Not connected yet", "Hələ qoşulmayıb"],
  approvalsText: [
    "Telegram decisions and purchasing execution will appear here when connected. No approval has been sent.",
    "Telegram qərarları və satınalma əməliyyatları qoşulduqdan sonra burada görünəcək. Təsdiq sorğusu göndərilməyib.",
  ],
  assistantTitle: ["Need a hand choosing?", "Seçimdə kömək lazımdır?"],
  assistantText: [
    "The AI assistant is coming in the next stage. For now, explore verified specifications or create a business supply request.",
    "AI köməkçisi növbəti mərhələdə qoşulacaq. Hazırda yoxlanılmış xüsusiyyətlərə bax və ya biznes təchizat sorğusu yarat.",
  ],
  assistant: ["Equipment help", "Avadanlıq üzrə kömək"],
  quoteText: [
    "Checked against the case budget, specifications and delivery deadline. This is a rules-based comparison; no purchase has been placed.",
    "Büdcə, texniki xüsusiyyətlər və son tarixə görə yoxlanılıb. Bu qayda əsaslı müqayisədir; satınalma aparılmayıb.",
  ],
  feasible: ["Meets requirements", "Tələblərə uyğundur"],
  notFeasible: ["Outside requirements", "Tələblərə uyğun deyil"],
  supplierDelivery: ["Customer delivery", "Müştəriyə çatdırılma"],
  excess: ["Excess units", "Əlavə məhsullar"],
  OVER_BUDGET: ["Exceeds the case budget", "Təchizat büdcəsini aşır"],
  MISSES_DEADLINE: [
    "Misses the requested deadline",
    "İstənilən son tarixə çatmır",
  ],
  QUOTE_EXPIRED: ["Quotation has expired", "Qiymət təklifinin müddəti bitib"],
  SPEC_MISMATCH: [
    "Specifications do not match",
    "Texniki xüsusiyyətlər uyğun deyil",
  ],
  DESTINATION_MISMATCH: [
    "Delivery destination does not match",
    "Çatdırılma yeri uyğun deyil",
  ],
  INSUFFICIENT_SUPPLIER_STOCK: [
    "Supplier stock is insufficient",
    "Təchizatçının stoku kifayət etmir",
  ],
  INVALID_PROMISE: [
    "Delivery promise needs review",
    "Çatdırılma vədi yoxlanılmalıdır",
  ],
  INCOMPLETE_OR_UNSUPPORTED_QUOTE: [
    "Quotation needs clarification",
    "Qiymət təklifi dəqiqləşdirilməlidir",
  ],
  CONNECTION_ERROR: [
    "Could not reach the store. Check that the API is running and retry.",
    "Mağazaya qoşulmaq mümkün olmadı. API-nin işlədiyini yoxla və yenidən sına.",
  ],
  UNAUTHORIZED: [
    "Your session has expired. Please sign in again.",
    "Sessiyanın müddəti bitib. Yenidən daxil ol.",
  ],
  INVALID_CREDENTIALS: [
    "Email or password is incorrect.",
    "E-poçt və ya şifrə yanlışdır.",
  ],
  FORBIDDEN: [
    "This account cannot perform that action.",
    "Bu hesab həmin əməliyyatı edə bilməz.",
  ],
  INVALID_INPUT: [
    "Check the information and try again.",
    "Məlumatları yoxla və yenidən sına.",
  ],
  INVALID_REQUEST: [
    "This request could not be accepted.",
    "Bu sorğu qəbul edilə bilmədi.",
  ],
  INTERNAL_ERROR: [
    "Something went wrong. Please try again.",
    "Xəta baş verdi. Yenidən sına.",
  ],
  RATE_LIMITED: [
    "Too many sign-in attempts. Wait one minute.",
    "Çox sayda giriş cəhdi. Bir dəqiqə gözlə.",
  ],
  NEW_CONSENT_REQUIRED: [
    "Stock or price changed. Review a fresh order summary.",
    "Stok və ya qiymət dəyişib. Yeni sifariş xülasəsini yoxla.",
  ],
  CONSENT_EXPIRED: [
    "This summary expired. Review the order again.",
    "Xülasənin müddəti bitib. Sifarişi yenidən yoxla.",
  ],
  DEADLINE_IN_PAST: [
    "Choose a future delivery deadline.",
    "Gələcək çatdırılma tarixi seç.",
  ],
  DELIVERY_NOT_FEASIBLE: [
    "This deadline is too soon. Choose a later date.",
    "Bu tarix çox yaxındır. Daha gec tarix seç.",
  ],
  ALREADY_DISPATCHED: [
    "Dispatched orders cannot be cancelled.",
    "Göndərilmiş sifarişləri ləğv etmək olmaz.",
  ],
  OWNER_EXCEPTION_REQUIRED: [
    "This request needs an owner exception.",
    "Bu sorğu üçün sahibin istisna qərarı lazımdır.",
  ],
  NOT_DELIVERED: [
    "A return requires a delivered order.",
    "Qaytarma üçün sifariş çatdırılmalıdır.",
  ],
  INVALID_ORDER_TRANSITION: [
    "This order status changed. Refresh and try again.",
    "Sifariş vəziyyəti dəyişib. Yenilə və yenidən sına.",
  ],
  RESERVATION_REVALIDATION_REQUIRED: [
    "The reservation needs review before dispatch.",
    "Göndərişdən əvvəl rezervasiya yoxlanılmalıdır.",
  ],
  ORDER_NOT_FOUND: [
    "This order is not available to this account.",
    "Bu sifariş bu hesab üçün əlçatan deyil.",
  ],
  RETURN_QUANTITY_EXCEEDED: [
    "The return quantity exceeds the delivered balance.",
    "Qaytarılan miqdar çatdırılmış qalığı aşır.",
  ],
  RETURN_NOT_FOUND: [
    "This return could not be found.",
    "Bu qaytarma tapılmadı.",
  ],
  EXCHANGE_CONSENT_STALE: [
    "The replacement offer changed. Review it again.",
    "Əvəzləyici təklif dəyişib. Yenidən yoxla.",
  ],
  loading: ["Loading your equipment…", "Avadanlıq yüklənir…"],
  retry: ["Try again", "Yenidən sına"],
  back: ["Back", "Geri"],
  menu: ["Menu", "Menyu"],
  businessClock: ["Demo date", "Demo tarixi"],
} as const satisfies Record<string, readonly [string, string]>;
export type MessageKey = keyof typeof messages;
export const translate = (locale: Locale, key: MessageKey) =>
  messages[key][locale === "az" ? 1 : 0];
export const translatedCode = (locale: Locale, value: string) =>
  value in messages
    ? translate(locale, value as MessageKey)
    : translate(locale, "INTERNAL_ERROR");
export const money = (locale: Locale, amount: number) => {
  const digits = amount % 100 === 0 ? 0 : 2;
  if (locale === "en")
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "AZN",
      minimumFractionDigits: digits,
      maximumFractionDigits: 2,
    }).format(amount / 100);
  // Chromium builds without Azerbaijani CLDR data still get the exact local convention.
  const number = new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: 2,
  })
    .format(amount / 100)
    .replace(/[,.]/g, (mark) => (mark === "," ? "." : ","));
  return `${number} ₼`;
};
const azMonths = [
  "yanvar",
  "fevral",
  "mart",
  "aprel",
  "may",
  "iyun",
  "iyul",
  "avqust",
  "sentyabr",
  "oktyabr",
  "noyabr",
  "dekabr",
];
export const date = (locale: Locale, value: string) => {
  const instant = new Date(value);
  if (locale === "en")
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeZone: "Asia/Baku",
    }).format(instant);
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    timeZone: "Asia/Baku",
  }).formatToParts(instant);
  const part = (kind: string) => parts.find((p) => p.type === kind)!.value;
  return `${part("day")} ${azMonths[Number(part("month")) - 1]} ${part("year")}`;
};
