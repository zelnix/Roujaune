/**
 * useStore — NATIVE (iOS/Android) in-app purchases via react-native-iap.
 *
 * Thin wrapper over Apple StoreKit + Google Play Billing. It:
 *   - lazy-requires `react-native-iap` inside try/catch, so Expo Go (where the
 *     native module isn't linked) degrades gracefully instead of crashing;
 *   - fetches the subscription products from the store (real localized prices);
 *   - presents the native purchase UI, then hands the store proof to the
 *     authenticated backend (`/api/billing/validate`) which is the source of
 *     truth for entitlement; only then finishes the transaction.
 *
 * Requires a development/production build (NOT Expo Go / web preview).
 */
import React from "react";
import { Platform } from "react-native";
import { fetchProducts as fetchBackendProducts, refreshEntitlement, ProductInfo } from "@/src/lib/entitlement";
import type { StoreProduct, UseStore } from "./useStore";

const API = (process.env.EXPO_PUBLIC_BACKEND_URL || "") + "/api";
const SKUS = ["premium_monthly", "premium_yearly"];

function loadIap(): any | null {
  try { return require("react-native-iap"); } catch { return null; }
}

function backendToStore(p: ProductInfo): StoreProduct {
  return { id: p.id, title: `${p.label} Premium`, price: p.display_price, period: p.period, isDefault: !!p.default };
}

async function validateOnBackend(purchase: any): Promise<boolean> {
  const body: any = { platform: Platform.OS, product_id: purchase.productId || purchase.id };
  if (Platform.OS === "ios") body.transaction_receipt = purchase.transactionReceipt;
  else { body.purchase_token = purchase.purchaseToken; body.package_name = purchase.packageNameAndroid; }
  const r = await fetch(`${API}/billing/validate`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (r.ok) { await refreshEntitlement(); return true; }
  return false;
}

export function useStore(): UseStore {
  const iapRef = React.useRef<any>(loadIap());
  const iap = iapRef.current;
  const [products, setProducts] = React.useState<StoreProduct[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [purchasing, setPurchasing] = React.useState(false);
  const rawRef = React.useRef<any[]>([]); // native product objects (for offer tokens)

  React.useEffect(() => {
    let alive = true;
    let updateSub: any, errorSub: any;

    (async () => {
      // Always seed with backend display prices so the paywall is never blank.
      const backend = await fetchBackendProducts();
      if (alive) setProducts(backend.map(backendToStore));
      await refreshEntitlement();

      if (!iap) { if (alive) setLoading(false); return; }
      try {
        await iap.initConnection();
        updateSub = iap.purchaseUpdatedListener?.(async (purchase: any) => {
          try {
            const ok = await validateOnBackend(purchase);
            if (ok) await iap.finishTransaction?.({ purchase, isConsumable: false });
          } catch { /* keep unfinished; retried next launch */ }
          finally { if (alive) setPurchasing(false); }
        });
        errorSub = iap.purchaseErrorListener?.(() => { if (alive) setPurchasing(false); });

        const res = await iap.fetchProducts?.({ skus: SKUS, type: "subs" });
        const list: any[] = Array.isArray(res) ? res : (res?.products || res || []);
        if (list?.length) {
          rawRef.current = list;
          if (alive) setProducts(list.map((p: any) => ({
            id: p.id || p.productId,
            title: p.title || `${p.id} Premium`,
            price: p.displayPrice || p.localizedPrice || "",
            period: (p.id || "").includes("yearly") ? "yearly" : "monthly",
            isDefault: (p.id || p.productId) === "premium_yearly",
          })));
        }
      } catch { /* store unavailable — keep backend fallbacks */ }
      finally { if (alive) setLoading(false); }
    })();

    return () => { alive = false; updateSub?.remove?.(); errorSub?.remove?.(); };
  }, [iap]);

  const purchase = React.useCallback(async (productId: string) => {
    if (!iap) return { ok: false, error: "Purchases require the iOS or Android app." };
    setPurchasing(true);
    try {
      const raw = rawRef.current.find((p) => (p.id || p.productId) === productId);
      const offers = raw?.subscriptionOfferDetailsAndroid?.map((o: any) => ({ sku: productId, offerToken: o.offerToken })) ?? [];
      await iap.requestPurchase?.({
        type: "subs",
        request: Platform.OS === "ios"
          ? { apple: { sku: productId } }
          : { google: { skus: [productId], subscriptionOffers: offers } },
      });
      // Grant is confirmed asynchronously in purchaseUpdatedListener → validate.
      return { ok: true };
    } catch (e: any) {
      setPurchasing(false);
      return { ok: false, error: e?.message || "Purchase failed" };
    }
  }, [iap]);

  const restore = React.useCallback(async () => {
    if (!iap) return { ok: false, restored: false, error: "Restore requires the iOS or Android app." };
    try {
      const purchases = await iap.getAvailablePurchases?.();
      let restored = false;
      for (const p of purchases || []) { if (await validateOnBackend(p)) restored = true; }
      await refreshEntitlement();
      return { ok: true, restored };
    } catch (e: any) {
      return { ok: false, restored: false, error: e?.message || "Restore failed" };
    }
  }, [iap]);

  return { supported: !!iap, loading, purchasing, products, purchase, restore };
}
