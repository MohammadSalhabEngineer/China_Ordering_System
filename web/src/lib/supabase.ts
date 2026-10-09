import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient(url ?? "https://missing.supabase.co", anonKey ?? "missing", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

/** Login names map to synthetic emails; nobody ever sees or types the email. */
export const LOGIN_DOMAIN = "family.local";
export const slugToEmail = (slug: string) => `${slug.toLowerCase()}@${LOGIN_DOMAIN}`;

export function photoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from("item-photos").getPublicUrl(path).data.publicUrl;
}

/** Turn a Postgres/RPC error into a translatable key + args. */
export function explainError(err: unknown): { key: string; args?: Record<string, string> } {
  const msg = err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
  const m = /INSUFFICIENT_STOCK:([^:]+):(\d+)/.exec(msg);
  if (m) return { key: "errors.insufficientStock", args: { item: m[1], left: m[2] } };
  if (msg.includes("NOT_INVITED")) return { key: "errors.notInvited" };
  if (msg.includes("Invalid login credentials")) return { key: "errors.badPin" };
  if (msg.includes("not allowed") || msg.includes("owner only")) return { key: "errors.notAllowed" };
  if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) return { key: "errors.offline" };
  return { key: "errors.generic", args: { message: msg } };
}
