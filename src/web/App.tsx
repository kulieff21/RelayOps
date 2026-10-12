import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUpRight,
  ShoppingBag,
  UserRound,
  Menu,
  X,
  ChevronRight,
} from "lucide-react";
import { ShopContext, Link, type Overlay, useShop } from "./shop";
import { translate, translatedCode, type MessageKey } from "./i18n";
import { ApiError, readSaved, request, save } from "./api";
import type { CartLine, Locale, Product, Session } from "./types";
import { Home, Collection, ProductPage, BusinessPage } from "./Storefront";
import { Dialogs } from "./Dialogs";
import { AccountPage, OrderPage } from "./Orders";
import { WorkspacePage } from "./Workspace";
import { AssistantPage } from "./Assistant";

export function Brand({ small = false }: { small?: boolean }) {
  return (
    <Link to="/" className="brand">
      <img src="/mark.svg" alt="" width="36" height="36" />
      <span>RelayOps{!small && <small>Supply</small>}</span>
    </Link>
  );
}
function Header() {
  const { t, locale, setLocale, session, cart, open, url } = useShop();
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    setMenu(false);
  }, [url]);
  const count = cart.reduce((n, item) => n + item.quantity, 0);
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Brand />
        <nav
          className={menu ? "main-nav expanded" : "main-nav"}
          aria-label={t("menu")}
        >
          <Link
            to="/collection"
            className={url.startsWith("/collection") ? "active" : ""}
          >
            {t("collection")}
          </Link>
          <Link to="/business">{t("business")}</Link>
          <Link
            to="/assistant"
            className={url === "/assistant" ? "active" : ""}
          >
            {t("assistant")}
          </Link>
          <Link to="/workspace/overview">
            {t("workspace")}
            <ArrowUpRight size={14} />
          </Link>
        </nav>
        <div className="header-tools">
          <button
            className="locale"
            aria-label={
              locale === "en" ? "Switch to Azerbaijani" : "İngilis dilinə keç"
            }
            onClick={() => setLocale(locale === "en" ? "az" : "en")}
          >
            {locale.toUpperCase()}
            <ChevronRight size={12} />
          </button>
          <Link
            to="/account"
            className="icon-button account-tool"
            aria-label={t("account")}
          >
            <UserRound size={20} />
            {session && <i />}
          </Link>
          <button
            className="bag-button"
            onClick={() => open({ type: "cart" })}
            aria-label={`${t("cart")} (${count})`}
          >
            <ShoppingBag size={19} />
            <span>{t("cart")}</span>
            <b>{count}</b>
          </button>
          <button
            className="icon-button mobile-menu"
            onClick={() => setMenu(!menu)}
            aria-expanded={menu}
            aria-label={t("menu")}
          >
            {menu ? <X /> : <Menu />}
          </button>
        </div>
      </div>
    </header>
  );
}
function Footer() {
  const { t } = useShop();
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-top">
          <div>
            <Brand />
            <p>{t("footer")}</p>
          </div>
          <div className="footer-links">
            <Link to="/collection">{t("collection")}</Link>
            <Link to="/account">{t("myOrders")}</Link>
            <Link to="/business">{t("business")}</Link>
            <Link to="/assistant">{t("assistant")}</Link>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 RelayOps Supply</span>
          <span>{t("sandbox")}</span>
        </div>
      </div>
    </footer>
  );
}
export function App() {
  const [locale, setLocale] = useState<Locale>(() =>
    readSaved<Locale>("relayops-locale", "en") === "az" ? "az" : "en",
  );
  const [session, setSession] = useState<Session | null>(() => {
    const saved = readSaved<Session | null>(
      "relayops-session",
      null,
      sessionStorage,
    );
    return saved?.expiresAt && Date.parse(saved.expiresAt) > Date.now()
      ? saved
      : null;
  });
  const [cart, setCart] = useState<CartLine[]>(() => {
    const saved = readSaved<unknown>("relayops-cart", []);
    return Array.isArray(saved)
      ? saved.filter(
          (line): line is CartLine =>
            !!line &&
            typeof line.productId === "string" &&
            Number.isInteger(line.quantity) &&
            line.quantity > 0 &&
            line.quantity <= 10000,
        )
      : [];
  });
  const [products, setProducts] = useState<Product[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [overlay, open] = useState<Overlay | null>(null);
  const [url, setUrl] = useState(location.pathname + location.search);
  const [toast, notify] = useState("");
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const t = useCallback((key: MessageKey) => translate(locale, key), [locale]);
  const navigate = useCallback((path: string) => {
    history.pushState(null, "", path);
    setUrl(path);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);
  const fail = useCallback(
    (error: unknown) => {
      if (error instanceof ApiError && error.code === "UNAUTHORIZED")
        setSession(null);
      notify(
        translatedCode(
          locale,
          error instanceof ApiError ? error.code : "INTERNAL_ERROR",
        ),
      );
    },
    [locale],
  );
  useEffect(() => {
    const pop = () => {
      setUrl(location.pathname + location.search);
      window.scrollTo({ top: 0, behavior: "instant" });
    };
    addEventListener("popstate", pop);
    return () => removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    save("relayops-locale", locale);
    document.documentElement.lang = locale;
  }, [locale]);
  useEffect(() => {
    save("relayops-cart", cart);
  }, [cart]);
  useEffect(() => {
    save("relayops-session", session, sessionStorage);
  }, [session]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => notify(""), 5500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    let current = true;
    setCatalogError(null);
    request<Product[]>(`/api/products?locale=${locale}`)
      .then((result) => {
        if (current) {
          setProducts(result);
          setCatalogError(null);
        }
      })
      .catch((error) => {
        if (current)
          setCatalogError(
            error instanceof ApiError ? error.code : "CONNECTION_ERROR",
          );
      });
    return () => {
      current = false;
    };
  }, [locale, revision]);
  useEffect(() => {
    if (!session) return;
    request("/api/auth/me", session).catch((error) => {
      if (error instanceof ApiError && error.code === "UNAUTHORIZED")
        setSession(null);
    });
  }, [session]);
  const add = (productId: string, quantity = 1) => {
    setCart((items) => {
      const old = items.find((item) => item.productId === productId);
      return old
        ? items.map((item) =>
            item.productId === productId
              ? { ...item, quantity: Math.min(10000, item.quantity + quantity) }
              : item,
          )
        : [...items, { productId, quantity }];
    });
    notify(t("added"));
  };
  const path = url.split("?")[0]!;
  const staff = path.startsWith("/workspace");
  const page =
    path === "/" ? (
      <Home />
    ) : path === "/collection" ? (
      <Collection />
    ) : path.startsWith("/product/") ? (
      <ProductPage id={decodeURIComponent(path.slice(9))} />
    ) : path === "/business" ? (
      <BusinessPage />
    ) : path === "/account" ? (
      <AccountPage />
    ) : path === "/assistant" ? (
      <AssistantPage key={session?.account.id ?? "guest"} />
    ) : path.startsWith("/orders/") ? (
      <OrderPage id={decodeURIComponent(path.slice(8))} />
    ) : staff ? (
      <WorkspacePage view={path.split("/")[2] ?? "overview"} />
    ) : (
      <div className="container empty-state">
        <h1>{t("notFound")}</h1>
        <Link to="/" className="button">
          {t("home")}
        </Link>
      </div>
    );
  return (
    <ShopContext.Provider
      value={{
        locale,
        setLocale,
        t,
        session,
        setSession,
        cart,
        setCart,
        products,
        overlay,
        open,
        url,
        navigate,
        notify,
        fail,
        revision,
        refresh,
        add,
      }}
    >
      <a className="skip-link" href="#main">
        {locale === "en" ? "Skip to content" : "Məzmuna keç"}
      </a>
      <Header />
      <main id="main">
        {products.length ? (
          <AnimatePresence mode="wait">
            <motion.div
              key={path}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              {page}
            </motion.div>
          </AnimatePresence>
        ) : (
          <div className="container empty-state">
            <p>
              {catalogError
                ? translatedCode(locale, catalogError)
                : t("loading")}
            </p>
            {catalogError && (
              <button className="button" onClick={refresh}>
                {t("retry")}
              </button>
            )}
          </div>
        )}
      </main>
      {!staff && <Footer />}
      <Dialogs />
      <AnimatePresence>
        {toast && (
          <motion.div
            className="toast"
            role="status"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {toast}
            <button onClick={() => notify("")} aria-label={t("close")}>
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </ShopContext.Provider>
  );
}
