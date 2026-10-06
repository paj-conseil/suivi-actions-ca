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
  fonction: string | null;
  is_admin: boolean;
  is_bureau: boolean;
  is_ca: boolean;
  is_associations: boolean;
  must_change_password: boolean;
  actif: boolean;
}

export interface Reunion {
  id: string;
  instance: Instance | null;
  date_reunion: string;
  titre: string;
  notes: string | null;
  created_at: string;
}

export interface Doc {
  id: string;
  reunion_id: string;
  instance: Instance;
  nom_fichier: string;
  storage_path: string;
  taille: number | null;
  mime_type: string | null;
  created_at: string;
}

export interface ReunionSection {
  id: string;
  reunion_id: string;
  instance: Instance;
  notes: string | null;
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
export const instanceLabel = (i: Instance) => (i === "bureau" ? "Conseil scolaire" : "Conseil d'administration");
export const instanceShort = (i: Instance) => (i === "bureau" ? "Conseil scolaire" : "CA");

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

// ---------- Associations et documents administratifs ----------
export interface Association {
  id: string;
  code: "primaire" | "college";
  nom: string;
  notes: string | null;
  ordre: number;
}

export interface AdminDoc {
  id: string;
  association_id: string;
  categorie: string;
  titre: string;
  date_signature: string | null;
  date_validite: string | null;
  sans_echeance: boolean;
  rappel_jours: number;
  responsable_id: string | null;
  notes: string | null;
  archive: boolean;
  remplace_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminFile {
  id: string;
  document_id: string;
  nom_fichier: string;
  storage_path: string;
  taille: number | null;
  mime_type: string | null;
  created_at: string;
}

export const canAssociations = (p: Pick<Profile, "is_admin" | "is_associations">) => p.is_admin || p.is_associations;

export type EtatDoc = "expire" | "a_renouveler" | "a_renseigner" | "valide" | "permanent" | "archive";

export const ETAT_LABEL: Record<EtatDoc, string> = {
  expire: "Expiré",
  a_renouveler: "À renouveler",
  a_renseigner: "À renseigner",
  valide: "Valide",
  permanent: "Sans échéance",
  archive: "Remplacé",
};

/** Classe de couleur réutilisant les codes des actions */
export const ETAT_CLASS: Record<EtatDoc, string> = {
  expire: "s-retard",
  a_renouveler: "s-proche",
  a_renseigner: "s-a_faire",
  valide: "s-terminee",
  permanent: "s-en_cours",
  archive: "s-abandonnee",
};

export function etatDoc(d: Pick<AdminDoc, "archive" | "sans_echeance" | "date_validite" | "rappel_jours">): EtatDoc {
  if (d.archive) return "archive";
  if (d.sans_echeance) return "permanent";
  if (!d.date_validite) return "a_renseigner";
  const n = daysUntil(d.date_validite);
  if (n < 0) return "expire";
  if (n <= d.rappel_jours) return "a_renouveler";
  return "valide";
}

export function validiteText(d: Pick<AdminDoc, "archive" | "sans_echeance" | "date_validite" | "rappel_jours">): string {
  if (d.sans_echeance) return "Sans date de fin";
  if (!d.date_validite) return "Date de validité à renseigner";
  const n = daysUntil(d.date_validite);
  if (d.archive) return `Valable jusqu'au ${fmtDate(d.date_validite)}`;
  if (n < -1) return `Expiré depuis ${-n} jours (${fmtDate(d.date_validite, true)})`;
  if (n === -1) return "Expiré depuis hier";
  if (n === 0) return "Expire aujourd'hui";
  if (n === 1) return "Expire demain";
  if (n <= 60) return `Expire dans ${n} jours · ${fmtDate(d.date_validite, true)}`;
  return `Valable jusqu'au ${fmtDate(d.date_validite)}`;
}

export function addYears(iso: string, years: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setFullYear(d.getFullYear() + years);
  d.setDate(d.getDate() - 1);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export const CATEGORIES = [
  "Statuts et gouvernance",
  "Identification",
  "Fiscalité et dons",
  "Assurances",
  "Locaux et sécurité",
  "Établissement scolaire",
  "Social et personnel",
  "Finances",
  "Données personnelles",
  "Contrats",
  "Autre",
];

/** Liste de départ à adapter avec le bureau et l'expert-comptable */
export const LISTE_TYPE: { categorie: string; titre: string }[] = [
  { categorie: "Statuts et gouvernance", titre: "Statuts à jour signés" },
  { categorie: "Statuts et gouvernance", titre: "Récépissé de déclaration en préfecture" },
  { categorie: "Statuts et gouvernance", titre: "Publication au Journal officiel" },
  { categorie: "Statuts et gouvernance", titre: "Déclaration des dirigeants en préfecture" },
  { categorie: "Statuts et gouvernance", titre: "Procès-verbal de la dernière assemblée générale" },
  { categorie: "Statuts et gouvernance", titre: "Procès-verbal d'élection du bureau" },
  { categorie: "Statuts et gouvernance", titre: "Règlement intérieur de l'association" },
  { categorie: "Identification", titre: "Avis de situation SIRENE (SIRET)" },
  { categorie: "Identification", titre: "RIB de l'association" },
  { categorie: "Fiscalité et dons", titre: "Rescrit fiscal (reçus fiscaux pour les dons)" },
  { categorie: "Assurances", titre: "Assurance responsabilité civile" },
  { categorie: "Assurances", titre: "Assurance multirisque des locaux" },
  { categorie: "Assurances", titre: "Assurance individuelle accident des élèves" },
  { categorie: "Locaux et sécurité", titre: "Bail ou convention d'occupation des locaux" },
  { categorie: "Locaux et sécurité", titre: "Procès-verbal de la commission de sécurité" },
  { categorie: "Locaux et sécurité", titre: "Vérification des installations électriques" },
  { categorie: "Locaux et sécurité", titre: "Vérification des extincteurs et alarmes" },
  { categorie: "Locaux et sécurité", titre: "Document unique d'évaluation des risques (DUERP)" },
  { categorie: "Établissement scolaire", titre: "Déclaration d'ouverture de l'établissement" },
  { categorie: "Établissement scolaire", titre: "Déclaration du directeur auprès des autorités" },
  { categorie: "Établissement scolaire", titre: "Règlement intérieur de l'établissement" },
  { categorie: "Social et personnel", titre: "Attestation de vigilance URSSAF" },
  { categorie: "Social et personnel", titre: "Contrat de prévoyance et mutuelle" },
  { categorie: "Finances", titre: "Comptes annuels approuvés" },
  { categorie: "Finances", titre: "Budget prévisionnel voté" },
  { categorie: "Données personnelles", titre: "Registre des traitements RGPD" },
];
