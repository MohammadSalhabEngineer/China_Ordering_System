import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { describeDevice, getDeviceId, getDeviceNickname, setDeviceNickname } from "./device";
import type { Profile } from "../types";

interface AuthState {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  isOwner: boolean;
  deviceId: string;
  deviceNickname: string | null;
  /** Register/refresh this phone on the server and remember its nickname locally. */
  registerDevice: (nickname: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [deviceNickname, setNick] = useState<string | null>(() => getDeviceNickname());
  const deviceId = useMemo(() => getDeviceId(), []);

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      return;
    }
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    setProfile((data as Profile | null) ?? null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      await loadProfile(data.session?.user.id);
      if (!cancelled) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      void loadProfile(s?.user.id);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const registerDevice = useCallback(
    async (nickname: string) => {
      const { label, userAgent } = describeDevice();
      const nick = nickname.trim() || label;
      setDeviceNickname(nick);
      setNick(nick);
      const { error } = await supabase.rpc("register_device", {
        p_device_id: deviceId,
        p_nickname: nick,
        p_user_agent: userAgent,
        p_device_label: label,
      });
      if (error) throw error;
    },
    [deviceId],
  );

  // keep last_seen fresh whenever a signed-in user with a named device opens the app
  useEffect(() => {
    if (session && profile && deviceNickname) {
      void registerDevice(deviceNickname).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id, profile?.id]);

  const value: AuthState = {
    loading,
    session,
    profile,
    isOwner: profile?.role === "owner" && profile.active,
    deviceId,
    deviceNickname,
    registerDevice,
    signOut: async () => {
      await supabase.auth.signOut();
      setProfile(null);
    },
    refreshProfile: () => loadProfile(session?.user.id),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
