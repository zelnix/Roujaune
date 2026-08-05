/** Ride ingestion + analysis API (upload .fit/.gpx/.tcx, list, detail, FTP). */
import { Platform } from "react-native";
import Constants from "expo-constants";

const API = (process.env.EXPO_PUBLIC_BACKEND_URL
  || (Constants.expoConfig?.extra as any)?.backendUrl || "") + "/api";

export type RideListItem = {
  id: string; created_at?: string; name: string;
  indoor_outdoor: "indoor" | "outdoor"; source: string; imported: boolean;
  cycling_activity_id?: string; ride_type?: string;
  duration_sec?: number; distance_km?: number; elevation_m?: number;
  avg_power?: number; tss?: number;
};

export type RideSample = {
  t: number; lat?: number; lng?: number; ele?: number;
  power?: number; hr?: number; cad?: number; dist?: number;
};

export type RideDetail = {
  id: string; name: string; indoor_outdoor: "indoor" | "outdoor"; source: string;
  ride_type?: string; started_at?: string;
  duration_sec?: number; distance_km?: number;
  elevation_gain_m?: number; elevation_loss_m?: number;
  avg_power?: number; max_power?: number; np?: number; if?: number; tss?: number;
  avg_hr?: number; max_hr?: number; avg_cadence?: number; max_cadence?: number;
  avg_speed?: number; max_speed?: number; calories?: number;
  has_gps: boolean; has_power: boolean; has_hr: boolean; has_cadence: boolean;
  samples: RideSample[];
  power_curve?: { secs: number; watts: number }[] | null;
  time_in_power_zones?: number[] | null;
  time_in_hr_zones?: number[] | null;
  ftp_used: number;
};

export async function fetchActivities(): Promise<RideListItem[]> {
  const r = await fetch(`${API}/activities?limit=100`);
  if (!r.ok) return [];
  return (await r.json()).activities || [];
}

export async function fetchActivity(id: string): Promise<RideDetail | null> {
  const r = await fetch(`${API}/activities/${encodeURIComponent(id)}`);
  if (!r.ok) return null;
  return await r.json();
}

export async function getFtp(): Promise<{ ftp: number; max_hr: number | null }> {
  const r = await fetch(`${API}/activities/ftp`);
  return r.ok ? await r.json() : { ftp: 200, max_hr: null };
}

export async function setFtp(ftp?: number, maxHr?: number) {
  const r = await fetch(`${API}/activities/ftp`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ftp, max_hr: maxHr }),
  });
  return r.ok ? await r.json() : null;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const s = String(reader.result || "");
      resolve(s.includes(",") ? s.split(",")[1] : s);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function readBase64(uri: string): Promise<string> {
  if (Platform.OS === "web") {
    const res = await fetch(uri);
    return blobToBase64(await res.blob());
  }
  let FS: any;
  try { FS = require("expo-file-system/legacy"); if (!FS?.readAsStringAsync) FS = require("expo-file-system"); }
  catch { FS = require("expo-file-system"); }
  return FS.readAsStringAsync(uri, { encoding: "base64" });
}

export async function uploadActivity(): Promise<{ ok: boolean; error?: string; activity_id?: string; name?: string }> {
  const DocumentPicker = require("expo-document-picker");
  const res = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets?.length) return { ok: false, error: "cancelled" };
  const asset = res.assets[0];
  const name = asset.name || "ride";
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (!["fit", "gpx", "tcx"].includes(ext)) {
    return { ok: false, error: "Please choose a .fit, .gpx or .tcx file." };
  }
  let b64: string;
  try { b64 = await readBase64(asset.uri); }
  catch { return { ok: false, error: "Couldn't read that file." }; }
  const r = await fetch(`${API}/activities/upload`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: name, content_base64: b64 }),
  });
  if (!r.ok) {
    let msg = "Upload failed.";
    try { msg = (await r.json()).detail || msg; } catch {}
    return { ok: false, error: msg };
  }
  const j = await r.json();
  return { ok: true, activity_id: j.activity_id, name: j.name };
}
