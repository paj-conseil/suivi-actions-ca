import { useEffect, useState, type FormEvent } from "react";
import { adminUsers, errMsg, fullName, supabase, type Profile, type Projet, assocNiveau, canAssociations } from "../lib";
import { useApp } from "../store";
import { Avatar, ConfirmButton, ErrorBox, Sheet, Topbar } from "../components/ui";
import { IKey, IPlus } from "../components/Icons";

function Roles({ p }: { p: Profile }) {
  return (
    <span className="row wrap" style={{ gap: 4 }}>
      {p.is_admin && <span className="badge role">Admin</span>}
      {p.is_bureau && <span className="badge instance-bureau">Conseil scolaire</span>}
      {p.is_ca && <span className="badge instance-ca">CA</span>}
      {assocNiveau(p) && <span className="badge role">{assocNiveau(p)}</span>}
      {(p.is_projets || p.projet_creation) && !p.is_admin && <span className="badge role">{p.projet_creation ? "Projets : création" : "Projets"}</span>}
      {!p.is_admin && !p.is_bureau && !p.is_ca && !canAssociations(p) && !p.is_projets && !p.projet_creation && <span className="badge">Aucun accès</span>}
      {!p.actif && <span className="badge s-retard">Désactivé</span>}
      {p.actif && p.must_change_password && <span className="badge s-proche">1re connexion à faire</span>}
    </span>
  );
}

export type Creds = { prenom: string; email: string; password: string; reset: boolean };

export function UsersPage() {
  const { people, refreshPeople, me } = useApp();
  const [editing, setEditing] = useState<Profile | "new" | null>(null);
  const [creds, setCreds] = useState<Creds | null>(null);

  return (
    <>
      <Topbar title="Membres" backTo />
      <main className="content">
        <p className="muted small" style={{ marginTop: 0 }}>
          {people.length} compte{people.length > 1 ? "s" : ""}.
          <br />Touchez un membre pour modifier ses accès.
        </p>
        <div className="stack">
          {people.map((p) => (
            <button key={p.id} className="list-item" onClick={() => setEditing(p)} style={{ opacity: p.actif ? 1 : 0.6 }}>
              <Avatar p={p} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 650 }}>{fullName(p)}{p.id === me.id && <span className="muted small"> (vous)</span>}</div>
                {p.fonction && <div className="small" style={{ color: "var(--accent)", fontWeight: 600 }}>{p.fonction}</div>}
                <div className="tiny muted" style={{ marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis" }}>{p.email}</div>
                <Roles p={p} />
              </div>
            </button>
          ))}
        </div>
        <div className="card small" style={{ marginTop: 20 }}>
          <strong>Niveaux d'accès</strong>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            <li><strong>Admin</strong> : voit et modifie tout, gère les membres.</li>
            <li><strong>Conseil scolaire</strong> : consulte la section Conseil scolaire des réunions et ses actions.</li>
            <li><strong>Conseil d'administration</strong> : consulte la section CA des réunions et ses actions.</li>
            <li><strong>Associations</strong> : trois niveaux cumulables, Lecture, Modification et Suppression des documents administratifs des deux associations.</li>
            <li><strong>Projets</strong> : accès aux seuls projets dont la personne est membre. Peut être le seul accès d'un compte.</li>
            <li><strong>Création de projets</strong> : permet de créer des projets. Le créateur gère ensuite son projet (informations, membres, suppression).</li>
          </ul>
          <p className="muted tiny" style={{ marginBottom: 0 }}>Chaque responsable peut mettre à jour le statut et l'avancement de ses propres actions.</p>
        </div>
      </main>
      <button className="fab" onClick={() => setEditing("new")}><IPlus />Membre</button>

      {editing && (
        <UserSheet user={editing === "new" ? null : editing} onClose={() => setEditing(null)}
          onCreds={(c) => { setEditing(null); setCreds(c); }}
          onSaved={async () => { await refreshPeople(); setEditing(null); }} />
      )}
      {creds && <CredsSheet c={creds} onClose={() => setCreds(null)} />}
    </>
  );
}

function UserSheet({ user, onClose, onSaved, onCreds }: {
  user: Profile | null; onClose: () => void; onSaved: () => Promise<void>; onCreds: (c: Creds) => void;
}) {
  const { me, toast, refreshPeople, refreshMe } = useApp();
  const [prenom, setPrenom] = useState(user?.prenom ?? "");
  const [nom, setNom] = useState(user?.nom ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [fonction, setFonction] = useState(user?.fonction ?? "");
  const [isAdmin, setIsAdmin] = useState(user?.is_admin ?? false);
  const [isBureau, setIsBureau] = useState(user?.is_bureau ?? false);
  const [isCa, setIsCa] = useState(user?.is_ca ?? true);
  const [aLect, setALect] = useState(user ? canAssociations({ ...user, is_admin: false }) : false);
  const [aModif, setAModif] = useState(user?.assoc_modification ?? false);
  const [aSuppr, setASuppr] = useState(user?.assoc_suppression ?? false);
  const assocRights = { is_associations: aLect || aModif || aSuppr, assoc_modification: aModif, assoc_suppression: aSuppr };
  const [actif, setActif] = useState(user?.actif ?? true);
  const [isProjets, setIsProjets] = useState(user ? user.is_projets || user.projet_creation : false);
  const [projCreation, setProjCreation] = useState(user?.projet_creation ?? false);
  const [projets, setProjets] = useState<Projet[]>([]);
  const [mesProjetsInit, setMesProjetsInit] = useState<Set<string>>(new Set());
  const [mesProjets, setMesProjets] = useState<Set<string>>(new Set());
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("projets").select("*").order("nom");
      setProjets((data ?? []) as Projet[]);
      if (user) {
        const { data: m } = await supabase.from("projet_membres").select("projet_id").eq("profile_id", user.id);
        const s = new Set(((m ?? []) as { projet_id: string }[]).map((x) => x.projet_id));
        setMesProjetsInit(s); setMesProjets(new Set(s));
      }
    })();
  }, [user]);

  async function saveProjets(uid: string) {
    const add = [...mesProjets].filter((x) => !mesProjetsInit.has(x));
    const del = [...mesProjetsInit].filter((x) => !mesProjets.has(x));
    if (add.length) {
      const { error } = await supabase.from("projet_membres").insert(add.map((projet_id) => ({ projet_id, profile_id: uid })));
      if (error) throw error;
    }
    if (del.length) {
      const { error } = await supabase.from("projet_membres").delete().eq("profile_id", uid).in("projet_id", del);
      if (error) throw error;
    }
  }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const self = user?.id === me.id;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      if (!user) {
        const res = await adminUsers<{ id: string; password: string }>({
          action: "create", prenom, nom, email, fonction, is_admin: isAdmin, is_bureau: isBureau, is_ca: isCa, ...assocRights, is_projets: isProjets, projet_creation: isProjets && projCreation,
        });
        if (isProjets) await saveProjets(res.id);
        await refreshPeople();
        onCreds({ prenom, email: email.trim().toLowerCase(), password: res.password, reset: false });
      } else {
        await adminUsers({
          action: "update", id: user.id, prenom, nom, fonction,
          email: email.trim().toLowerCase() !== user.email ? email : undefined,
          is_admin: isAdmin, is_bureau: isBureau, is_ca: isCa, ...assocRights, is_projets: isProjets, projet_creation: isProjets && projCreation, actif,
        });
        await saveProjets(user.id);
        if (self) await refreshMe();
        toast("Membre mis à jour");
        await onSaved();
      }
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={user ? fullName(user) : "Nouveau membre"} onClose={onClose}>
      <form className="stack-lg" onSubmit={submit}>
        <div className="row" style={{ gap: 10 }}>
          <label className="field" style={{ flex: 1 }}><span>Prénom</span>
            <input className="input" value={prenom} onChange={(e) => setPrenom(e.target.value)} required autoComplete="off" />
          </label>
          <label className="field" style={{ flex: 1 }}><span>Nom</span>
            <input className="input" value={nom} onChange={(e) => setNom(e.target.value)} required autoComplete="off" />
          </label>
        </div>
        <label className="field"><span>Fonction <span className="hint">(facultatif)</span></span>
          <input className="input" list="fonctions" value={fonction} onChange={(e) => setFonction(e.target.value)} placeholder="Ex. Président, Directeur, Trésorière" autoComplete="off" />
          <datalist id="fonctions">
            {["Président", "Vice-président", "Trésorier", "Secrétaire", "Directeur", "Directrice adjointe", "Administrateur", "Membre du conseil scolaire"].map((x) => <option key={x} value={x} />)}
          </datalist>
        </label>
        <label className="field"><span>Email</span>
          <input className="input" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" />
        </label>
        <div className="field"><span>Accès</span>
          <div className="stack">
            <label className="check"><input type="checkbox" checked={isAdmin} disabled={self} onChange={(e) => setIsAdmin(e.target.checked)} />
              <span><span className="t">Admin</span><br /><span className="d">Voit et modifie tout, gère les membres</span></span></label>
            <label className="check"><input type="checkbox" checked={isBureau} onChange={(e) => setIsBureau(e.target.checked)} />
              <span><span className="t">Conseil scolaire</span><br /><span className="d">Section Conseil scolaire des réunions et ses actions</span></span></label>
            <label className="check"><input type="checkbox" checked={isCa} onChange={(e) => setIsCa(e.target.checked)} />
              <span><span className="t">Conseil d'administration</span><br /><span className="d">Section CA des réunions et ses actions</span></span></label>
            <div className="check-group">
              <div className="cg-title">Section Associations<span className="d">Documents administratifs du Primaire et du Collège{isAdmin ? " · inclus dans Admin" : ""}</span></div>
              <label className="check"><input type="checkbox" checked={isAdmin || aLect || aModif || aSuppr} disabled={isAdmin || aModif || aSuppr}
                onChange={(e) => setALect(e.target.checked)} />
                <span><span className="t">Lecture</span><br /><span className="d">Consulter les documents et leurs pièces</span></span></label>
              <label className="check"><input type="checkbox" checked={isAdmin || aModif} disabled={isAdmin}
                onChange={(e) => { setAModif(e.target.checked); if (e.target.checked) setALect(true); }} />
                <span><span className="t">Modification</span><br /><span className="d">Ajouter, modifier, renouveler, joindre des pièces</span></span></label>
              <label className="check"><input type="checkbox" checked={isAdmin || aSuppr} disabled={isAdmin}
                onChange={(e) => { setASuppr(e.target.checked); if (e.target.checked) setALect(true); }} />
                <span><span className="t">Suppression</span><br /><span className="d">Supprimer des documents et des pièces jointes</span></span></label>
            </div>
            <div className="check-group">
              <div className="cg-title">Section Projets<span className="d">Chaque personne ne voit que les projets cochés{isAdmin ? " · Admin : voit tous les projets" : ""}</span></div>
              <label className="check"><input type="checkbox" checked={isAdmin || isProjets} disabled={isAdmin}
                onChange={(e) => { setIsProjets(e.target.checked); if (!e.target.checked) { setMesProjets(new Set()); setProjCreation(false); } }} />
                <span><span className="t">Accès aux projets</span><br /><span className="d">Ouvre l'onglet Projets</span></span></label>
              <label className="check"><input type="checkbox" checked={isAdmin || projCreation} disabled={isAdmin}
                onChange={(e) => { setProjCreation(e.target.checked); if (e.target.checked) setIsProjets(true); }} />
                <span><span className="t">Création de projets</span><br /><span className="d">Peut créer des projets et gérer ceux qu'il a créés</span></span></label>
              {(isProjets || isAdmin) && (projets.length === 0
                ? <div className="tiny muted">Aucun projet créé pour l'instant.</div>
                : projets.map((pj) => (
                  <label key={pj.id} className="check">
                    <input type="checkbox" checked={mesProjets.has(pj.id)}
                      onChange={(e) => setMesProjets((s) => { const n = new Set(s); e.target.checked ? n.add(pj.id) : n.delete(pj.id); return n; })} />
                    <span><span className="t">{pj.nom}</span><br /><span className="d">Membre du projet</span></span>
                  </label>
                )))}
            </div>
            {user && !self && (
              <label className="check"><input type="checkbox" checked={actif} onChange={(e) => setActif(e.target.checked)} />
                <span><span className="t">Compte actif</span><br /><span className="d">Décocher bloque la connexion sans supprimer l'historique</span></span></label>
            )}
          </div>
        </div>
        {!user && <div className="alert info small">Un mot de passe provisoire sera généré.<br />Le membre devra le changer à sa première connexion.</div>}
        <ErrorBox msg={error} />
        <button className="btn primary block" disabled={busy}>{busy ? "Enregistrement…" : user ? "Enregistrer" : "Créer le compte"}</button>
        {user && (
          <>
            <button type="button" className="btn block" disabled={busy} onClick={async () => {
              setBusy(true); setError(null);
              try {
                const res = await adminUsers<{ password: string }>({ action: "reset_password", id: user.id });
                await refreshPeople();
                onCreds({ prenom: user.prenom, email: user.email, password: res.password, reset: true });
              } catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
            }}><IKey width={20} />Générer un mot de passe provisoire</button>
            {!self && (
              <ConfirmButton label="Supprimer le compte" confirmLabel="Confirmer la suppression définitive" onConfirm={async () => {
                try { await adminUsers({ action: "delete", id: user.id }); toast("Compte supprimé"); await onSaved(); }
                catch (err) { setError(errMsg(err)); }
              }} />
            )}
          </>
        )}
      </form>
    </Sheet>
  );
}

export function CredsSheet({ c, onClose }: { c: Creds; onClose: () => void }) {
  const { toast } = useApp();
  const url = window.location.origin + window.location.pathname;
  const message = `Bonjour ${c.prenom},\n\nVotre accès à l'application de suivi des actions du conseil d'administration est ${c.reset ? "réinitialisé" : "prêt"}.\n\nAdresse : ${url}\nIdentifiant : ${c.email}\nMot de passe provisoire : ${c.password}\n\nVous devrez choisir votre propre mot de passe à la connexion.\nAstuce : ajoutez l'application à l'écran d'accueil de votre téléphone.`;
  const copy = async (t: string, what: string) => {
    try { await navigator.clipboard.writeText(t); toast(`${what} copié`); } catch { toast("Copie impossible, sélectionnez le texte"); }
  };
  return (
    <Sheet title={c.reset ? "Mot de passe réinitialisé" : "Compte créé"} onClose={onClose}>
      <div className="stack-lg">
        <div className="small">Mot de passe provisoire de <strong>{c.email}</strong> :</div>
        <div className="pwd-box">{c.password}</div>
        <div className="alert info small">Ce mot de passe ne sera plus affiché.<br />Transmettez-le au membre maintenant.</div>
        <button className="btn primary block" onClick={() => copy(message, "Message")}>Copier le message d'invitation</button>
        <a className="btn block" href={`mailto:${encodeURIComponent(c.email)}?subject=${encodeURIComponent("Accès au suivi des actions du CA")}&body=${encodeURIComponent(message)}`}>Ouvrir dans ma messagerie</a>
        <button className="btn ghost block" onClick={() => copy(c.password, "Mot de passe")}>Copier le mot de passe seul</button>
        <button className="btn block" onClick={onClose}>Terminé</button>
      </div>
    </Sheet>
  );
}
