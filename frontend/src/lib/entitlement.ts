/**
 * Subscription entitlement — the backend is the source of truth.
 *
 * `useEntitlement()` is a tiny module-store hook (shared across screens) that
 * caches `/api/billing/status`. The paywall/gating reads `premium`,
 * `canStartRide` and the free-ride allowance from here. `consumeRide()` records
 * the start of a free ride (idempotent per ride key) so the 3-ride cap is
 * enforced server-side and survives reinstall.
 */
import React from "react";

const API = (process.env.EXPO_PUBLIC_BACKEND_URL || "") + "/api";

export type Entitlement = {
  premium: boolean;
  plan: string | null;
  productId: string | null;
  expiresAt: string | null;
  source: string | null;
  daysLeft: number | null;
  expiringSoon: boolean;
  freeRidesUsed: number;
  freeRidesLimit: number;
  freeRidesRemaining: number;
  freeRideMinutes: number;
  canStartRide: boolean;
};

export type ProductInfo = {
  id: string; period: string; display_price: string; label: string; default: boolean;
};

const DEFAULT: Entitlement = {
  premium: false, plan: null, productId: null, expiresAt: null,
  source: null, daysLeft: null, expiringSoon: false,
  freeRidesUsed: 0, freeRidesLimit: 3, freeRidesRemaining: 3,
  freeRideMinutes: 30, canStartRide: true,
};

let _state: Entitlement = { ...DEFAULT };
let _loaded = false;
let _products: ProductInfo[] = [];
const _subs = new Set<() => void>();

function _emit() { _subs.forEach((fn) => fn()); }

function _map(j: any): Entitlement {
  return {
    premium: !!j.premium,
    plan: j.plan ?? null,
    productId: j.product_id ?? null,
    expiresAt: j.expires_at ?? null,
    source: j.source ?? null,
    daysLeft: typeof j.days_left === "number" ? j.days_left : null,
    expiringSoon: !!j.expiring_soon,
    freeRidesUsed: j.free_rides_used ?? 0,
    freeRidesLimit: j.free_rides_limit ?? 3,
    freeRidesRemaining: j.free_rides_remaining ?? 3,
    freeRideMinutes: j.free_ride_minutes ?? 30,
    canStartRide: j.can_start_ride ?? true,
  };
}

export async function refreshEntitlement(): Promise<Entitlement> {
  try {
    const r = await fetch(`${API}/billing/status`);
    if (r.ok) { _state = _map(await r.json()); _loaded = true; _emit(); }
  } catch { /* keep last known */ }
  return _state;
}

export async function fetchProducts(): Promise<ProductInfo[]> {
  if (_products.length) return _products;
  try {
    const r = await fetch(`${API}/billing/products`);
    if (r.ok) { const j = await r.json(); _products = j.products || []; }
  } catch { /* ignore */ }
  return _products;
}

/** Record the start of a free ride. No-op for premium. Idempotent per rideKey. */
export async function consumeRide(rideKey?: string): Promise<Entitlement> {
  try {
    const r = await fetch(`${API}/billing/consume-ride`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ride_key: rideKey || null }),
    });
    if (r.ok) { _state = _map(await r.json()); _emit(); }
  } catch { /* ignore */ }
  return _state;
}

export function getEntitlement(): Entitlement { return _state; }

export function useEntitlement() {
  const [, force] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    _subs.add(force);
    if (!_loaded) refreshEntitlement();
    return () => { _subs.delete(force); };
  }, []);
  return { ..._state, loaded: _loaded, refresh: refreshEntitlement };
}
