import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Languages, LogOut, Smartphone, UserPlus, FileSpreadsheet, KeyRound, Download } from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import { supabase, slugToEmail, explainError } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useAsync, personName } from "../lib/data";
import { setLocale } from "../lib/i18n";
import { Header } from "../components/Header";
import { Field, PinInput, Sheet, Spinner, Toast } from "../components/ui";
import { exportWorkbook } from "../lib/export";
import type { Profile } from "../types";

const SLUG_RE = /^[a-z0-9]{2,20}$/;

interface Invite {
  login_slug: string;
  display_name: string;
  display_name_ar: string | null;
  role: "owner" | "seller";
}

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { profile, isOwner, deviceNickname, registerDevice, signOut } = useAuth();
  const [toast, setToast] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [adding, setAdding] = useState(false);
  const [changingPin, setChangingPin] = useState(false);
  const [exporting, setExporting] = useState(false);

  const people = useAsync(async () => {
    const { data } = await supabase.from("profiles").select("*").order("created_at");
    return (data ?? []) as Profile[];
  }, []);
  const invites = useAsync(async () => {
    if (!isOwner) return [] as Invite[];
    const { data } = await supabase.from("invites").select("login_slug, display_name, display_name_ar, role").order("created_at");
    return (data ?? []) as Invite[];
  }, [isOwner]);

  async function toggleActive(p: Profile) {
    await supabase.from("profiles").update({ active: !p.active }).eq("id", p.id);
    void people.reload(true);
  }
  async function setRole(p: Profile, role: "owner" | "seller") {
    await supabase.from("profiles").update({ role }).eq("id", p.id);
    void people.reload(true);
  }
  async function deleteUser(p: Profile) {
    if (!window.confirm(t("settings.deleteConfirm", { name: personName(p, i18n.language) }))) return;
    const { error } = await supabase.rpc("delete_user", { p_user_id: p.id });
    if (error) {
      const ex = explainError(error);
      setToast(t(ex.key, ex.args));
      return;
    }
    setToast(t("settings.deleted"));
    void people.reload(true);
  }
  async function removeInvite(slug: string) {
    await supabase.from("invites").delete().eq("login_slug", slug);
    void invites.reload(true);
  }
  async function doExport() {
    setExporting(true);
    try {
      await exportWorkbook(i18n.language);
    } catch (e) {
      const ex = explainError(e);
      setToast(t(ex.key, ex.args));
    } finally {
      setExporting(false);
    }
  }

  const lang = i18n.language === "ar" ? "ar" : "en";
  return (
    <>
      <Header title={t("settings.title")} />
      <div className="p-4 space-y-4">
        <section className="card p-4">
          <p className="font-semibold">{t("settings.signedInAs", { name: personName(profile, lang) })}</p>
          <p className="text-sm text-muted">{t(`settings.${profile?.role ?? "seller"}`)}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button className="btn-secondary" onClick={() => setChangingPin(true)}>
              <KeyRound size={18} /> {t("settings.changePin")}
            </button>
            <button className="btn-secondary text-bad" onClick={() => void signOut()}>
              <LogOut size={18} /> {t("settings.signOut")}
            </button>
          </div>
        </section>

        <section className="card p-4">
          <p className="label">{t("settings.language")}</p>
          <div className="grid grid-cols-2 gap-2">
            {(["en", "ar"] as const).map((l) => (
              <button key={l} className={lang === l ? "btn-primary" : "btn-secondary"} onClick={() => setLocale(l)}>
                <Languages size={18} /> {t(l === "en" ? "settings.english" : "settings.arabic")}
              </button>
            ))}
          </div>
        </section>

        <section className="card p-4">
          <p className="label">{t("settings.thisPhone")}</p>
          <p className="font-semibold flex items-center gap-2">
            <Smartphone size={18} className="text-muted" /> {deviceNickname}
          </p>
          <button className="btn-secondary w-full mt-3" onClick={() => setRenaming(true)}>
            {t("settings.renamePhone")}
          </button>
          <p className="text-xs text-muted mt-3 flex gap-2">
            <Download size={14} className="shrink-0 mt-0.5" />
            <span>
              <b>{t("settings.install")}:</b> {t("settings.installHint")}
            </span>
          </p>
        </section>

        {isOwner && (
          <section className="card p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="font-semibold">{t("settings.users")}</p>
              <button className="btn-ghost py-1" onClick={() => setAdding(true)}>
                <UserPlus size={18} /> {t("settings.addUser")}
              </button>
            </div>
            <ul className="divide-y divide-line text-sm">
              {(people.data ?? []).map((p) => (
                <li key={p.id} className="py-2 flex items-center gap-2">
                  <div className="grow min-w-0">
                    <p className={`font-medium ${p.active ? "" : "line-through text-muted"}`}>
                      {personName(p, lang)} <span className="text-muted font-normal">· {p.login_slug}</span>
                    </p>
                  </div>
                  {p.id !== profile?.id && (
                    <>
                      <select className="input py-1 w-auto text-xs" value={p.role} onChange={(e) => void setRole(p, e.target.value as "owner" | "seller")}>
                        <option value="seller">{t("settings.seller")}</option>
                        <option value="owner">{t("settings.owner")}</option>
                      </select>
                      <button className="btn-secondary py-1 px-2 text-xs" onClick={() => void toggleActive(p)}>
                        {p.active ? t("settings.deactivate") : t("settings.activate")}
                      </button>
                      {!p.active && (
                        <button className="btn-danger py-1 px-2 text-xs" onClick={() => void deleteUser(p)}>
                          {t("settings.deleteUser")}
                        </button>
                      )}
                    </>
                  )}
                </li>
              ))}
              {(invites.data ?? []).map((inv) => (
                <li key={inv.login_slug} className="py-2 flex items-center gap-2">
                  <div className="grow min-w-0">
                    <p className="font-medium">
                      {personName(inv, lang)} <span className="text-muted font-normal">· {inv.login_slug}</span>
                    </p>
                    <p className="text-xs text-warn">{t("settings.pendingInvite")}</p>
                  </div>
                  <button className="btn-secondary py-1 px-2 text-xs" onClick={() => void removeInvite(inv.login_slug)}>
                    {t("settings.removeInvite")}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {isOwner && (
          <section className="card p-4">
            <p className="font-semibold mb-1">{t("settings.export")}</p>
            <p className="text-xs text-muted mb-3">{t("settings.exportHint")}</p>
            <button className="btn-secondary w-full" onClick={() => void doExport()} disabled={exporting}>
              {exporting ? <Spinner /> : <FileSpreadsheet size={18} />} {exporting ? t("settings.exporting") : t("settings.export")}
            </button>
          </section>
        )}

        <p className="text-center text-xs text-muted">
          {t("app.name")} · {t("settings.version")} {__APP_VERSION__}
        </p>
      </div>

      <RenameSheet
        open={renaming}
        current={deviceNickname ?? ""}
        onClose={() => setRenaming(false)}
        onSave={async (n) => {
          await registerDevice(n);
          setRenaming(false);
          setToast(t("common.save"));
        }}
      />
      <AddUserSheet
        open={adding}
        onClose={() => setAdding(false)}
        onDone={(name, slug) => {
          setAdding(false);
          setToast(t("settings.invited", { name, slug }));
          void invites.reload(true);
        }}
      />
      <ChangePinSheet open={changingPin} onClose={() => setChangingPin(false)} onDone={() => { setChangingPin(false); setToast(t("settings.pinChanged")); }} />
      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}

function RenameSheet({ open, current, onClose, onSave }: { open: boolean; current: string; onClose: () => void; onSave: (n: string) => Promise<void> }) {
  const { t } = useTranslation();
  const [name, setName] = useState(current);
  const [busy, setBusy] = useState(false);
  return (
    <Sheet open={open} onClose={onClose} title={t("settings.renamePhone")}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          setBusy(true);
          await onSave(name).finally(() => setBusy(false));
        }}
      >
        <Field label={t("login.deviceName")}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? <Spinner className="text-white" /> : t("common.save")}
        </button>
      </form>
    </Sheet>
  );
}

/**
 * Owner adds a person: writes an invite row (owner-only table), then creates the
 * auth account with a throwaway client so the owner's own session is untouched.
 */
function AddUserSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (name: string, slug: string) => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [slug, setSlug] = useState("");
  const [role, setRole] = useState<"owner" | "seller">("seller");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const s = slug.toLowerCase().trim();
    if (!name.trim()) return setError(t("errors.required"));
    if (!SLUG_RE.test(s)) return setError(t("errors.slugFormat"));
    if (pin.length !== 6) return setError(t("errors.pinLength"));
    setBusy(true);
    setError(null);
    const { error: invErr } = await supabase.from("invites").upsert({ login_slug: s, display_name: name.trim(), display_name_ar: nameAr.trim() || null, role });
    if (invErr) {
      setBusy(false);
      const ex = explainError(invErr);
      return setError(t(ex.key, ex.args));
    }
    const tmp = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { error: suErr } = await tmp.auth.signUp({ email: slugToEmail(s), password: pin });
    setBusy(false);
    if (suErr) {
      const msg = suErr.message.toLowerCase();
      if (msg.includes("already registered") || msg.includes("already been registered")) return setError(t("settings.slugTaken"));
      const ex = explainError(suErr);
      return setError(t(ex.key, ex.args));
    }
    const done = name.trim();
    setName("");
    setNameAr("");
    setSlug("");
    setPin("");
    setRole("seller");
    onDone(done, s);
  }

  return (
    <Sheet open={open} onClose={onClose} title={t("settings.addUser")} tall>
      <p className="text-sm text-muted mb-4">{t("settings.inviteHint")}</p>
      <form onSubmit={submit}>
        <Field label={t("login.name")}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={`${t("login.nameAr")} (${t("common.optional")})`}>
          <input className="input" dir="rtl" value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
        </Field>
        <Field label={t("login.loginName")} hint={t("errors.slugFormat")}>
          <input className="input" dir="ltr" value={slug} onChange={(e) => setSlug(e.target.value)} autoCapitalize="none" />
        </Field>
        <Field label={t("settings.role")}>
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as "owner" | "seller")}>
            <option value="seller">{t("settings.seller")}</option>
            <option value="owner">{t("settings.owner")}</option>
          </select>
        </Field>
        <Field label={t("login.newPin")} hint={t("settings.pinHint")}>
          <PinInput value={pin} onChange={setPin} />
        </Field>
        {error && <p className="text-bad text-sm mb-3">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? <Spinner className="text-white" /> : t("login.create")}
        </button>
      </form>
    </Sheet>
  );
}

function ChangePinSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pin.length !== 6) return setError(t("errors.pinLength"));
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pin });
    setBusy(false);
    if (error) {
      const ex = explainError(error);
      return setError(t(ex.key, ex.args));
    }
    setPin("");
    onDone();
  }
  return (
    <Sheet open={open} onClose={onClose} title={t("settings.changePin")}>
      <form onSubmit={submit}>
        <Field label={t("login.newPin")}>
          <PinInput value={pin} onChange={setPin} autoFocus />
        </Field>
        {error && <p className="text-bad text-sm mb-3">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? <Spinner className="text-white" /> : t("common.save")}
        </button>
      </form>
    </Sheet>
  );
}
