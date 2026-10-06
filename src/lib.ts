import { createClient } from "@supabase/supabase-js";

// Détecté avant que le client ne nettoie l'URL : arrivée par le lien « mot de passe oublié »
export const arrivedFromRecoveryLink = /type=recovery/.test(window.location.hash);

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
  // flux "implicit" : le lien de réinitialisation fonctionne même s'il est ouvert sur un autre appareil
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" } },
);

// ---------- Types ----------
export type Instance = "bureau" | "ca";
export type Statut = "a_faire" | "en_cours" | "bloquee" | "terminee" | "abandonnee";

export interface Profile {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  is_admin: boolean;
  is_bureau: boolean;
  is_ca: boolean;
  must_change_password: boolean;
  actif: boolean;
}

export interface Reunion {
  id: string;
  instance: Instance;
  date_reunion: string;
  titre: string;
  notes: string | null;
  created_at: string;
}

export interface Doc {
  id: string;
  reunion_id: string;
  nom_fichier: string;
  storage_path: string;
  taille: number | null;
  mime_type: string | null;
  created_at: string;
}

export interface Action {
  id: string;
  instance: Instance;
  reunion_id: string | null;
  titre: string;
  description: string | null;
  perimetre: string | null;
  responsable_id: string | null;
  echeance: string | null;
  statut: Statut;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

export interface Avancement {
  id: string;
  action_id: string;
  auteur_id: string | null;
  texte: string;
  ancien_statut: Statut | null;
  nouveau_statut: Statut | null;
  created_at: string;
}

// ---------- Libellés ----------
export const STATUTS: { value: Statut; label: string }[] = [
  { value: "a_faire", label: "À faire" },
  { value: "en_cours", label: "En cours" },
  { value: "bloquee", label: "Bloquée" },
  { value: "terminee", label: "Terminée" },
  { value: "abandonnee", label: "Abandonnée" },
];
export const statutLabel = (s: Statut) => STATUTS.find((x) => x.value === s)?.label ?? s;
export const instanceLabel = (i: Instance) => (i === "bureau" ? "Bureau" : "Conseil d'administration");
export const instanceShort = (i: Instance) => (i === "bureau" ? "Bureau" : "CA");

export const isClosed = (s: Statut) => s === "terminee" || s === "abandonnee";

// ---------- Échéances et codes couleur ----------
export function todayISO(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function daysUntil(dateISO: string): number {
  const a = new Date(todayISO() + "T00:00:00");
  const b = new Date(dateISO + "T00:00:00");
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export type Sante = "retard" | "proche" | "bloquee" | "en_cours" | "a_faire" | "terminee" | "abandonnee";

export const SOON_DAYS = 7;

/** Couleur synthétique d'une action : priorité au retard, puis au blocage, puis à l'échéance proche */
export function sante(a: Pick<Action, "statut" | "echeance">): Sante {
  if (a.statut === "terminee") return "terminee";
  if (a.statut === "abandonnee") return "abandonnee";
  if (a.echeance) {
    const d = daysUntil(a.echeance);
    if (d < 0) return "retard";
    if (a.statut === "bloquee") return "bloquee";
    if (d <= SOON_DAYS) return "proche";
  }
  if (a.statut === "bloquee") return "bloquee";
  return a.statut;
}

export const SANTE_LABEL: Record<Sante, string> = {
  retard: "En retard",
  proche: "Échéance proche",
  bloquee: "Bloquée",
  en_cours: "En cours",
  a_faire: "À faire",
  terminee: "Terminée",
  abandonnee: "Abandonnée",
};

export function echeanceText(a: Pick<Action, "statut" | "echeance" | "closed_at">): string {
  if (!a.echeance) return "Sans échéance";
  if (isClosed(a.statut)) return `Échéance ${fmtDate(a.echeance)}`;
  const d = daysUntil(a.echeance);
  if (d < -1) return `En retard de ${-d} jours`;
  if (d === -1) return "En retard d'1 jour";
  if (d === 0) return "Échéance aujourd'hui";
  if (d === 1) return "Échéance demain";
  if (d <= 30) return `Dans ${d} jours · ${fmtDate(a.echeance, true)}`;
  return `Échéance ${fmtDate(a.echeance)}`;
}

// ---------- Formats ----------
export function fmtDate(iso: string, short = false): string {
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  return d.toLocaleDateString("fr-FR", short
    ? { day: "numeric", month: "short" }
    : { day: "numeric", month: "long", year: "numeric" });
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export function fmtSize(n: number | null): string {
  if (!n) return "";
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} Ko`;
  return `${(n / 1024 / 1024).toFixed(1)} Mo`;
}

export const fullName = (p?: Pick<Profile, "prenom" | "nom"> | null) => (p ? `${p.prenom} ${p.nom}` : "Non attribuée");
export const initials = (p?: Pick<Profile, "prenom" | "nom"> | null) =>
  p ? `${p.prenom[0] ?? ""}${p.nom[0] ?? ""}`.toUpperCase() : "?";

export function errMsg(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e);
  if (/Invalid login credentials/i.test(m)) return "Email ou mot de passe incorrect.";
  if (/Email not confirmed/i.test(m)) return "Adresse email non confirmée.";
  if (/rate limit|too many/i.test(m)) return "Trop de tentatives. Réessayez dans quelques minutes.";
  if (/same.*password|different from the old/i.test(m)) return "Le nouveau mot de passe doit être différent de l'ancien.";
  if (/Password should be at least/i.test(m)) return "Le mot de passe est trop court.";
  if (/banned|user is banned/i.test(m)) return "Ce compte est désactivé.";
  return m;
}

/** Appel de la fonction serveur de gestion des utilisateurs */
export async function adminUsers<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("admin-users", { body });
  if (error) {
    // Récupérer le message d'erreur renvoyé par la fonction
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      let j: { error?: string } | null = null;
      try { j = await ctx.json(); } catch { /* réponse non JSON */ }
      if (j?.error) throw new Error(j.error);
    }
    throw error;
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}
