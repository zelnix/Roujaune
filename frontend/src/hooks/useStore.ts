/**
 * useStore — web / Expo Go fallback.
 *
 * App-store billing is native-only. On web (and inside Expo Go, which resolves
 * `.native` but the module lazy-fails there) purchases are not available, so we
 * expose backend display prices and a clear "purchase in the app" result.
 * Metro picks `useStore.native.ts` on iOS/Android builds automatically.
 */
import React from "react";
import { fetchProducts, refreshEntitlement, ProductInfo } from "@/src/lib/entitlement";

export type StoreProduct = {
  id: string; title: string; price: string; period: string; isDefault: boolean;
};

export type UseStore = {
  supported: boolean;
  loading: boolean;
  purchasing: boolean;
  products: StoreProduct[];
  purchase: (productId: string) => Promise<{ ok: boolean; error?: string }>;
  restore: () => Promise<{ ok: boolean; restored: boolean; error?: string }>;
};

function toStore(p: ProductInfo): StoreProduct {
  return { id: p.id, title: `${p.label} Premium`, price: p.display_price, period: p.period, isDefault: !!p.default };
}

export function useStore(): UseStore {
  const [products, setProducts] = React.useState<StoreProduct[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    fetchProducts().then((ps) => { if (alive) { setProducts(ps.map(toStore)); setLoading(false); } });
    refreshEntitlement();
    return () => { alive = false; };
  }, []);

  return {
    supported: false,
    loading,
    purchasing: false,
    products,
    purchase: async () => ({ ok: false, error: "Premium is purchased in the iOS or Android app." }),
    restore: async () => ({ ok: true, restored: false }),
  };
}
