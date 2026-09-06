/** Per-ride photo gallery API (Emergent Object Storage via our backend). */
import { Platform } from "react-native";
import { getToken } from "./session";

const API = (process.env.EXPO_PUBLIC_BACKEND_URL || "") + "/api";

export type RidePhoto = { id: string; path: string };

export async function listRidePhotos(rideId: string): Promise<RidePhoto[]> {
  try {
    const r = await fetch(`${API}/rides/${encodeURIComponent(rideId)}/photos`);
    if (!r.ok) return [];
    return (await r.json()).photos || [];
  } catch { return []; }
}

/** Authenticated image URL — token in the query so web <img> can read it. */
export function ridePhotoUri(path: string): string {
  return `${API}/rides/photo/${path}?token=${encodeURIComponent(getToken() || "")}`;
}

export async function uploadRidePhoto(rideId: string, asset: { uri: string; name?: string | null; mimeType?: string | null }): Promise<void> {
  const name = asset.name || `photo-${Date.now()}.jpg`;
  const type = asset.mimeType || "image/jpeg";
  const form = new FormData();
  if (Platform.OS === "web") {
    const blob = await (await fetch(asset.uri)).blob();
    form.append("file", blob, name);
  } else {
    form.append("file", { uri: asset.uri, name, type } as any);
  }
  const r = await fetch(`${API}/rides/${encodeURIComponent(rideId)}/photos`, { method: "POST", body: form });
  if (!r.ok) {
    const e = await r.json().catch(() => ({} as any));
    throw new Error(e.detail || "Upload failed");
  }
}

export async function deleteRidePhoto(rideId: string, photoId: string): Promise<void> {
  await fetch(`${API}/rides/${encodeURIComponent(rideId)}/photos/${photoId}`, { method: "DELETE" });
}
