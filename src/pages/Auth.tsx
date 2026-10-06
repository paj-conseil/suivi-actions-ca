import { useState, type FormEvent } from "react";
import { errMsg, supabase } from "../lib";
import { ErrorBox, Logo } from "../components/ui";

function Brand({ subtitle }: { subtitle: string }) {
  return (
    <div className="auth-hero">
      <div className="logo-card"><Logo /></div>
      <div className="kicker">Groupe Scolaire Carlo Acutis</div>
      <h1>Suivi des actions du conseil</h1>
      <p>{subtitle}</p>
    </div>
  );
}

export function Login() {
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        const redirectTo = window.location.origin + window.location.pathname;
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
        if (error) throw error;
        setSent(true);
      }
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <Brand subtitle="Conseil scolaire et conseil d'administration" />
      <form className="stack-lg" onSubmit={submit}>
        {mode === "forgot" && (
          <div className="alert info">
            Saisissez votre adresse email.
            <br />Vous recevrez un lien pour choisir un nouveau mot de passe.
          </div>
        )}
        <label className="field">
          <span>Email</span>
          <input className="input" type="email" autoComplete="email" inputMode="email" required
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {mode === "login" && (
          <label className="field">
            <span>Mot de passe</span>
            <input className="input" type="password" autoComplete="current-password" required
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
        )}
        <ErrorBox msg={error} />
        {sent && mode === "forgot" && (
          <div className="alert ok">
            Si un compte existe pour cette adresse, un email vient d'être envoyé.
            <br />Pensez à vérifier vos courriers indésirables.
          </div>
        )}
        <button className="btn primary block" disabled={busy}>
          {busy ? "Patientez…" : mode === "login" ? "Se connecter" : "Recevoir le lien"}
        </button>
        <button type="button" className="btn ghost block" onClick={() => { setMode(mode === "login" ? "forgot" : "login"); setError(null); setSent(false); }}>
          {mode === "login" ? "Mot de passe oublié ?" : "Retour à la connexion"}
        </button>
      </form>
    </div>
  );
}

export function ChangePassword({ reason, onDone }: { reason: "first" | "recovery" | "voluntary"; onDone: () => void }) {
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rules = [
    { ok: p1.length >= 8, label: "8 caractères minimum" },
    { ok: /[A-Za-z]/.test(p1) && /\d/.test(p1), label: "Au moins une lettre et un chiffre" },
    { ok: p1.length > 0 && p1 === p2, label: "Les deux saisies sont identiques" },
  ];
  const valid = rules.every((r) => r.ok);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true); setError(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: p1 });
      if (error) throw error;
      const { error: e2 } = await supabase.rpc("mark_password_changed");
      if (e2) throw e2;
      onDone();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  const intro = reason === "first"
    ? "Pour votre première connexion, choisissez un mot de passe personnel."
    : reason === "recovery"
      ? "Choisissez votre nouveau mot de passe."
      : "Saisissez votre nouveau mot de passe.";

  return (
    <div className={reason === "voluntary" ? "" : "auth-wrap"}>
      {reason !== "voluntary" && <Brand subtitle={reason === "first" ? "Bienvenue" : "Nouveau mot de passe"} />}
      <form className="stack-lg" onSubmit={submit}>
        <div className="alert info">{intro}</div>
        <label className="field">
          <span>Nouveau mot de passe</span>
          <input className="input" type="password" autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} />
        </label>
        <label className="field">
          <span>Confirmation</span>
          <input className="input" type="password" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} />
        </label>
        <ul className="stack small" style={{ listStyle: "none", padding: 0, margin: 0, gap: 4 }}>
          {rules.map((r) => (
            <li key={r.label} style={{ color: r.ok ? "var(--c-terminee)" : "var(--muted)" }}>{r.ok ? "✓" : "○"} {r.label}</li>
          ))}
        </ul>
        <ErrorBox msg={error} />
        <button className="btn primary block" disabled={!valid || busy}>{busy ? "Enregistrement…" : "Enregistrer le mot de passe"}</button>
        {reason !== "voluntary" && (
          <button type="button" className="btn ghost block" onClick={() => supabase.auth.signOut()}>Se déconnecter</button>
        )}
      </form>
    </div>
  );
}
