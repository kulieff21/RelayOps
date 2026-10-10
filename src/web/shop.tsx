import {
  createContext,
  useContext,
  type ReactNode,
  type MouseEvent,
} from "react";
import type { CartLine, Locale, Product, Session } from "./types";
import type { MessageKey } from "./i18n";

export type Overlay =
  | { type: "login" }
  | { type: "cart" }
  | { type: "help" }
  | { type: "checkout"; productId: string; quantity: number; returnId?: string }
  | { type: "cancel"; orderId: string; quantity: number }
  | { type: "return"; orderId: string; quantity: number }
  | { type: "staff"; resource: string; action: string; id: string };
export interface ShopState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey) => string;
  products: Product[];
  session: Session | null;
  setSession: (session: Session | null) => void;
  cart: CartLine[];
  setCart: (cart: CartLine[]) => void;
  add: (productId: string, quantity?: number) => void;
  overlay: Overlay | null;
  open: (overlay: Overlay | null) => void;
  url: string;
  navigate: (path: string) => void;
  notify: (text: string) => void;
  fail: (error: unknown) => void;
  revision: number;
  refresh: () => void;
}
export const ShopContext = createContext<ShopState | null>(null);
export const useShop = () => {
  const shop = useContext(ShopContext);
  if (!shop) throw new Error("Shop provider missing");
  return shop;
};
export function Link({
  to,
  className,
  children,
  onClick,
  ...props
}: {
  to: string;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
  "aria-label"?: string;
}) {
  const { navigate } = useShop();
  const follow = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    onClick?.();
    navigate(to);
  };
  return (
    <a href={to} className={className} onClick={follow} {...props}>
      {children}
    </a>
  );
}
