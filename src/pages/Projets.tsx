import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  supabase, type Commentaire, type Profile, type Projet, type ProjetMembre, type ProjetStatut, type Statut, type Tache, type Theme,
  PROJET_STATUTS, STATUTS, adminUsers, canCreerProjet, canProjets, isGestionnaire, echeanceText, errMsg, fmtDate, fmtDateTime, fullName, isClosed, projetStatut,
  sante, statsTaches,
} from "../lib";
import { useApp, useQuery } from "../store";
import { Avatar, ConfirmButton, Empty, ErrorBox, Linkify, SanteBadge, Sheet, Spinner, Topbar } from "../components/ui";
import { IClock, IComment, IEdit, IFolder, IMinusBox, IPlus, IPlusBox, ITrash } from "../components/Icons";

// ---------- Petits composants ----------
function ProjetStatutBadge({ s }: { s: ProjetStatut }) {
  const st = projetStatut(s);
  return <span className={`badge ${st.cls}`}><span className="dot" />{st.label}</span>;
}

function Progress({ value }: { value: number }) {
  return (
    <div className="progress" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${value}%` }} />
    </div>
  );
}

function AvatarStack({ people }: { people: Profile[] }) {
  const shown = people.slice(0, 5);
  return (
    <span className="avatar-stack" title={people.map(fullName).join(", ")}>
      {shown.map((p) => <Avatar key={p.id} p={p} sm />)}
      {people.length > shown.length && <span className="avatar sm more">+{people.length - shown.length}</span>}
    </span>
  );
}

/** Rond à toucher pour terminer ou rouvrir une tâche */
function QuickCheck({ t, onChanged }: { t: Tache; onChanged: () => void }) {
  const { toast } = useApp();
  const done = t.statut === "terminee";
  return (
    <button type="button" className={`quick-check ${done ? "on" : ""}`} aria-label={done ? "Rouvrir la tâche" : "Marquer comme terminée"}
      onClick={async (e) => {
        e.stopPropagation();
        const { error } = await supabase.from("projet_taches").update({ statut: done ? "en_cours" : "terminee" }).eq("id", t.id);
        if (error) toast(errMsg(error)); else { toast(done ? "Tâche rouverte" : "Tâche terminée"); onChanged(); }
      }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 12.5 4 4L18 8.5" /></svg>
    </button>
  );
}

// ---------- Liste des projets ----------
export function ProjetsList() {
  const { me, go, dataVersion, peopleById } = useApp();
  const q = useQuery(async () => {
    const [p, t, m] = await Promise.all([
      supabase.from("projets").select("*").order("created_at", { ascending: false }),
      supabase.from("projet_taches").select("id, projet_id, statut, echeance, responsable_id"),
      supabase.from("projet_membres").select("*"),
    ]);
    if (p.error) throw p.error;
    return { projets: p.data as Projet[], taches: (t.data ?? []) as Tache[], membres: (m.data ?? []) as ProjetMembre[] };
  }, [dataVersion]);

  if (!canProjets(me)) return (<><Topbar title="Projets" /><main className="content"><Empty>Cette section nécessite le droit d'accès « Projets ».</Empty></main></>);

  const projets = q.data?.projets ?? [];
  const actifs = projets.filter((p) => !["termine", "abandonne"].includes(p.statut));
  const clos = projets.filter((p) => ["termine", "abandonne"].includes(p.statut));
  const mesOuvertes = (q.data?.taches ?? []).filter((t) => t.responsable_id === me.id && !isClosed(t.statut));

  const card = (p: Projet) => {
    const st = statsTaches((q.data?.taches ?? []).filter((t) => t.projet_id === p.id));
    const membres = (q.data?.membres ?? []).filter((m) => m.projet_id === p.id).map((m) => peopleById.get(m.profile_id)).filter(Boolean) as Profile[];
    return (
      <button key={p.id} className="projet-card" onClick={() => go({ v: "projet", id: p.id })}>
        <div className="row" style={{ gap: 8, alignItems: "flex-start" }}>
          <div className="title" style={{ flex: 1 }}>{p.nom}</div>
          <ProjetStatutBadge s={p.statut} />
        </div>
        {p.objectif && <div className="obj">{p.objectif}</div>}
        <div className="row" style={{ gap: 10, marginTop: 10 }}>
          <Progress value={st.avancement} />
          <span className="small" style={{ fontWeight: 600, minWidth: 40, textAlign: "right" }}>{st.avancement} %</span>
        </div>
        <div className="meta">
          <span>{st.ouvertes} ouverte{st.ouvertes > 1 ? "s" : ""}</span>
          <span>{st.fermees} fermée{st.fermees > 1 ? "s" : ""}</span>
          {st.retard > 0 && <span className="badge s-retard"><span className="dot" />{st.retard} en retard</span>}
          <span className="spacer" />
          {membres.length > 0 && <AvatarStack people={membres} />}
        </div>
      </button>
    );
  };

  return (
    <>
      <Topbar title="Projets" />
      <main className="content">
        <ErrorBox msg={q.error} />
        {q.loading && !q.data ? <Spinner /> : projets.length === 0 ? (
          <Empty icon={<IFolder />}>{canCreerProjet(me) ? "Aucun projet pour l'instant. Créez le premier avec le bouton « Projet »." : "Vous ne participez à aucun projet pour l'instant."}</Empty>
        ) : (
          <>
            {mesOuvertes.length > 0 && (
              <div className="alert info small" style={{ marginBottom: 6 }}>
                Vous êtes responsable de <strong>{mesOuvertes.length} tâche{mesOuvertes.length > 1 ? "s" : ""} ouverte{mesOuvertes.length > 1 ? "s" : ""}</strong>
                {mesOuvertes.some((t) => sante(t) === "retard") && <>, dont {mesOuvertes.filter((t) => sante(t) === "retard").length} en retard</>}.
              </div>
            )}
            {actifs.length > 0 && <><div className="section-title">Projets en cours</div><div className="stack">{actifs.map(card)}</div></>}
            {clos.length > 0 && <><div className="section-title">Projets clos</div><div className="stack">{clos.map(card)}</div></>}
          </>
        )}
      </main>
      {canCreerProjet(me) && <button className="fab" onClick={() => go({ v: "projet-form" })}><IPlus />Projet</button>}
    </>
  );
}

// ---------- Page projet ----------
type Filtre = "toutes" | "ouvertes" | "miennes" | "retard";
const FILTRES: { v: Filtre; label: string }[] = [
  { v: "toutes", label: "Toutes" },
  { v: "ouvertes", label: "Ouvertes" },
  { v: "miennes", label: "Mes tâches" },
  { v: "retard", label: "En retard" },
];

function loadSet(key: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(key) ?? "[]")); } catch { return new Set(); }
}
function saveSet(key: string, s: Set<string>) {
  try { localStorage.setItem(key, JSON.stringify([...s])); } catch { /* stockage indisponible */ }
}

export function ProjetDetail({ id }: { id: string }) {
  const { me, go, toast, bump, dataVersion, peopleById } = useApp();
  const q = useQuery(async () => {
    const { data, error } = await supabase.from("projets").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const [th, ta, m] = await Promise.all([
      supabase.from("projet_themes").select("*").eq("projet_id", id).order("ordre").order("created_at"),
      supabase.from("projet_taches").select("*").eq("projet_id", id).order("ordre").order("created_at"),
      supabase.from("projet_membres").select("*").eq("projet_id", id),
    ]);
    return { p: data as Projet, themes: (th.data ?? []) as Theme[], taches: (ta.data ?? []) as Tache[], membres: (m.data ?? []) as ProjetMembre[] };
  }, [id, dataVersion]);

  const [filtre, setFiltre] = useState<Filtre>("toutes");
  const [collapsedThemes, setCollapsedThemes] = useState<Set<string>>(() => loadSet(`proj:${id}:themes`));
  const [openTasks, setOpenTasks] = useState<Set<string>>(() => loadSet(`proj:${id}:taches`));
  const [themeSheet, setThemeSheet] = useState<Theme | "new" | null>(null);
  const [showObj, setShowObj] = useState(false);
  useEffect(() => saveSet(`proj:${id}:themes`, collapsedThemes), [id, collapsedThemes]);
  useEffect(() => saveSet(`proj:${id}:taches`, openTasks), [id, openTasks]);

  const taches = q.data?.taches ?? [];
  const parents = taches.filter((t) => !t.parent_id);
  const subsOf = useMemo(() => {
    const m = new Map<string, Tache[]>();
    taches.filter((t) => t.parent_id).forEach((t) => m.set(t.parent_id!, [...(m.get(t.parent_id!) ?? []), t]));
    return m;
  }, [taches]);

  if (q.loading && !q.data) return (<><Topbar title="Projet" backTo /><Spinner /></>);
  if (!q.data) return (<><Topbar title="Projet" backTo /><main className="content"><ErrorBox msg={q.error} /><Empty>Projet introuvable ou non accessible.</Empty></main></>);
  const { p, themes, membres } = q.data;
  const st = statsTaches(taches);
  const membresP = membres.map((m) => peopleById.get(m.profile_id)).filter(Boolean) as Profile[];

  const match = (t: Tache) => filtre === "toutes" ? true
    : filtre === "ouvertes" ? !isClosed(t.statut)
      : filtre === "miennes" ? t.responsable_id === me.id
        : sante(t) === "retard";
  const filtering = filtre !== "toutes";
  const visibleParent = (t: Tache) => match(t) || (subsOf.get(t.id) ?? []).some(match);

  const toggleTheme = (tid: string) => setCollapsedThemes((s) => { const n = new Set(s); n.has(tid) ? n.delete(tid) : n.add(tid); return n; });
  const toggleTask = (tid: string) => setOpenTasks((s) => { const n = new Set(s); n.has(tid) ? n.delete(tid) : n.add(tid); return n; });
  const expandAll = () => { setCollapsedThemes(new Set()); setOpenTasks(new Set(parents.filter((t) => subsOf.has(t.id)).map((t) => t.id))); };
  const collapseAll = () => { setOpenTasks(new Set()); setCollapsedThemes(new Set(themes.map((t) => t.id))); };

  const kpi = (n: number | string, label: string, cls: string, f?: Filtre) => (
    <button className={`kpi ${cls}`} onClick={() => f && setFiltre(f)} disabled={!f}>
      <span className="n">{n}</span><span className="l">{label}</span>
    </button>
  );

  const row = (t: Tache, isSub: boolean): ReactNode => {
    const subs = subsOf.get(t.id) ?? [];
    const open = filtering ? true : openTasks.has(t.id);
    const resp = t.responsable_id ? peopleById.get(t.responsable_id) : null;
    const doneSubs = subs.filter((x) => x.statut === "terminee").length;
    return (
      <div key={t.id} className={isSub ? "sub-wrap" : "task-wrap"}>
        <div className={`task-row s-${sante(t)} ${isClosed(t.statut) ? "closed" : ""} ${isSub ? "sub" : ""}`}
          role="button" tabIndex={0} onClick={() => go({ v: "tache", id: t.id })}
          onKeyDown={(e) => { if (e.key === "Enter") go({ v: "tache", id: t.id }); }}>
          {!isSub && (subs.length > 0 ? (
            <button type="button" className="tree-toggle" aria-expanded={open} aria-label={open ? "Masquer les sous-tâches" : "Afficher les sous-tâches"}
              onClick={(e) => { e.stopPropagation(); toggleTask(t.id); }}>
              {open ? <IMinusBox /> : <IPlusBox />}
            </button>
          ) : <span className="tree-spacer" />)}
          <QuickCheck t={t} onChanged={bump} />
          <div className="task-main">
            <div className="task-title">{t.titre}</div>
            <div className="task-meta">
              {!isClosed(t.statut) && ["retard", "proche", "bloquee"].includes(sante(t)) && <SanteBadge a={t} />}
              {t.statut === "en_cours" && sante(t) === "en_cours" && <span className="badge s-en_cours"><span className="dot" />En cours</span>}
              {resp && <span className="row" style={{ gap: 5 }}><Avatar p={resp} sm />{resp.prenom}</span>}
              {t.echeance && <span className="row" style={{ gap: 3 }}><IClock width={14} height={14} />{isClosed(t.statut) ? fmtDate(t.echeance, true) : echeanceText(t)}</span>}
              {subs.length > 0 && <span className="sub-count">{doneSubs}/{subs.length} sous-tâche{subs.length > 1 ? "s" : ""}</span>}
            </div>
          </div>
        </div>
        {!isSub && open && (
          <div className="subs">
            {subs.filter((x) => !filtering || match(x)).map((x) => row(x, true))}
            {!filtering && (
              <button className="add-link sub" onClick={() => go({ v: "tache-form", projet: p.id, parent: t.id })}><IPlus width={16} />Sous-tâche</button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <Topbar title="Projet" backTo right={isGestionnaire(me, p) && (
        <button className="icon-btn" aria-label="Modifier le projet" onClick={() => go({ v: "projet-form", id: p.id })}><IEdit /></button>
      )} />
      <main className="content">
        <section className="projet-head card">
          <div className="row" style={{ gap: 8, alignItems: "flex-start" }}>
            <h2 style={{ margin: 0, flex: 1, fontSize: 21 }}>{p.nom}</h2>
            <ProjetStatutBadge s={p.statut} />
          </div>
          {p.objectif && (
            <div className={`obj ${showObj ? "full" : ""}`} onClick={() => setShowObj((v) => !v)}>
              <span className="lbl">Objectif</span><Linkify text={p.objectif} />
            </div>
          )}
          {(p.date_debut || p.date_fin) && (
            <div className="small muted" style={{ marginTop: 6 }}>
              {p.date_debut && <>Début {fmtDate(p.date_debut)}</>}{p.date_debut && p.date_fin && " · "}{p.date_fin && <>Fin visée {fmtDate(p.date_fin)}</>}
            </div>
          )}
          <div className="row" style={{ gap: 10, marginTop: 12 }}>
            <Progress value={st.avancement} />
            <span style={{ fontWeight: 700, minWidth: 44, textAlign: "right" }}>{st.avancement} %</span>
          </div>
          <div className="kpis" style={{ marginTop: 12 }}>
            {kpi(st.ouvertes, "Ouvertes", "s-en_cours", "ouvertes")}
            {kpi(st.fermees, "Fermées", "s-terminee")}
            {kpi(st.retard, "En retard", "s-retard", "retard")}
            {kpi(st.bloquees, "Bloquées", "s-bloquee")}
          </div>
          <div className="row" style={{ marginTop: 12, gap: 8 }}>
            <span className="small muted">{membresP.length} membre{membresP.length > 1 ? "s" : ""}</span>
            <AvatarStack people={membresP} />
            {p.created_by && peopleById.get(p.created_by) && (
              <span className="tiny muted" style={{ marginLeft: "auto" }}>Créé par {fullName(peopleById.get(p.created_by))}</span>
            )}
          </div>
        </section>

        <div className="projet-toolbar">
          <div className="chips" role="group" aria-label="Filtre">
            {FILTRES.map((f) => (
              <button key={f.v} className={`chip ${filtre === f.v ? "on" : ""}`} onClick={() => setFiltre(f.v)}>{f.label}</button>
            ))}
          </div>
          {!filtering && themes.length > 0 && (
            <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
              <button className="btn small ghost" onClick={expandAll}><IPlusBox width={18} />Tout déplier</button>
              <button className="btn small ghost" onClick={collapseAll}><IMinusBox width={18} />Tout replier</button>
            </div>
          )}
        </div>

        {themes.length === 0 ? (
          <div className="card">
            <Empty icon={<IFolder />}>Commencez par créer un thème, puis ajoutez-y des tâches.</Empty>
            <button className="btn primary block" onClick={() => setThemeSheet("new")}><IPlus width={20} />Créer un thème</button>
          </div>
        ) : themes.map((th) => {
          const tTheme = parents.filter((t) => t.theme_id === th.id);
          const all = taches.filter((t) => t.theme_id === th.id);
          const s = statsTaches(all);
          const collapsed = !filtering && collapsedThemes.has(th.id);
          const shown = tTheme.filter(visibleParent);
          if (filtering && shown.length === 0) return null;
          return (
            <section key={th.id} className="theme">
              <div className="theme-head">
                <button className="theme-toggle" aria-expanded={!collapsed} onClick={() => toggleTheme(th.id)}>
                  {collapsed ? <IPlusBox /> : <IMinusBox />}
                  <span className="theme-name">{th.nom}</span>
                </button>
                <span className="theme-count">{s.fermees}/{s.total}</span>
                <button className="icon-btn" aria-label={`Modifier le thème ${th.nom}`} onClick={() => setThemeSheet(th)}><IEdit width={20} /></button>
              </div>
              <div className="theme-progress"><Progress value={s.avancement} /></div>
              {th.description && !collapsed && <div className="theme-desc"><Linkify text={th.description} /></div>}
              {!collapsed && (
                <div className="theme-body">
                  {shown.length === 0 && <div className="muted small" style={{ padding: "6px 4px" }}>Aucune tâche dans ce thème.</div>}
                  {shown.map((t) => row(t, false))}
                  {!filtering && (
                    <button className="add-link" onClick={() => go({ v: "tache-form", projet: p.id, theme: th.id })}><IPlus width={18} />Ajouter une tâche</button>
                  )}
                </div>
              )}
            </section>
          );
        })}

        {themes.length > 0 && filtering && themes.every((th) => parents.filter((t) => t.theme_id === th.id).filter(visibleParent).length === 0) && (
          <Empty>Aucune tâche pour ce filtre.</Empty>
        )}

        {themes.length > 0 && (
          <button className="btn block" style={{ marginTop: 18 }} onClick={() => setThemeSheet("new")}><IPlus width={20} />Ajouter un thème</button>
        )}
      </main>
      {themes.length > 0 && <button className="fab" onClick={() => go({ v: "tache-form", projet: p.id })}><IPlus />Tâche</button>}

      {themeSheet && (
        <ThemeSheet projetId={p.id} theme={themeSheet === "new" ? null : themeSheet} ordre={themes.length}
          nbTaches={themeSheet === "new" ? 0 : taches.filter((t) => t.theme_id === themeSheet.id).length}
          onClose={() => setThemeSheet(null)} onDone={(m) => { setThemeSheet(null); toast(m); bump(); }} />
      )}
    </>
  );
}

function ThemeSheet({ projetId, theme, ordre, nbTaches, onClose, onDone }: {
  projetId: string; theme: Theme | null; ordre: number; nbTaches: number; onClose: () => void; onDone: (msg: string) => void;
}) {
  const [nom, setNom] = useState(theme?.nom ?? "");
  const [description, setDescription] = useState(theme?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet title={theme ? "Modifier le thème" : "Nouveau thème"} onClose={onClose}>
      <form className="stack-lg" onSubmit={async (e) => {
        e.preventDefault();
        if (!nom.trim()) return;
        const { error } = theme
          ? await supabase.from("projet_themes").update({ nom: nom.trim(), description: description.trim() || null }).eq("id", theme.id)
          : await supabase.from("projet_themes").insert({ projet_id: projetId, nom: nom.trim(), description: description.trim() || null, ordre });
        if (error) setError(errMsg(error)); else onDone(theme ? "Thème mis à jour" : "Thème créé");
      }}>
        <label className="field"><span>Nom du thème</span>
          <input className="input" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex. Travaux, Communication, Financement" autoFocus required />
        </label>
        <label className="field"><span>Description <span className="hint">(facultatif)</span></span>
          <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Périmètre du thème, attendus, liens utiles (https://…)" />
          <span className="hint">Les liens collés ici deviendront cliquables.</span>
        </label>
        <ErrorBox msg={error} />
        <button className="btn primary block">{theme ? "Enregistrer" : "Créer le thème"}</button>
        {theme && (
          <ConfirmButton label="Supprimer le thème" confirmLabel={nbTaches ? `Confirmer : ${nbTaches} tâche${nbTaches > 1 ? "s" : ""} supprimée${nbTaches > 1 ? "s" : ""}` : "Confirmer la suppression"}
            onConfirm={async () => {
              const { error } = await supabase.from("projet_themes").delete().eq("id", theme.id);
              if (error) setError(errMsg(error)); else onDone("Thème supprimé");
            }} />
        )}
      </form>
    </Sheet>
  );
}

// ---------- Fiche tâche ----------
export function TacheDetail({ id }: { id: string }) {
  const { me, go, back, toast, bump, dataVersion, peopleById } = useApp();
  const q = useQuery(async () => {
    const { data, error } = await supabase.from("projet_taches").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const t = data as Tache;
    const [p, th, parent, subs, com] = await Promise.all([
      supabase.from("projets").select("*").eq("id", t.projet_id).maybeSingle(),
      supabase.from("projet_themes").select("*").eq("id", t.theme_id).maybeSingle(),
      t.parent_id ? supabase.from("projet_taches").select("*").eq("id", t.parent_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      supabase.from("projet_taches").select("*").eq("parent_id", id).order("ordre").order("created_at"),
      supabase.from("projet_commentaires").select("*").eq("tache_id", id).order("created_at"),
    ]);
    return {
      t, projet: p.data as Projet | null, theme: th.data as Theme | null, parent: parent.data as Tache | null,
      subs: (subs.data ?? []) as Tache[], comments: (com.data ?? []) as Commentaire[],
    };
  }, [id, dataVersion]);
  const [texte, setTexte] = useState("");
  const [sending, setSending] = useState(false);

  if (q.loading && !q.data) return (<><Topbar title="Tâche" backTo /><Spinner /></>);
  if (!q.data) return (<><Topbar title="Tâche" backTo /><main className="content"><ErrorBox msg={q.error} /><Empty>Tâche introuvable ou non accessible.</Empty></main></>);
  const { t, projet, theme, parent, subs, comments } = q.data;
  const resp = t.responsable_id ? peopleById.get(t.responsable_id) : null;

  async function setStatut(s: Statut) {
    if (s === t.statut) return;
    const { error } = await supabase.from("projet_taches").update({ statut: s }).eq("id", t.id);
    if (error) toast(errMsg(error)); else { toast("Statut mis à jour"); bump(); }
  }

  async function sendComment(e: FormEvent) {
    e.preventDefault();
    if (!texte.trim()) return;
    setSending(true);
    const { error } = await supabase.from("projet_commentaires").insert({ tache_id: t.id, auteur_id: me.id, texte: texte.trim() });
    setSending(false);
    if (error) toast(errMsg(error)); else { setTexte(""); bump(); }
  }

  return (
    <>
      <Topbar title={t.parent_id ? "Sous-tâche" : "Tâche"} backTo right={
        <button className="icon-btn" aria-label="Modifier" onClick={() => go({ v: "tache-form", id: t.id })}><IEdit /></button>
      } />
      <main className="content">
        <nav className="crumbs small">
          {projet && <a href="#" onClick={(e) => { e.preventDefault(); go({ v: "projet", id: projet.id }); }}>{projet.nom}</a>}
          {theme && <> › <span>{theme.nom}</span></>}
          {parent && <> › <a href="#" onClick={(e) => { e.preventDefault(); go({ v: "tache", id: parent.id }); }}>{parent.titre}</a></>}
        </nav>
        <div className="detail-head">
          <div className="row wrap"><SanteBadge a={t} /></div>
          <h2>{t.titre}</h2>
        </div>

        <div className="card">
          <dl className="kv">
            <dt>Responsable</dt><dd className="row">{resp ? <><Avatar p={resp} sm /><span>{fullName(resp)}</span></> : <span className="muted">Non attribuée</span>}</dd>
            <dt>Échéance</dt><dd className={`s-${sante(t)}`} style={{ color: ["retard", "proche"].includes(sante(t)) ? "var(--fg)" : undefined }}>{echeanceText(t)}</dd>
            <dt>Thème</dt><dd>{theme?.nom}</dd>
          </dl>
          {t.description && (<><div className="section-title" style={{ marginTop: 16 }}>Description</div><div className="prose"><Linkify text={t.description} /></div></>)}
        </div>

        <div className="section-title">Statut</div>
        <div className="status-picker">
          {STATUTS.map((s) => (
            <button key={s.value} type="button" className={`s-${s.value} ${t.statut === s.value ? "on" : ""}`} aria-pressed={t.statut === s.value}
              onClick={() => setStatut(s.value)}>{s.label}</button>
          ))}
        </div>

        {!t.parent_id && (
          <>
            <div className="section-title">Sous-tâches ({subs.filter((x) => x.statut === "terminee").length}/{subs.length})</div>
            <div className="theme-body card" style={{ padding: 8 }}>
              {subs.length === 0 && <div className="muted small" style={{ padding: 6 }}>Aucune sous-tâche.</div>}
              {subs.map((x) => {
                const r = x.responsable_id ? peopleById.get(x.responsable_id) : null;
                return (
                  <div key={x.id} className={`task-row sub s-${sante(x)} ${isClosed(x.statut) ? "closed" : ""}`} role="button" tabIndex={0}
                    onClick={() => go({ v: "tache", id: x.id })}>
                    <QuickCheck t={x} onChanged={bump} />
                    <div className="task-main">
                      <div className="task-title">{x.titre}</div>
                      <div className="task-meta">
                        {r && <span className="row" style={{ gap: 5 }}><Avatar p={r} sm />{r.prenom}</span>}
                        {x.echeance && <span>{echeanceText(x)}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
              <button className="add-link" onClick={() => go({ v: "tache-form", projet: t.projet_id, parent: t.id })}><IPlus width={18} />Ajouter une sous-tâche</button>
            </div>
          </>
        )}

        <div className="section-title">Commentaires ({comments.length})</div>
        <div className="card stack">
          {comments.length === 0 && <div className="muted small">Aucun commentaire.</div>}
          <ul className="comments">
            {comments.map((c) => {
              const a = c.auteur_id ? peopleById.get(c.auteur_id) : null;
              return (
                <li key={c.id}>
                  <Avatar p={a} sm />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="tiny muted">{a ? fullName(a) : "Ancien membre"} · {fmtDateTime(c.created_at)}</div>
                    <div className="prose"><Linkify text={c.texte} /></div>
                  </div>
                  {(c.auteur_id === me.id || me.is_admin) && (
                    <button className="icon-btn" aria-label="Supprimer le commentaire" onClick={async () => {
                      if (!window.confirm("Supprimer ce commentaire ?")) return;
                      const { error } = await supabase.from("projet_commentaires").delete().eq("id", c.id);
                      if (error) toast(errMsg(error)); else bump();
                    }}><ITrash width={18} /></button>
                  )}
                </li>
              );
            })}
          </ul>
          <form className="comment-form" onSubmit={sendComment}>
            <textarea className="textarea" placeholder="Ajouter un commentaire" value={texte} onChange={(e) => setTexte(e.target.value)} style={{ minHeight: 70 }} />
            <button className="btn primary" disabled={sending || !texte.trim()}><IComment width={18} />{sending ? "Envoi…" : "Publier"}</button>
          </form>
        </div>

        <div style={{ marginTop: 28 }}>
          <ConfirmButton label={t.parent_id ? "Supprimer la sous-tâche" : "Supprimer la tâche"}
            confirmLabel={subs.length ? `Confirmer : tâche et ${subs.length} sous-tâche${subs.length > 1 ? "s" : ""} supprimées` : "Confirmer la suppression"}
            onConfirm={async () => {
              const { error } = await supabase.from("projet_taches").delete().eq("id", t.id);
              if (error) { toast(errMsg(error)); return; }
              toast("Tâche supprimée"); bump(); back({ v: "projet", id: t.projet_id });
            }} />
        </div>
      </main>
    </>
  );
}

// ---------- Formulaire tâche / sous-tâche ----------
export function TacheForm({ id, projet, theme, parent }: { id?: string; projet?: string; theme?: string; parent?: string }) {
  const { me } = useApp();
  const q = useQuery(async () => {
    const t = id ? ((await supabase.from("projet_taches").select("*").eq("id", id).maybeSingle()).data as Tache | null) : null;
    const pid = t?.projet_id ?? projet;
    if (!pid) return null;
    const [th, m, par] = await Promise.all([
      supabase.from("projet_themes").select("*").eq("projet_id", pid).order("ordre").order("created_at"),
      supabase.from("projet_membres").select("*").eq("projet_id", pid),
      (t?.parent_id ?? parent) ? supabase.from("projet_taches").select("*").eq("id", (t?.parent_id ?? parent)!).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    return { t, pid, themes: (th.data ?? []) as Theme[], membres: (m.data ?? []) as ProjetMembre[], parent: par.data as Tache | null };
  }, [id, projet, parent]);
  const title = id ? "Modifier" : parent ? "Nouvelle sous-tâche" : "Nouvelle tâche";
  if (q.loading && !q.data) return (<><Topbar title={title} backTo /><Spinner /></>);
  if (!q.data) return (<><Topbar title={title} backTo /><main className="content"><Empty>Projet introuvable.</Empty></main></>);
  return <TacheFormInner key={id ?? "new"} title={title} data={q.data} defaultTheme={theme} meId={me.id} />;
}

function TacheFormInner({ title, data, defaultTheme, meId }: {
  title: string; meId: string;
  data: { t: Tache | null; pid: string; themes: Theme[]; membres: ProjetMembre[]; parent: Tache | null };
  defaultTheme?: string;
}) {
  const { people, go, back, toast, bump } = useApp();
  const { t, pid, themes, membres, parent } = data;
  const [titre, setTitre] = useState(t?.titre ?? "");
  const [themeId, setThemeId] = useState(t?.theme_id ?? parent?.theme_id ?? defaultTheme ?? themes[0]?.id ?? "");
  const [responsable, setResponsable] = useState(t?.responsable_id ?? "");
  const [echeance, setEcheance] = useState(t?.echeance ?? "");
  const [statut, setStatut] = useState<Statut>(t?.statut ?? "a_faire");
  const [description, setDescription] = useState(t?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const memberIds = new Set(membres.map((m) => m.profile_id));
  const eligible = people.filter((p) => p.actif && (memberIds.has(p.id) || p.id === t?.responsable_id));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!titre.trim()) { setError("L'intitulé est obligatoire."); return; }
    if (!themeId) { setError("Choisissez un thème."); return; }
    setBusy(true); setError(null);
    const row = {
      titre: titre.trim(), theme_id: themeId, responsable_id: responsable || null, echeance: echeance || null,
      statut, description: description.trim() || null,
    };
    try {
      if (t) {
        const { error } = await supabase.from("projet_taches").update(row).eq("id", t.id);
        if (error) throw error;
        toast("Tâche mise à jour"); bump(); back();
      } else {
        const { error } = await supabase.from("projet_taches")
          .insert({ ...row, projet_id: pid, parent_id: parent?.id ?? null, created_by: meId });
        if (error) throw error;
        toast(parent ? "Sous-tâche créée" : "Tâche créée"); bump();
        go(parent ? { v: "tache", id: parent.id } : { v: "projet", id: pid }, true);
      }
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Topbar title={title} backTo />
      <main className="content">
        <form className="stack-lg" onSubmit={submit}>
          {parent && <div className="alert info small">Sous-tâche de « {parent.titre} ».</div>}
          <label className="field"><span>Intitulé</span>
            <input className="input" value={titre} onChange={(e) => setTitre(e.target.value)} required autoFocus={!t} />
          </label>
          {!parent && !t?.parent_id && (
            <label className="field"><span>Thème</span>
              <select className="select" value={themeId} onChange={(e) => setThemeId(e.target.value)} required>
                {themes.map((th) => <option key={th.id} value={th.id}>{th.nom}</option>)}
              </select>
            </label>
          )}
          <label className="field"><span>Responsable</span>
            <select className="select" value={responsable} onChange={(e) => setResponsable(e.target.value)}>
              <option value="">Non attribuée</option>
              {eligible.map((p) => <option key={p.id} value={p.id}>{fullName(p)}{p.fonction ? ` (${p.fonction})` : ""}</option>)}
            </select>
            {eligible.length === 0 && <span className="hint">Aucun membre dans ce projet : un admin peut en ajouter depuis la fiche du projet.</span>}
          </label>
          <label className="field"><span>Échéance</span>
            <input className="input" type="date" value={echeance} onChange={(e) => setEcheance(e.target.value)} />
          </label>
          <div className="field"><span>Statut</span>
            <div className="status-picker">
              {STATUTS.map((s) => (
                <button type="button" key={s.value} className={`s-${s.value} ${statut === s.value ? "on" : ""}`} onClick={() => setStatut(s.value)}>{s.label}</button>
              ))}
            </div>
          </div>
          <label className="field"><span>Description <span className="hint">(facultatif)</span></span>
            <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Détails, liens utiles (https://…)" />
            <span className="hint">Les liens collés ici deviendront cliquables.</span>
          </label>
          <ErrorBox msg={error} />
          <button className="btn primary block" disabled={busy}>{busy ? "Enregistrement…" : t ? "Enregistrer" : "Créer"}</button>
          <button type="button" className="btn ghost block" onClick={() => back()}>Annuler</button>
        </form>
      </main>
    </>
  );
}

// ---------- Formulaire projet (admins) ----------
export function ProjetForm({ id }: { id?: string }) {
  const { me } = useApp();
  const q = useQuery(async () => {
    if (!id) return { p: null as Projet | null, membres: [] as ProjetMembre[] };
    const [p, m] = await Promise.all([
      supabase.from("projets").select("*").eq("id", id).maybeSingle(),
      supabase.from("projet_membres").select("*").eq("projet_id", id),
    ]);
    return { p: p.data as Projet | null, membres: (m.data ?? []) as ProjetMembre[] };
  }, [id]);
  const title = id ? "Modifier le projet" : "Nouveau projet";
  if (q.loading && !q.data) return (<><Topbar title={title} backTo /><Spinner /></>);
  const allowed = id ? isGestionnaire(me, q.data?.p) : canCreerProjet(me);
  if (!allowed) return (<><Topbar title={title} backTo /><main className="content"><Empty>{id ? "Seuls le créateur du projet et les admins peuvent le modifier." : "Vous n'avez pas le droit de créer un projet."}</Empty></main></>);
  return <ProjetFormInner key={id ?? "new"} title={title} initial={q.data?.p ?? null} membresInit={(q.data?.membres ?? []).map((m) => m.profile_id)} />;
}

function ProjetFormInner({ title, initial, membresInit }: { title: string; initial: Projet | null; membresInit: string[] }) {
  const { me, people, go, back, toast, bump, refreshPeople } = useApp();
  const [nom, setNom] = useState(initial?.nom ?? "");
  const [objectif, setObjectif] = useState(initial?.objectif ?? "");
  const [statut, setStatut] = useState<ProjetStatut>(initial?.statut ?? "en_cours");
  const [debut, setDebut] = useState(initial?.date_debut ?? "");
  const [fin, setFin] = useState(initial?.date_fin ?? "");
  const [membres, setMembres] = useState<Set<string>>(new Set(initial ? membresInit : [me.id]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Un admin peut ajouter n'importe qui (le droit Projets est alors donné) ; un créateur choisit parmi les personnes qui ont déjà ce droit
  const actifs = people.filter((p) => p.actif && (me.is_admin || canProjets(p) || membresInit.includes(p.id)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!nom.trim()) { setError("Le nom est obligatoire."); return; }
    setBusy(true); setError(null);
    const row = { nom: nom.trim(), objectif: objectif.trim() || null, statut, date_debut: debut || null, date_fin: fin || null };
    try {
      let pid: string;
      if (initial) {
        const { error } = await supabase.from("projets").update(row).eq("id", initial.id);
        if (error) throw error;
        pid = initial.id;
      } else {
        const { data, error } = await supabase.from("projets").insert({ ...row, created_by: me.id }).select("id").single();
        if (error) throw error;
        pid = data.id;
      }
      // Membres : ajouts et retraits
      const before = new Set(membresInit);
      const toAdd = [...membres].filter((x) => !before.has(x));
      const toRemove = [...before].filter((x) => !membres.has(x));
      if (toAdd.length) {
        const { error } = await supabase.from("projet_membres").insert(toAdd.map((profile_id) => ({ projet_id: pid, profile_id })));
        if (error) throw error;
      }
      if (toRemove.length) {
        const { error } = await supabase.from("projet_membres").delete().eq("projet_id", pid).in("profile_id", toRemove);
        if (error) throw error;
      }
      // Donner le droit Projets aux membres qui ne l'ont pas encore
      const sansDroit = me.is_admin ? toAdd.map((x) => people.find((p) => p.id === x)).filter((p) => p && !canProjets(p)) as Profile[] : [];
      for (const p of sansDroit) await adminUsers({ action: "update", id: p.id, is_projets: true });
      if (sansDroit.length) await refreshPeople();
      toast(initial ? "Projet mis à jour" : "Projet créé"); bump();
      if (initial) back(); else go({ v: "projet", id: pid }, true);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Topbar title={title} backTo />
      <main className="content">
        <form className="stack-lg" onSubmit={submit}>
          <label className="field"><span>Nom du projet</span>
            <input className="input" value={nom} onChange={(e) => setNom(e.target.value)} required placeholder="Ex. Déménagement aux Minimes" />
          </label>
          <label className="field"><span>Objectif</span>
            <textarea className="textarea" value={objectif} onChange={(e) => setObjectif(e.target.value)} placeholder="Ce que le projet doit permettre d'atteindre" />
            <span className="hint">Vous pouvez coller des liens (https://… ou www.…) : ils deviendront cliquables.</span>
          </label>
          <div className="field"><span>Statut</span>
            <div className="status-picker">
              {PROJET_STATUTS.map((s) => (
                <button type="button" key={s.value} className={`${s.cls} ${statut === s.value ? "on" : ""}`} onClick={() => setStatut(s.value)}>{s.label}</button>
              ))}
            </div>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <label className="field" style={{ flex: 1 }}><span>Début</span><input className="input" type="date" value={debut} onChange={(e) => setDebut(e.target.value)} /></label>
            <label className="field" style={{ flex: 1 }}><span>Fin visée</span><input className="input" type="date" value={fin} onChange={(e) => setFin(e.target.value)} /></label>
          </div>
          <div className="field"><span>Personnes ayant accès <span className="hint">({membres.size})</span></span>
            <span className="hint">Seules ces personnes voient le projet. Les admins et le créateur du projet le voient toujours.{!me.is_admin && " Seules les personnes ayant l'accès Projets sont proposées."}</span>
            <div className="stack" style={{ gap: 6 }}>
              {actifs.map((p) => (
                <label key={p.id} className="check">
                  <input type="checkbox" checked={membres.has(p.id)} onChange={(e) => setMembres((s) => { const n = new Set(s); e.target.checked ? n.add(p.id) : n.delete(p.id); return n; })} />
                  <span>
                    <span className="t">{fullName(p)}</span>
                    {p.fonction && <span className="d"> · {p.fonction}</span>}
                    {!canProjets(p) && membres.has(p.id) && !membresInit.includes(p.id) && <><br /><span className="d">Le droit « Projets » lui sera donné.</span></>}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <ErrorBox msg={error} />
          <button className="btn primary block" disabled={busy}>{busy ? "Enregistrement…" : initial ? "Enregistrer" : "Créer le projet"}</button>
          <button type="button" className="btn ghost block" onClick={() => back()}>Annuler</button>
          {initial && (
            <ConfirmButton label="Supprimer le projet" confirmLabel="Confirmer : projet, thèmes, tâches et commentaires supprimés" onConfirm={async () => {
              const { error } = await supabase.from("projets").delete().eq("id", initial.id);
              if (error) { setError(errMsg(error)); return; }
              toast("Projet supprimé"); bump(); go({ v: "projets" }, true);
            }} />
          )}
        </form>
      </main>
    </>
  );
}
