import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import { supabase, slugToEmail, explainError } from "../lib/supabase";
import { fetchLoginNames, useAsync, personName } from "../lib/data";
import { useAuth } from "../lib/auth";
import { Field, Loading, PinInput, Spinner } from "../components/ui";
import { setLocale } from "../lib/i18n";
import type { LoginName } from "../types";

const SLUG_RE = /^[a-z0-9]{2,20}$/;

export default function LoginPage() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const { session, profile, loading: authLoading } = useAuth();
  const names = useAsync(fetchLoginNames, []);
  const [picked, setPicked] = useState<LoginName | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!authLoading && session && profile?.active) {
    nav("/", { replace: true });
    return null;
  }

  async function signIn(e: FormEvent) {
    e.preventDefault();
    if (!picked) return;
    if (pin.length !== 6) return setError(t("errors.pinLength"));
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: slugToEmail(picked.login_slug), password: pin });
    setBusy(false);
    if (error) {
      const ex = explainError(error);
      setError(t(ex.key, ex.args));
      setPin("");
      return;
    }
    nav("/", { replace: true });
  }

  const toggleLang = () => setLocale(i18n.language === "ar" ? "en" : "ar");

  return (
    <div className="min-h-dvh flex flex-col max-w-lg mx-auto px-5 pt-10 pb-8">
      <button className="self-end btn-ghost -mt-4" onClick={toggleLang}>
        <Languages size={18} /> {i18n.language === "ar" ? "English" : "العربية"}
      </button>
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 h-16 w-16 rounded-2xl bg-brand text-white flex items-center justify-center text-3xl font-black">$</div>
        <h1 className="text-2xl font-bold">{t("login.title")}</h1>
        <p className="text-muted mt-1">{t("login.subtitle")}</p>
      </div>

      {names.loading ? (
        <Loading />
      ) : names.error ? (
        <p className="text-bad text-center">{t(explainError(names.error).key, explainError(names.error).args)}</p>
      ) : names.data && names.data.length === 0 ? (
        <FirstUserForm onDone={() => names.reload()} />
      ) : !picked ? (
        <ul className="grid grid-cols-2 gap-3">
          {names.data!.map((n) => (
            <li key={n.id}>
              <button
                className="card w-full p-5 text-lg font-semibold active:bg-brand-soft flex flex-col items-center gap-2"
                onClick={() => {
                  setPicked(n);
                  setError(null);
                }}
              >
                <span className="h-12 w-12 rounded-full bg-brand-soft text-brand-dark flex items-center justify-center text-xl font-bold">
                  {personName(n, i18n.language).slice(0, 1).toUpperCase()}
                </span>
                {personName(n, i18n.language)}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <form onSubmit={signIn} className="card p-5">
          <p className="text-center text-lg font-semibold mb-4">{personName(picked, i18n.language)}</p>
          <Field label={t("login.pin")}>
            <PinInput value={pin} onChange={setPin} autoFocus />
          </Field>
          {error && <p className="text-bad text-sm mb-3 text-center">{error}</p>}
          <button className="btn-primary w-full" disabled={busy || pin.length !== 6}>
            {busy ? <Spinner className="text-white" /> : t("login.enter")}
          </button>
          <button type="button" className="btn-ghost w-full mt-2" onClick={() => setPicked(null)}>
            {t("login.changeUser")}
          </button>
          <p className="text-center text-xs text-muted mt-3">{t("login.forgot")}</p>
        </form>
      )}
    </div>
  );
}

/** Shown only when the database has no users at all: creates the owner account. */
function FirstUserForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [slug, setSlug] = useState("");
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
    const { error } = await supabase.auth.signUp({
      email: slugToEmail(s),
      password: pin,
      options: { data: { display_name: name.trim(), display_name_ar: nameAr.trim() || null } },
    });
    setBusy(false);
    if (error) {
      const ex = explainError(error);
      setError(t(ex.key, ex.args));
      return;
    }
    onDone();
    nav("/", { replace: true });
  }

  return (
    <form onSubmit={submit} className="card p-5">
      <h2 className="font-bold text-lg mb-1">{t("login.firstUser")}</h2>
      <p className="text-sm text-muted mb-4">{t("login.firstUserHint")}</p>
      <Field label={t("login.name")}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      </Field>
      <Field label={`${t("login.nameAr")} (${t("common.optional")})`}>
        <input className="input" dir="rtl" value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
      </Field>
      <Field label={t("login.loginName")} hint={t("errors.slugFormat")}>
        <input className="input" dir="ltr" value={slug} onChange={(e) => setSlug(e.target.value)} autoCapitalize="none" autoComplete="username" />
      </Field>
      <Field label={t("login.newPin")}>
        <PinInput value={pin} onChange={setPin} />
      </Field>
      {error && <p className="text-bad text-sm mb-3">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? <Spinner className="text-white" /> : t("login.create")}
      </button>
    </form>
  );
}
