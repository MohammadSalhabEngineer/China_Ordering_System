import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Smartphone } from "lucide-react";
import { useAuth } from "../lib/auth";
import { describeDevice } from "../lib/device";
import { personName } from "../lib/data";
import { explainError } from "../lib/supabase";
import { Field, Spinner } from "../components/ui";

/** First run on a phone: ask what to call it so changes can be traced to it. */
export default function DeviceNamePage() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const { loading, session, profile, registerDevice, deviceNickname } = useAuth();
  const detected = describeDevice();
  const [name, setName] = useState(() =>
    deviceNickname ?? (profile ? `${personName(profile, i18n.language)} · ${detected.label.split(" · ")[0]}` : ""),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return null;
  if (!session || !profile) return <Navigate to="/login" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError(t("errors.required"));
    setBusy(true);
    try {
      await registerDevice(name);
      nav("/", { replace: true });
    } catch (err) {
      const ex = explainError(err);
      setError(t(ex.key, ex.args));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh max-w-lg mx-auto px-5 pt-16">
      <div className="text-center mb-6">
        <Smartphone size={48} className="mx-auto text-brand mb-3" />
        <h1 className="text-2xl font-bold">{t("login.deviceTitle")}</h1>
        <p className="text-muted mt-1">{t("login.deviceHint")}</p>
      </div>
      <form onSubmit={submit} className="card p-5">
        <Field label={t("login.deviceName")} hint={t("login.deviceDetected", { label: detected.label })}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        {error && <p className="text-bad text-sm mb-3">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? <Spinner className="text-white" /> : t("common.save")}
        </button>
      </form>
    </div>
  );
}
