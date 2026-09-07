// Outdoor ride syncing client. Talks to the provider-adapter backend.
import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";

function base(): string {
  return (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");
}

export type Provider = {
  id: string;
  name: string;
  kind: "cloud_oauth" | "device_native" | string;
  requires_native_build: boolean;
  icon: string;
  configured: boolean;
  connection_status: string;
  connected: boolean;
  last_successful_sync_at: string | null;
  last_sync_attempt_at: string | null;
  provider_account_id: string | null;
  permissions: string[];
  disable_route_import: boolean;
  disable_auto_sync: boolean;
  last_error?: string | null;
};

export type ConnectionsData = {
  providers: Provider[];
  encryption_ready: boolean;
  imported_activities: number;
};

export type ImportedActivity = {
  id: string;
  provider: string;
  name: string | null;
  ride_type: string | null;
  indoor_outdoor: string | null;
  started_at: string | null;
  distance_metres: number | null;
  elevation_gain_metres: number | null;
  elapsed_seconds: number | null;
  average_power: number | null;
  average_heart_rate: number | null;
  is_canonical?: boolean;
  source_references?: string[];
};

async function api(path: string, method = "GET", body?: any) {
  const res = await fetch(`${base()}/api${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function useConnections() {
  const [data, setData] = useState<ConnectionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      setData(await api("/connections"));
    } catch {
      /* keep previous */
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  return { data, loading, reload: load };
}

export function useImportedActivities() {
  const [items, setItems] = useState<ImportedActivity[]>([]);
  const load = useCallback(async () => {
    try {
      setItems(await api("/connections/activities?limit=30"));
    } catch {
      /* keep */
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  return { items, reload: load };
}

export type ConnectResult =
  | { setup_required: true; message: string }
  | { cancelled: true }
  | { connected: true; sync: any }
  | { error: string };

/** Backend-mediated OAuth: open the provider URL, hand the code back.
 * Strava is special-cased: it rejects custom app schemes, so the URL Strava
 * redirects to is our HTTPS backend bounce endpoint, which forwards the code
 * back into the app via the `roujaune://` deep link (what WebBrowser watches). */
export async function startConnect(providerId: string): Promise<ConnectResult> {
  const appRedirect = Linking.createURL(`oauth/${providerId}`);
  const backendBase = (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/+$/, "");
  const providerRedirect =
    providerId === "strava" && backendBase
      ? `${backendBase}/api/connections/strava/oauth-return`
      : appRedirect;
  const auth = await api(`/connections/${providerId}/authorize`, "POST", {
    redirect_uri: providerRedirect,
    app_redirect: appRedirect,
  });
  if (auth.setup_required) return { setup_required: true, message: auth.message };
  try {
    const result = await WebBrowser.openAuthSessionAsync(auth.authorize_url, appRedirect);
    if (result.type !== "success" || !result.url) return { cancelled: true };
    const { queryParams } = Linking.parse(result.url);
    const code = queryParams?.code as string | undefined;
    const state = (queryParams?.state as string) ?? auth.state;
    const err = queryParams?.error as string | undefined;
    if (err) return { error: `Authorization failed: ${err}` };
    if (!code) return { cancelled: true };
    return await api(`/connections/${providerId}/callback`, "POST", { code, state, redirect_uri: appRedirect });
  } catch (e: any) {
    return { error: e?.message ?? "Connection failed" };
  }
}

export const syncNow = (id: string) => api(`/connections/${id}/sync`, "POST");
export const disconnect = (id: string) => api(`/connections/${id}/disconnect`, "POST");

/** Push one indoor ride up to Strava (TCX with graph, or summary activity). */
export const pushRideToStrava = (rideId: string, coachSummary?: string) =>
  api(`/connections/strava/push`, "POST", { ride_id: rideId, coach_summary: coachSummary });
/** Button state for the summary: connected? can upload? already synced? */
export const stravaRideStatus = (rideId: string): Promise<{ connected: boolean; can_write: boolean; synced: boolean; pending: boolean }> =>
  api(`/connections/strava/ride-status?ride_id=${encodeURIComponent(rideId)}`, "GET");
export const deleteImported = (id: string) => api(`/connections/${id}/data`, "DELETE");
export const updateConnSettings = (id: string, patch: { disable_route_import?: boolean; disable_auto_sync?: boolean }) =>
  api(`/connections/${id}/settings`, "PATCH", patch);

export function statusChip(p: Provider): { label: string; color: string } {
  switch (p.connection_status) {
    case "connected": return { label: "Connected", color: "#55C850" };
    case "syncing": return { label: "Syncing…", color: "#FFC20A" };
    case "sync_failed": return { label: "Sync failed", color: "#C91727" };
    case "reauth_required": return { label: "Reconnect needed", color: "#E8631C" };
    case "not_configured": return { label: "Setup required", color: "#A7A8A5" };
    case "requires_build": return { label: "Needs app build", color: "#40A9C6" };
    default: return { label: "Not connected", color: "#A7A8A5" };
  }
}

export function relTime(iso: string | null): string {
  if (!iso) return "Never";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "Never";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function rideTypeLabel(t: string | null): string {
  if (!t) return "Ride";
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
