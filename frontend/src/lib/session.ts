import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY = "roujaune_token";
let _token: string | null = null;
let _patched = false;

export function getToken(): string | null {
  return _token;
}

export async function loadToken(): Promise<string | null> {
  try {
    if (Platform.OS === "web") {
      _token = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    } else {
      _token = await SecureStore.getItemAsync(KEY);
    }
  } catch {
    _token = null;
  }
  _hydrated = true;
  return _token;
}

// Memoised token hydration so authenticated requests never fire before the
// stored token is read from storage (fixes intermittent cold-start 401s that
// made data flip back to bundled fallbacks, e.g. the Training Plan card).
let _hydrated = false;
let _hydration: Promise<string | null> | null = null;
function ensureToken(): Promise<string | null> {
  if (_hydrated) return Promise.resolve(_token);
  if (!_hydration) _hydration = loadToken();
  return _hydration;
}

export async function setToken(token: string | null): Promise<void> {
  _token = token;
  _hydrated = true;
  try {
    if (Platform.OS === "web") {
      if (typeof localStorage !== "undefined") {
        if (token) localStorage.setItem(KEY, token);
        else localStorage.removeItem(KEY);
      }
    } else if (token) {
      await SecureStore.setItemAsync(KEY, token);
    } else {
      await SecureStore.deleteItemAsync(KEY);
    }
  } catch {
    /* noop */
  }
}

/** Patch global fetch once so every /api/* request carries the Bearer token. */
export function installFetchAuth(): void {
  if (_patched) return;
  _patched = true;
  const orig = globalThis.fetch;
  globalThis.fetch = async (input: any, init: any = {}) => {
    try {
      const url = typeof input === "string" ? input : (input?.url ?? "");
      if (url.includes("/api/")) {
        // Wait for the stored token to hydrate before firing an API request so
        // the very first authenticated calls on cold-start aren't sent as 401.
        await ensureToken();
        if (_token) {
          const headers = new Headers(init.headers || {});
          if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${_token}`);
          init = { ...init, headers };
        }
      }
    } catch {
      /* noop */
    }
    return orig(input, init);
  };
}
