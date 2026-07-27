import React, { createContext, useContext, useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { getToken, setToken, loadToken, installFetchAuth } from "./session";
import { refreshCoachFromServer, resetCoach } from "./coach-persona";
import { resetRiderProfile } from "./rider-profile";

const API = (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");
const AUTH_BASE = "https://auth.emergentagent.com";

export type AuthUser = {
  user_id: string;
  email: string;
  name: string;
  picture?: string | null;
  provider: string;
  assigned_plan_id?: string | null;
  onboarded?: boolean;
  email_verified?: boolean;
};

type AuthCtx = {
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name?: string) => Promise<void>;
  signInGoogle: () => Promise<void>;
  signInApple: () => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  refresh: () => Promise<AuthUser | null>;
  forgotPassword: (email: string) => Promise<void>;
  resendVerification: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

installFetchAuth();

async function post(path: string, body: any) {
  const r = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.detail || "Something went wrong");
  return data;
}

function readSessionIdFromUrl(url: string): string | null {
  if (!url) return null;
  const m = url.match(/[#?&]session_id=([^#&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (): Promise<AuthUser | null> => {
    try {
      const r = await fetch(`${API}/api/auth/me`);
      if (!r.ok) return null;
      const d = await r.json();
      setUser(d.user);
      return d.user;
    } catch {
      return null;
    }
  }, []);

  const exchangeGoogle = useCallback(async (sessionId: string) => {
    const d = await post("/api/auth/google", { session_id: sessionId });
    await setToken(d.token);
    setUser(d.user);
  }, []);

  // Bootstrap: process any web OAuth redirect first, then restore an existing session.
  useEffect(() => {
    (async () => {
      installFetchAuth();
      try {
        if (Platform.OS === "web" && typeof window !== "undefined") {
          const sid = readSessionIdFromUrl(window.location.hash) || readSessionIdFromUrl(window.location.search);
          if (sid) {
            await exchangeGoogle(sid);
            window.history.replaceState(null, "", window.location.pathname);
            setLoading(false);
            return;
          }
        } else if (Platform.OS !== "web") {
          // Mobile cold-start fallback: the app may have been killed mid-auth and
          // reopened via the deep link. openAuthSessionAsync's result.url is the
          // primary path (see signInGoogle); this covers the killed-app case.
          const initialUrl = await Linking.getInitialURL();
          const sid = initialUrl ? readSessionIdFromUrl(initialUrl) : null;
          if (sid) {
            await exchangeGoogle(sid);
            setLoading(false);
            return;
          }
        }
      } catch {
        /* noop */
      }
      await loadToken();
      if (getToken()) await refresh();
      setLoading(false);
    })();
  }, [refresh, exchangeGoogle]);

  // Mobile hot-link fallback: handle the auth deep link while the app is running.
  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = Linking.addEventListener("url", ({ url }) => {
      const sid = readSessionIdFromUrl(url);
      if (sid) exchangeGoogle(sid).catch(() => { /* noop */ });
    });
    return () => sub.remove();
  }, [exchangeGoogle]);

  // Once authenticated, re-sync the rider's chosen coach from the server. This
  // fixes the case where coach init ran while logged out (401) and stuck on the
  // default Alberto — now every device reflects the actual selection.
  useEffect(() => {
    if (user) refreshCoachFromServer();
  }, [user]);

  const signIn = useCallback(async (email: string, password: string) => {
    const d = await post("/api/auth/login", { email, password });
    await setToken(d.token);
    setUser(d.user);
  }, []);

  const signUp = useCallback(async (email: string, password: string, name?: string) => {
    const d = await post("/api/auth/register", { email, password, name });
    await setToken(d.token);
    setUser(d.user);
  }, []);

  const signInGoogle = useCallback(async () => {
    if (Platform.OS === "web") {
      const redirect = window.location.origin + "/";
      window.location.href = `${AUTH_BASE}/?redirect=${encodeURIComponent(redirect)}`;
      return;
    }
    const redirect = Linking.createURL("");
    const result = await WebBrowser.openAuthSessionAsync(`${AUTH_BASE}/?redirect=${encodeURIComponent(redirect)}`, redirect);
    if (result.type === "success" && result.url) {
      const sid = readSessionIdFromUrl(result.url);
      if (sid) await exchangeGoogle(sid);
    }
  }, [exchangeGoogle]);

  const signInApple = useCallback(async () => {
    if (Platform.OS !== "ios") throw new Error("Apple sign-in is available on iOS builds");
    const Apple = await import("expo-apple-authentication");
    const cred = await Apple.signInAsync({
      requestedScopes: [Apple.AppleAuthenticationScope.FULL_NAME, Apple.AppleAuthenticationScope.EMAIL],
    });
    const name = cred.fullName?.givenName ? `${cred.fullName.givenName} ${cred.fullName.familyName ?? ""}`.trim() : undefined;
    const d = await post("/api/auth/apple", { identity_token: cred.identityToken, name });
    await setToken(d.token);
    setUser(d.user);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await fetch(`${API}/api/auth/logout`, { method: "POST" });
    } catch {
      /* noop */
    }
    // Clear rider-scoped cached app data so nothing leaks into the next account
    // that logs in on this device (e.g. a stale training plan or profile).
    try {
      const keys = await AsyncStorage.getAllKeys();
      const stale = keys.filter(
        (k) => k.startsWith("roujaune:plan") || k === "roujaune:riderProfile" || k === "roujaune:riderAvatar" || k === "roujaune:coachId",
      );
      if (stale.length) await AsyncStorage.multiRemove(stale);
    } catch {
      /* ignore cache clear errors */
    }
    resetCoach();
    resetRiderProfile();
    await setToken(null);
    setUser(null);
  }, []);

  const deleteAccount = useCallback(async () => {
    const r = await fetch(`${API}/api/rider/account`, { method: "DELETE" });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d?.detail || "Couldn't delete your account right now");
    }
    // Account is gone on the server; clear local session + cached rider data.
    try {
      const keys = await AsyncStorage.getAllKeys();
      const stale = keys.filter(
        (k) => k.startsWith("roujaune:plan") || k === "roujaune:riderProfile" || k === "roujaune:riderAvatar" || k === "roujaune:coachId",
      );
      if (stale.length) await AsyncStorage.multiRemove(stale);
    } catch {
      /* ignore cache clear errors */
    }
    resetCoach();
    resetRiderProfile();
    await setToken(null);
    setUser(null);
  }, []);

  const forgotPassword = useCallback(async (email: string) => {
    await post("/api/auth/forgot-password", { email });
  }, []);

  const resendVerification = useCallback(async () => {
    const r = await fetch(`${API}/api/auth/resend-verification`, { method: "POST" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d?.detail || "Couldn't send the email right now");
  }, []);

  return (
    <Ctx.Provider value={{ user, loading, signIn, signUp, signInGoogle, signInApple, signOut, deleteAccount, refresh, forgotPassword, resendVerification }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}
