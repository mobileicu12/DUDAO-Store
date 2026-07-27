"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";

export type CartItem = {
  id: string;
  title: string;
  imageUrl: string | null;
  price: number;
  quantity: number;
};

type CartValue = {
  items: CartItem[];
  count: number;
  subtotal: number;
  add: (item: Omit<CartItem, "quantity">, qty?: number) => void;
  setQty: (id: string, qty: number) => void;
  remove: (id: string) => void;
  clear: () => void;
};

const STORAGE_KEY = "mi-shop-cart";
const CartCtx = createContext<CartValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);

  // Load once on mount, then persist on every change. Guarded so an empty
  // first render never clobbers a saved cart.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw) as CartItem[]);
    } catch {
      /* ignore corrupt storage */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* quota / private mode — cart just won't persist */
    }
  }, [items, ready]);

  const add = useCallback((item: Omit<CartItem, "quantity">, qty = 1) => {
    setItems((prev) => {
      const found = prev.find((i) => i.id === item.id);
      if (found) {
        return prev.map((i) =>
          i.id === item.id ? { ...i, quantity: i.quantity + qty } : i,
        );
      }
      return [...prev, { ...item, quantity: qty }];
    });
  }, []);

  const setQty = useCallback((id: string, qty: number) => {
    setItems((prev) =>
      prev
        .map((i) => (i.id === id ? { ...i, quantity: Math.max(0, Math.floor(qty)) } : i))
        .filter((i) => i.quantity > 0),
    );
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<CartValue>(() => {
    const count = items.reduce((s, i) => s + i.quantity, 0);
    const subtotal =
      Math.round(items.reduce((s, i) => s + i.price * i.quantity, 0) * 100) / 100;
    return { items, count, subtotal, add, setQty, remove, clear };
  }, [items, add, setQty, remove, clear]);

  return <CartCtx.Provider value={value}>{children}</CartCtx.Provider>;
}

export function useCart(): CartValue {
  const ctx = useContext(CartCtx);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
