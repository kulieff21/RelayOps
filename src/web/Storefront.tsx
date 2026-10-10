import { useEffect, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useReducedMotion,
} from "motion/react";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Check,
  Pause,
  Play,
  Search,
  Minus,
  Plus,
  Box,
  Truck,
  RotateCcw,
  PackageCheck,
} from "lucide-react";
import { Link, useShop } from "./shop";
import { ProductArt } from "./ProductArt";
import { money, type MessageKey } from "./i18n";
import type { Product } from "./types";

const heroIds = ["MON-QHD-27", "PC-MINI-16", "SSD-EXT-1T"];
const categories: MessageKey[] = [
  "networking",
  "computers",
  "components",
  "storage",
  "peripherals",
  "power",
];
const highlights: Record<string, string[]> = {
  "MON-QHD-27": ["27″", "QHD", "2560 × 1440"],
  "PC-MINI-16": ["16 GB", "512 GB", "6-core"],
  "SSD-EXT-1T": ["1 TB", "USB-C", "10 Gbps"],
  "NET-SW-24G": ["24 ports", "1 Gbps", "Managed"],
  "RAM-DDR5-16": ["16 GB", "DDR5", "5600 MT/s"],
  "UPS-900": ["900 VA", "540 W", "UPS"],
};
export function ProductCard({
  product,
  index = 0,
}: {
  product: Product;
  index?: number;
}) {
  const { t, locale, add } = useShop();
  return (
    <article className={`product-card card-tone-${index % 3}`}>
      <Link
        to={`/product/${product.id}`}
        className="product-card-stage"
        aria-label={product.name}
      >
        <span
          className={
            product.available > 0 ? "stock-dot" : "stock-dot supply-dot"
          }
        >
          {product.available > 0
            ? `${product.available} ${t("stock")}`
            : t("supply")}
        </span>
        <ProductArt id={product.id} />
        <span className="round-link">
          <ArrowUpRight size={21} />
        </span>
      </Link>
      <div className="product-card-info">
        <div>
          <p className="category-label">{t(product.category as MessageKey)}</p>
          <Link to={`/product/${product.id}`}>
            <h3>{product.name}</h3>
          </Link>
          <p className="card-specs">{highlights[product.id]?.join(" / ")}</p>
        </div>
        <div className="card-buy">
          <strong>{money(locale, product.price)}</strong>
          <button
            className="icon-button add-button"
            onClick={() => add(product.id)}
            aria-label={`${t("addBag")}: ${product.name}`}
          >
            <Plus size={18} />
          </button>
        </div>
      </div>
    </article>
  );
}
function Hero() {
  const { t, products, locale } = useShop();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = useReducedMotion();
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const rotateY = useSpring(pointerX, { stiffness: 80, damping: 25 });
  const rotateX = useSpring(pointerY, { stiffness: 80, damping: 25 });
  const product = products.find((p) => p.id === heroIds[index])!;
  const title =
    index === 1 ? t("heroMini") : index === 2 ? t("heroDrive") : t("heroTitle");
  const caption =
    index === 1
      ? t("miniCaption")
      : index === 2
        ? t("driveCaption")
        : t("monitorCaption");
  return (
    <section
      className={`hero hero-tone-${index} ${paused ? "motion-paused" : ""}`}
    >
      <div className="container hero-inner">
        <div className="hero-main">
          <div className="hero-copy">
            <p className="hero-intro">
              <span className="tiny-mark" />
              {t("connected")}
            </p>
            <AnimatePresence mode="wait">
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.35 }}
              >
                <h1>{title}</h1>
                <p className="hero-text">{t("heroText")}</p>
                <div className="hero-actions">
                  <Link className="button" to={`/product/${product.id}`}>
                    {t("details")}
                    <ArrowUpRight size={18} />
                  </Link>
                  <Link className="text-link" to="/collection">
                    {t("collection")}
                    <ArrowRight size={17} />
                  </Link>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
          <div
            className="hero-stage"
            onPointerMove={(event) => {
              if (reduced || paused) return;
              const box = event.currentTarget.getBoundingClientRect();
              pointerX.set(
                ((event.clientX - box.x - box.width / 2) / box.width) * 12,
              );
              pointerY.set(
                (-(event.clientY - box.y - box.height / 2) / box.height) * 9,
              );
            }}
            onPointerLeave={() => {
              pointerX.set(0);
              pointerY.set(0);
            }}
          >
            <div className="stage-orbit orbit-one" />
            <div className="stage-orbit orbit-two" />
            <div className="stage-light" />
            <AnimatePresence mode="wait">
              <motion.div
                key={product.id}
                className="hero-art"
                style={{ rotateX, rotateY }}
                initial={{ opacity: 0, x: 55, scale: 0.92 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -35, scale: 0.94 }}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              >
                <ProductArt id={product.id} animated={!paused && !reduced} />
              </motion.div>
            </AnimatePresence>
            <div className="stage-caption">
              <span className="caption-rule" />
              <div>
                <span>{caption}</span>
                <strong>{product.name}</strong>
              </div>
            </div>
            <button
              className="motion-toggle icon-button"
              onClick={() => setPaused(!paused)}
              aria-label={t(paused ? "play" : "pause")}
            >
              {paused ? <Play size={16} /> : <Pause size={16} />}
            </button>
          </div>
        </div>
        <div className="hero-bottom">
          <span className="hero-note">
            {t("verified")}
            <Check size={16} />
          </span>
          <div
            className="product-selector"
            role="group"
            aria-label={t("collection")}
          >
            {heroIds.map((id, i) => (
              <button
                key={id}
                className={i === index ? "selected" : ""}
                onClick={() => setIndex(i)}
                aria-pressed={i === index}
              >
                <span>{products.find((p) => p.id === id)?.name}</span>
                <small>
                  {money(locale, products.find((p) => p.id === id)!.price)}
                </small>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
export function Home() {
  const { t, products } = useShop();
  const featuredIds = ["PC-MINI-16", "MON-QHD-27", "SSD-EXT-1T"];
  return (
    <>
      <Hero />
      <div className="benefit-strip container">
        {[
          [PackageCheck, "verified", "verifiedText"],
          [Truck, "delivery", "deliveryText"],
          [RotateCcw, "returnsPolicy", "returnsText"],
        ].map(([Icon, title, text], i) => {
          const I = Icon as typeof PackageCheck;
          return (
            <div key={i}>
              <I size={25} />
              <div>
                <strong>{t(title as MessageKey)}</strong>
                <span>{t(text as MessageKey)}</span>
              </div>
            </div>
          );
        })}
      </div>
      <section className="collection-section container">
        <div className="section-heading">
          <div>
            <h2>{t("curated")}</h2>
            <p>{t("curatedText")}</p>
          </div>
          <Link to="/collection" className="text-link">
            {t("all")}
            <ArrowUpRight size={20} />
          </Link>
        </div>
        <div className="product-grid">
          {featuredIds.map((id, index) => (
            <ProductCard
              key={id}
              product={products.find((p) => p.id === id)!}
              index={index}
            />
          ))}
        </div>
      </section>
      <section className="storage-feature">
        <div className="container storage-inner">
          <div className="storage-scene">
            <div className="storage-orbit" />
            <ProductArt id="SSD-EXT-1T" animated />
            <span className="feature-spec">
              <strong>1 TB</strong>
              <span>USB-C / 10 Gbps</span>
            </span>
          </div>
          <div className="feature-copy">
            <span className="feature-product">RelayDrive 1T</span>
            <h2>{t("driveTitle")}</h2>
            <p>{t("driveText")}</p>
            <Link to="/product/SSD-EXT-1T" className="button button-light">
              {t("view")}
              <ArrowUpRight size={19} />
            </Link>
          </div>
        </div>
      </section>
      <section className="business-feature container">
        <div className="business-copy">
          <h2>{t("bulkTitle")}</h2>
          <p>{t("bulkText")}</p>
          <Link to="/business" className="text-link">
            {t("bulkCTA")}
            <ArrowUpRight size={20} />
          </Link>
        </div>
        <div className="network-scene">
          <ProductArt id="NET-SW-24G" />
          <span className="network-node node-a">
            <Box size={16} />
            {t("inventory")}
          </span>
          <span className="network-node node-b">
            <Truck size={16} />
            {t("delivery")}
          </span>
          <svg
            className="network-path"
            viewBox="0 0 500 320"
            aria-hidden="true"
          >
            <path
              d="M90 90Q240 35 420 80M95 98Q10 250 340 250"
              pathLength="100"
            />
            <circle r="4">
              <animateMotion
                dur="7s"
                repeatCount="indefinite"
                path="M90 90Q240 35 420 80"
              />
            </circle>
          </svg>
        </div>
      </section>
    </>
  );
}
export function Collection() {
  const { t, locale, products, url, navigate } = useShop();
  const category =
    new URLSearchParams(url.split("?")[1]).get("category") ?? "all";
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("featured");
  const [available, setAvailable] = useState(false);
  const shown = products
    .filter(
      (product) =>
        (category === "all" || product.category === category) &&
        (!available || product.available > 0) &&
        `${product.name} ${product.id}`
          .toLocaleLowerCase(locale)
          .includes(query.toLocaleLowerCase(locale)),
    )
    .sort((a, b) =>
      sort === "low"
        ? a.price - b.price
        : sort === "high"
          ? b.price - a.price
          : 0,
    );
  return (
    <section className="container catalog-page">
      <div className="page-heading">
        <p>{t("collection")}</p>
        <h1>{t("curated")}</h1>
        <span>{t("curatedText")}</span>
      </div>
      <div className="category-tabs" aria-label={t("collection")}>
        <button
          className={category === "all" ? "selected" : ""}
          onClick={() => navigate("/collection")}
        >
          {t("all")}
        </button>
        {categories.map((key) => (
          <button
            key={key}
            className={category === key ? "selected" : ""}
            onClick={() => navigate(`/collection?category=${key}`)}
          >
            {t(key)}
          </button>
        ))}
      </div>
      <div className="catalog-controls">
        <label className="search-control">
          <Search size={18} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchHint")}
            aria-label={t("search")}
          />
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={available}
            onChange={(e) => setAvailable(e.target.checked)}
          />
          {t("inStockOnly")}
        </label>
        <label className="sort-control">
          <span>{t("sort")}</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="featured">{t("featured")}</option>
            <option value="low">{t("lowPrice")}</option>
            <option value="high">{t("highPrice")}</option>
          </select>
        </label>
      </div>
      <p className="results-count">
        {shown.length} {t("results")}
      </p>
      {shown.length ? (
        <div className="product-grid catalog-grid">
          {shown.map((product, index) => (
            <ProductCard key={product.id} product={product} index={index} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <p>{t("noResults")}</p>
          <button
            className="button"
            onClick={() => {
              setQuery("");
              setAvailable(false);
              navigate("/collection");
            }}
          >
            {t("resetFilters")}
          </button>
        </div>
      )}
    </section>
  );
}
export function Quantity({
  value,
  onChange,
  max = 10000,
}: {
  value: number;
  onChange: (value: number) => void;
  max?: number;
}) {
  const { t } = useShop();
  return (
    <div className="quantity">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, value - 1))}
        disabled={value <= 1}
        aria-label={`${t("quantity")} −`}
      >
        <Minus size={15} />
      </button>
      <input
        type="number"
        min="1"
        max={max}
        aria-label={t("quantity")}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isInteger(n) && n > 0 && n <= max) onChange(n);
        }}
      />
      <button
        type="button"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        aria-label={`${t("quantity")} +`}
      >
        <Plus size={15} />
      </button>
    </div>
  );
}
export function ProductPage({ id }: { id: string }) {
  const { t, products, locale, add, open } = useShop();
  const product = products.find((p) => p.id === id);
  const [quantity, setQuantity] = useState(1);
  const [angle, setAngle] = useState(0);
  useEffect(() => {
    setQuantity(1);
    setAngle(0);
  }, [id]);
  if (!product)
    return (
      <div className="container empty-state">
        <h1>{t("notFound")}</h1>
        <Link to="/collection">{t("backCollection")}</Link>
      </div>
    );
  return (
    <>
      <section className="container detail-page">
        <Link to="/collection" className="text-link breadcrumb">
          <ArrowLeft size={16} />
          {t("backCollection")}
        </Link>
        <div className="detail-main">
          <div className="detail-visual">
            <div className="detail-halo" />
            <motion.div
              animate={{ rotateY: angle }}
              transition={{ type: "spring", stiffness: 70, damping: 18 }}
            >
              <ProductArt id={id} animated />
            </motion.div>
            <div className="angle-control" aria-label={t("view")}>
              <button
                onClick={() => setAngle(Math.max(-20, angle - 10))}
                aria-label={
                  locale === "en" ? "Rotate product left" : "Məhsulu sola çevir"
                }
              >
                <ArrowLeft size={16} />
              </button>
              <span>{t("originalArt")}</span>
              <button
                onClick={() => setAngle(Math.min(20, angle + 10))}
                aria-label={
                  locale === "en"
                    ? "Rotate product right"
                    : "Məhsulu sağa çevir"
                }
              >
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
          <div className="detail-copy">
            <span className="category-label">
              {t(product.category as MessageKey)}
            </span>
            <h1>{product.name}</h1>
            <p>{product.description}</p>
            <div className="spec-pills">
              {highlights[id]?.map((value) => (
                <span key={value}>{value}</span>
              ))}
            </div>
            <strong className="detail-price">
              {money(locale, product.price)}
            </strong>
            <p
              className={
                product.available > 0 ? "availability" : "availability pending"
              }
            >
              <i />
              {product.available > 0
                ? `${product.available} ${t("units")} ${t("stock")}`
                : t("supply")}
            </p>
            {product.incoming > 0 && (
              <p>
                {t("incoming")}: {product.incoming}
              </p>
            )}
            <div className="detail-buy">
              <Quantity value={quantity} onChange={setQuantity} />
              <button className="button" onClick={() => add(id, quantity)}>
                {t("addBag")}
                <Plus size={18} />
              </button>
            </div>
            <button
              className="text-link"
              onClick={() =>
                open({ type: "checkout", productId: id, quantity })
              }
            >
              {t("checkout")}
              <ArrowUpRight size={17} />
            </button>
            <div className="detail-guarantees">
              <span>
                <Truck size={16} />
                {t("delivery")}
              </span>
              <span>
                <RotateCcw size={16} />
                {t("returnsPolicy")}
              </span>
            </div>
          </div>
        </div>
        <div className="spec-section">
          <div>
            <h2>{t("specs")}</h2>
            <p>{t("specsText")}</p>
            <code>{id}</code>
          </div>
          <dl className="spec-table">
            {Object.entries(product.specs).map(([key, value]) => (
              <div key={key}>
                <dt>{t(key as MessageKey)}</dt>
                <dd>
                  {typeof value === "boolean"
                    ? t(value ? "yes" : "no")
                    : value === "none"
                      ? t("none")
                      : value === "Demo six-core"
                        ? locale === "en"
                          ? "Demo six-core"
                          : "Demo altı nüvəli"
                        : Array.isArray(value)
                          ? value.join(", ")
                          : String(value)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
      <section className="container related-section">
        <div className="section-heading">
          <h2>{t("related")}</h2>
          <Link to="/collection" className="text-link">
            {t("all")}
            <ArrowUpRight size={18} />
          </Link>
        </div>
        <div className="product-grid">
          {products
            .filter((p) => p.id !== id)
            .slice(0, 3)
            .map((p, i) => (
              <ProductCard key={p.id} product={p} index={i} />
            ))}
        </div>
      </section>
    </>
  );
}
export function BusinessPage() {
  const { t, products, open, locale } = useShop();
  const [id, setId] = useState("NET-SW-24G");
  const [quantity, setQuantity] = useState(20);
  const product = products.find((p) => p.id === id)!;
  return (
    <section className="container business-page">
      <div className="business-page-copy">
        <p className="category-label">{t("business")}</p>
        <h1>{t("bulkTitle")}</h1>
        <p>{t("bulkText")}</p>
        <div className="business-steps">
          <div>
            <span>
              <PackageCheck />
            </span>
            <div>
              <strong>{t("verified")}</strong>
              <p>{t("verifiedText")}</p>
            </div>
          </div>
          <div>
            <span>
              <Box />
            </span>
            <div>
              <strong>{t("procurement")}</strong>
              <p>{t("supplyPending")}</p>
            </div>
          </div>
        </div>
        <Link to="/workspace/procurement" className="text-link">
          {t("workspace")}
          <ArrowUpRight size={18} />
        </Link>
      </div>
      <div className="business-order-card">
        <ProductArt id={id} />
        <label>
          {t("collection")}
          <select value={id} onChange={(e) => setId(e.target.value)}>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="bulk-quantity">
          <span>{t("quantity")}</span>
          <Quantity value={quantity} onChange={setQuantity} />
        </div>
        <div className="summary-line">
          <span>{t("total")}</span>
          <strong>{money(locale, product.price * quantity)}</strong>
        </div>
        <p className="small-muted">{t("bagNote")}</p>
        <button
          className="button"
          onClick={() => open({ type: "checkout", productId: id, quantity })}
        >
          {t("prepare")}
          <ArrowUpRight size={18} />
        </button>
      </div>
    </section>
  );
}
