import { supabase, type Action, type AdminDoc, type Association, type Reunion, canAssociations, etatDoc, sante, isClosed, fmtDate, instanceLabel, SANTE_LABEL, type Sante } from "../lib";
import { useApp, useQuery } from "../store";
import { ActionCard, Empty, ErrorBox, InstanceBadge, Logo, Spinner, Topbar } from "../components/ui";
import { IChevron, ICheck } from "../components/Icons";
import { DocCard, sortDocs } from "./Associations";

export function sortActions(list: Action[]): Action[] {
  const rank: Record<Sante, number> = { retard: 0, bloquee: 1, proche: 2, en_cours: 3, a_faire: 4, terminee: 5, abandonnee: 6 };
  return [...list].sort((a, b) => {
    const r = rank[sante(a)] - rank[sante(b)];
    if (r) return r;
    if (a.echeance && b.echeance) return a.echeance.localeCompare(b.echeance);
    if (a.echeance) return -1;
    if (b.echeance) return 1;
    return b.created_at.localeCompare(a.created_at);
  });
}

export function Dashboard() {
  const { me, go, instances, dataVersion } = useApp();
  const q = useQuery(async () => {
    const [a, r, d, as] = await Promise.all([
      supabase.from("actions").select("*"),
      supabase.from("reunions").select("*").order("date_reunion", { ascending: false }).limit(20),
      canAssociations(me) ? supabase.from("admin_documents").select("*").eq("archive", false) : Promise.resolve({ data: [], error: null }),
      canAssociations(me) ? supabase.from("associations").select("*") : Promise.resolve({ data: [], error: null }),
    ]);
    if (a.error) throw a.error;
    if (r.error) throw r.error;
    return { actions: a.data as Action[], reunions: r.data as Reunion[], docs: (d.data ?? []) as AdminDoc[], assocs: (as.data ?? []) as Association[] };
  }, [dataVersion]);

  const actions = q.data?.actions ?? [];
  const open = actions.filter((a) => !isClosed(a.statut));
  const count = (s: Sante) => open.filter((a) => sante(a) === s).length;
  const mine = sortActions(open.filter((a) => a.responsable_id === me.id));
  const kpis: { s: Sante; filter: string }[] = [
    { s: "retard", filter: "retard" },
    { s: "proche", filter: "proche" },
    { s: "bloquee", filter: "bloquee" },
    { s: "en_cours", filter: "ouvertes" },
  ];

  const lastReunions = (q.data?.reunions ?? []).slice(0, 3);

  return (
    <>
      <Topbar title="Accueil" right={<Logo className="logo-chip" />} />
      <main className="content">
        <div className="hello">Bonjour {me.prenom}</div>
        <p className="muted small" style={{ marginTop: 0 }}>
          {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
        </p>
        <ErrorBox msg={q.error} />
        {q.loading && !q.data ? <Spinner /> : (
          <>
            <div className="kpis">
              {kpis.map(({ s, filter }) => (
                <button key={s} className={`kpi s-${s}`} onClick={() => go({ v: "actions", f: filter })}>
                  <span className="n">{s === "en_cours" ? open.length : count(s)}</span>
                  <span className="l">{s === "en_cours" ? "Actions ouvertes" : SANTE_LABEL[s]}</span>
                </button>
              ))}
            </div>

            <div className="section-title">Mes actions en cours</div>
            {mine.length === 0 ? (
              <div className="card"><Empty icon={<ICheck />}>Aucune action ouverte à votre nom.</Empty></div>
            ) : (
              <div className="stack">
                {mine.slice(0, 6).map((a) => <ActionCard key={a.id} a={a} />)}
                {mine.length > 6 && (
                  <button className="btn block" onClick={() => go({ v: "actions", f: "ouvertes", resp: "me" })}>
                    Voir mes {mine.length} actions
                  </button>
                )}
              </div>
            )}

            {canAssociations(me) && (() => {
              const alerts = sortDocs((q.data?.docs ?? []).filter((d) => ["expire", "a_renouveler"].includes(etatDoc(d))));
              const short = (id: string) => q.data?.assocs.find((x) => x.id === id)?.code === "college" ? "Collège" : "Primaire";
              return (
                <>
                  <div className="section-title">Documents à renouveler</div>
                  {alerts.length === 0 ? (
                    <div className="card"><Empty icon={<ICheck />}>Aucun document expiré ou à renouveler.</Empty></div>
                  ) : (
                    <div className="stack">
                      {alerts.slice(0, 5).map((d) => <DocCard key={d.id} d={d} assoc={short(d.association_id)} />)}
                      {alerts.length > 5 && <button className="btn block" onClick={() => go({ v: "associations", f: "alertes" })}>Voir les {alerts.length} documents</button>}
                    </div>
                  )}
                </>
              );
            })()}

            <div className="section-title">Dernières réunions</div>
            <div className="stack">
              {lastReunions.length === 0 && <div className="card muted small">Aucune réunion enregistrée.</div>}
              {lastReunions.map((r) => (
                <button key={r.id} className="list-item" onClick={() => go({ v: "reunion", id: r.id })}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="muted small" style={{ marginBottom: 2 }}>{fmtDate(r.date_reunion)}</div>
                    <div style={{ fontWeight: 600 }}>{r.titre}</div>
                  </div>
                  <IChevron width={20} className="muted" />
                </button>
              ))}
            </div>

            <div className="section-title">Codes couleur</div>
            <div className="card legend">
              {(["retard", "proche", "bloquee", "en_cours", "a_faire", "terminee"] as Sante[]).map((s) => (
                <span key={s} className={`badge s-${s}`}><span className="dot" />{SANTE_LABEL[s]}</span>
              ))}
              <p className="tiny muted" style={{ margin: "6px 0 0", width: "100%" }}>
                « Échéance proche » signale une action ouverte dont l'échéance tombe dans les 7 jours.
              </p>
            </div>
            {instances.length === 1 && (
              <p className="tiny muted" style={{ marginTop: 16 }}>Vous voyez les informations : {instanceLabel(instances[0])}.</p>
            )}
          </>
        )}
      </main>
    </>
  );
}
