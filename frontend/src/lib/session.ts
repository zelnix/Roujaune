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
  return _token;
}

export async function setToken(token: string | null): Promise<void> {
  _token = token;
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
      if (_token && url.includes("/api/")) {
        const headers = new Headers(init.headers || {});
        if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${_token}`);
        init = { ...init, headers };
      }
    } catch {
      /* noop */
    }
    return orig(input, init);
  };
}
