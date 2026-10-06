import { useMemo, useState, type FormEvent } from "react";
import {
  supabase, type Action, type Avancement, type Instance, type Profile, type Reunion, type Statut,
  STATUTS, errMsg, fmtDate, fmtDateTime, fullName, instanceLabel, isClosed, sante, statutLabel, echeanceText,
} from "../lib";
import { useApp, useQuery } from "../store";
import {
  ActionCard, Avatar, ConfirmButton, Empty, ErrorBox, InstanceBadge, SanteBadge, Spinner, StatutBadge, Topbar,
} from "../components/ui";
import { IEdit, IList, IPlus } from "../components/Icons";
import { sortActions } from "./Dashboard";

const FILTERS: { v: string; label: string; test: (a: Action) => boolean }[] = [
  { v: "ouvertes", label: "Ouvertes", test: (a) => !isClosed(a.statut) },
  { v: "retard", label: "En retard", test: (a) => sante(a) === "retard" },
  { v: "proche", label: "Échéance proche", test: (a) => sante(a) === "proche" },
  { v: "bloquee", label: "Bloquées", test: (a) => !isClosed(a.statut) && a.statut === "bloquee" },
  { v: "terminees", label: "Terminées", test: (a) => isClosed(a.statut) },
  { v: "toutes", label: "Toutes", test: () => true },
];

const canSeeInstance = (p: Profile, i: Instance) => p.is_admin || (i === "bureau" ? p.is_bureau : p.is_ca);

export function ActionsList() {
  const { me, route, go, instances, people, peopleById, dataVersion } = useApp();
  const f = route.f || "ouvertes";
  const inst = (route.i as Instance | undefined) ?? "";
  const resp = route.resp || "";
  const grouped = route.g === "1";
  const [search, setSearch] = useState("");

  const q = useQuery(async () => {
    const { data, error } = await supabase.from("actions").select("*");
    if (error) throw error;
    return data as Action[];
  }, [dataVersion]);

  const set = (patch: Record<string, string>) => go({ ...route, ...patch }, true);

  const base = (q.data ?? []).filter((a) =>
    (!inst || a.instance === inst)
    && (!resp || (resp === "me" ? a.responsable_id === me.id : a.responsable_id === resp))
    && (!search || `${a.titre} ${a.description ?? ""} ${a.perimetre ?? ""}`.toLowerCase().includes(search.toLowerCase())));
  const filter = FILTERS.find((x) => x.v === f) ?? FILTERS[0];
  const list = sortActions(base.filter(filter.test));

  const groups = useMemo(() => {
    if (!grouped) return [];
    const m = new Map<string, Action[]>();
    for (const a of list) {
      const k = a.responsable_id ?? "";
      m.set(k, [...(m.get(k) ?? []), a]);
    }
    return [...m.entries()].sort(([a], [b]) => fullName(peopleById.get(a)).localeCompare(fullName(peopleById.get(b))));
  }, [grouped, list, peopleById]);

  const respOptions = people.filter((p) => (q.data ?? []).some((a) => a.responsable_id === p.id));

  return (
    <>
      <Topbar title="Actions" />
      <main className="content">
        <div className="stack">
          <input className="search" type="search" placeholder="Rechercher une action" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Rechercher" />
          {instances.length > 1 && (
            <div className="segmented" role="group" aria-label="Instance">
              <button className={!inst ? "on" : ""} onClick={() => set({ i: "" })}>Toutes</button>
              <button className={inst === "bureau" ? "on" : ""} onClick={() => set({ i: "bureau" })}>Conseil scolaire</button>
              <button className={inst === "ca" ? "on" : ""} onClick={() => set({ i: "ca" })}>CA</button>
            </div>
          )}
          <div className="chips" role="group" aria-label="Filtre">
            {FILTERS.map((x) => (
              <button key={x.v} className={`chip ${f === x.v ? "on" : ""}`} onClick={() => set({ f: x.v })}>
                {x.label}<span className="count">{base.filter(x.test).length}</span>
              </button>
            ))}
          </div>
          <div className="row">
            <select className="select" style={{ flex: 1 }} value={resp} onChange={(e) => set({ resp: e.target.value })} aria-label="Responsable">
              <option value="">Tous les responsables</option>
              <option value="me">Mes actions</option>
              {respOptions.filter((p) => p.id !== me.id).map((p) => <option key={p.id} value={p.id}>{fullName(p)}</option>)}
            </select>
            <button className={`chip ${grouped ? "on" : ""}`} style={{ minHeight: 48 }} onClick={() => set({ g: grouped ? "" : "1" })}>
              Par responsable
            </button>
          </div>
        </div>

        <ErrorBox msg={q.error} />
        {q.loading && !q.data ? <Spinner /> : list.length === 0 ? (
          <Empty icon={<IList />}>Aucune action pour ces critères.</Empty>
        ) : grouped ? (
          groups.map(([k, items]) => {
            const p = peopleById.get(k);
            return (
              <section key={k || "none"}>
                <div className="group-head">
                  <Avatar p={p} />
                  <div>
                    <div className="name">{fullName(p)}</div>
                    <div className="tiny muted">
                      {items.length} action{items.length > 1 ? "s" : ""}
                      {items.some((a) => sante(a) === "retard") && ` · ${items.filter((a) => sante(a) === "retard").length} en retard`}
                    </div>
                  </div>
                </div>
                <div className="stack">{items.map((a) => <ActionCard key={a.id} a={a} />)}</div>
              </section>
            );
          })
        ) : (
          <div className="stack" style={{ marginTop: 12 }}>
            {list.map((a) => <ActionCard key={a.id} a={a} showInstance={instances.length > 1} />)}
          </div>
        )}
      </main>
      {me.is_admin && (
        <button className="fab" onClick={() => go({ v: "action-form", instance: inst || undefined })}><IPlus />Action</button>
      )}
    </>
  );
}

export function ActionDetail({ id }: { id: string }) {
  const { me, go, back, peopleById, toast, bump, dataVersion } = useApp();
  const q = useQuery(async () => {
    const { data, error } = await supabase.from("actions").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const a = data as Action;
    const [av, r] = await Promise.all([
      supabase.from("avancements").select("*").eq("action_id", id).order("created_at", { ascending: false }),
      a.reunion_id ? supabase.from("reunions").select("*").eq("id", a.reunion_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    return { a, av: (av.data as Avancement[]) ?? [], reunion: (r.data as Reunion | null) };
  }, [id, dataVersion]);

  const [statut, setStatut] = useState<Statut | null>(null);
  const [texte, setTexte] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (q.loading && !q.data) return (<><Topbar title="Action" backTo /><Spinner /></>);
  if (!q.data) return (<><Topbar title="Action" backTo /><main className="content"><ErrorBox msg={q.error} /><Empty>Action introuvable ou non accessible.</Empty></main></>);

  const { a, av, reunion } = q.data;
  const resp = a.responsable_id ? peopleById.get(a.responsable_id) : null;
  const canUpdate = me.is_admin || a.responsable_id === me.id;
  const chosen = statut ?? a.statut;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (chosen === a.statut && !texte.trim()) { setError("Changez le statut ou ajoutez un commentaire."); return; }
    setBusy(true); setError(null);
    const { error } = await supabase.rpc("update_action_avancement", {
      p_action_id: a.id, p_statut: chosen === a.statut ? null : chosen, p_texte: texte.trim() || null,
    });
    setBusy(false);
    if (error) { setError(errMsg(error)); return; }
    setTexte(""); setStatut(null);
    toast("Avancement enregistré");
    bump();
  }

  return (
    <>
      <Topbar title="Action" backTo right={me.is_admin && (
        <button className="icon-btn" aria-label="Modifier" onClick={() => go({ v: "action-form", id: a.id })}><IEdit /></button>
      )} />
      <main className="content">
        <div className="detail-head">
          <div className="row wrap"><SanteBadge a={a} /><InstanceBadge i={a.instance} /></div>
          <h2>{a.titre}</h2>
        </div>
        <div className="card">
          <dl className="kv">
            <dt>Responsable</dt><dd className="row"><Avatar p={resp} sm />{fullName(resp)}</dd>
            <dt>Statut</dt><dd><StatutBadge s={a.statut} /></dd>
            <dt>Échéance</dt><dd className={`s-${sante(a)}`} style={{ color: ["retard", "proche"].includes(sante(a)) ? "var(--fg)" : undefined }}>{echeanceText(a)}</dd>
            {a.perimetre && (<><dt>Périmètre</dt><dd>{a.perimetre}</dd></>)}
            <dt>Section</dt><dd>{instanceLabel(a.instance)}</dd>
            {reunion && (<><dt>Décidée lors</dt><dd><a href="#" onClick={(e) => { e.preventDefault(); go({ v: "reunion", id: reunion.id }); }}>{reunion.titre}</a><div className="tiny muted">{fmtDate(reunion.date_reunion)}</div></dd></>)}
          </dl>
          {a.description && (<><div className="section-title" style={{ marginTop: 16 }}>Description</div><div className="prose">{a.description}</div></>)}
        </div>

        {canUpdate && (
          <>
            <div className="section-title">Mettre à jour</div>
            <form className="card stack" onSubmit={save}>
              <div className="status-picker" role="group" aria-label="Statut">
                {STATUTS.map((s) => (
                  <button type="button" key={s.value} className={`s-${s.value} ${chosen === s.value ? "on" : ""}`}
                    aria-pressed={chosen === s.value} onClick={() => setStatut(s.value)}>{s.label}</button>
                ))}
              </div>
              <textarea className="textarea" placeholder="Point d'avancement (facultatif)" value={texte} onChange={(e) => setTexte(e.target.value)} style={{ minHeight: 90 }} />
              <ErrorBox msg={error} />
              <button className="btn primary block" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer"}</button>
            </form>
          </>
        )}

        <div className="section-title">Historique</div>
        <div className="card">
          {av.length === 0 ? <div className="muted small">Aucun point d'avancement pour l'instant.</div> : (
            <ul className="timeline">
              {av.map((x) => {
                const auteur = x.auteur_id ? peopleById.get(x.auteur_id) : null;
                return (
                  <li key={x.id}>
                    <div className="tiny muted">{fmtDateTime(x.created_at)} · {fullName(auteur)}</div>
                    {x.nouveau_statut && (
                      <div className="small" style={{ margin: "4px 0" }}>
                        {x.ancien_statut ? statutLabel(x.ancien_statut) : ""} → <strong>{statutLabel(x.nouveau_statut)}</strong>
                      </div>
                    )}
                    {x.texte !== "Changement de statut" && <div className="prose">{x.texte}</div>}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="tiny muted" style={{ marginTop: 6 }}>Créée le {fmtDate(a.created_at)}</div>
        </div>

        {me.is_admin && (
          <div style={{ marginTop: 24 }}>
            <ConfirmButton label="Supprimer l'action" confirmLabel="Confirmer la suppression" onConfirm={async () => {
              const { error } = await supabase.from("actions").delete().eq("id", a.id);
              if (error) { toast(errMsg(error)); return; }
              toast("Action supprimée"); bump(); back({ v: "actions" });
            }} />
          </div>
        )}
      </main>
    </>
  );
}

export function ActionForm({ id, reunionId, instance }: { id?: string; reunionId?: string; instance?: string }) {
  const { me, people, go, back, toast, bump, instances } = useApp();
  const q = useQuery(async () => {
    const [a, r, p] = await Promise.all([
      id ? supabase.from("actions").select("*").eq("id", id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      supabase.from("reunions").select("*").order("date_reunion", { ascending: false }).limit(60),
      supabase.from("actions").select("perimetre").not("perimetre", "is", null),
    ]);
    const perims = [...new Set(((p.data ?? []) as { perimetre: string }[]).map((x) => x.perimetre).filter(Boolean))].sort();
    return { a: a.data as Action | null, reunions: (r.data as Reunion[]) ?? [], perims };
  }, [id]);

  if (!me.is_admin) return (<><Topbar title="Action" backTo /><main className="content"><Empty>Réservé aux admins.</Empty></main></>);
  if (q.loading && !q.data) return (<><Topbar title={id ? "Modifier l'action" : "Nouvelle action"} backTo /><Spinner /></>);
  return <ActionFormInner key={q.data?.a?.id ?? "new"} initial={q.data?.a ?? null} reunions={q.data?.reunions ?? []} perims={q.data?.perims ?? []}
    defaultReunion={reunionId} defaultInstance={(instance as Instance) || instances[instances.length - 1]}
    people={people} onSaved={(newId, isNew) => { toast(isNew ? "Action créée" : "Action mise à jour"); bump(); if (isNew) go({ v: "action", id: newId }, true); else back(); }}
    onCancel={() => back()} />;
}

function ActionFormInner({ initial, reunions, perims, defaultReunion, defaultInstance, people, onSaved, onCancel }: {
  initial: Action | null; reunions: Reunion[]; perims: string[]; defaultReunion?: string; defaultInstance: Instance;
  people: Profile[]; onSaved: (id: string, isNew: boolean) => void; onCancel: () => void;
}) {
  const { me } = useApp();
  const [titre, setTitre] = useState(initial?.titre ?? "");
  const [inst, setInst] = useState<Instance>(initial?.instance ?? defaultInstance ?? "ca");
  const [reunion, setReunion] = useState(initial?.reunion_id ?? defaultReunion ?? "");
  const [responsable, setResponsable] = useState(initial?.responsable_id ?? "");
  const [perimetre, setPerimetre] = useState(initial?.perimetre ?? "");
  const [echeance, setEcheance] = useState(initial?.echeance ?? "");
  const [statut, setStatut] = useState<Statut>(initial?.statut ?? "a_faire");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eligible = people.filter((p) => p.actif && canSeeInstance(p, inst));
  const reunionsInst = reunions;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!titre.trim()) { setError("Le titre est obligatoire."); return; }
    if (!responsable) { setError("Choisissez un responsable."); return; }
    setBusy(true); setError(null);
    const row = {
      titre: titre.trim(), instance: inst, reunion_id: reunion || null, responsable_id: responsable,
      perimetre: perimetre.trim() || null, echeance: echeance || null, statut, description: description.trim() || null,
    };
    try {
      if (initial) {
        const { error } = await supabase.from("actions").update(row).eq("id", initial.id);
        if (error) throw error;
        if (statut !== initial.statut) {
          await supabase.from("avancements").insert({ action_id: initial.id, auteur_id: me.id, texte: "Changement de statut", ancien_statut: initial.statut, nouveau_statut: statut });
        }
        onSaved(initial.id, false);
      } else {
        const { data, error } = await supabase.from("actions").insert({ ...row, created_by: me.id }).select("id").single();
        if (error) throw error;
        onSaved(data.id, true);
      }
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Topbar title={initial ? "Modifier l'action" : "Nouvelle action"} backTo />
      <main className="content">
        <form className="stack-lg" onSubmit={submit}>
          <label className="field"><span>Intitulé</span>
            <input className="input" value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Ex. Relancer le devis toiture" required />
          </label>
          <div className="field"><span>Section</span>
            <div className="segmented">
              <button type="button" className={inst === "bureau" ? "on" : ""} onClick={() => { setInst("bureau"); setReunion(""); }}>Conseil scolaire</button>
              <button type="button" className={inst === "ca" ? "on" : ""} onClick={() => { setInst("ca"); setReunion(""); }}>Conseil d'administration</button>
            </div>
            <span className="hint">Détermine qui peut voir l'action.</span>
          </div>
          <label className="field"><span>Responsable</span>
            <select className="select" value={responsable} onChange={(e) => setResponsable(e.target.value)} required>
              <option value="">Choisir…</option>
              {eligible.map((p) => <option key={p.id} value={p.id}>{fullName(p)}</option>)}
            </select>
          </label>
          <label className="field"><span>Échéance</span>
            <input className="input" type="date" value={echeance} onChange={(e) => setEcheance(e.target.value)} />
          </label>
          <label className="field"><span>Périmètre <span className="hint">(facultatif)</span></span>
            <input className="input" list="perims" value={perimetre} onChange={(e) => setPerimetre(e.target.value)} placeholder="Ex. Travaux, Finances, Pédagogie" />
            <datalist id="perims">{perims.map((p) => <option key={p} value={p} />)}</datalist>
          </label>
          <label className="field"><span>Réunion d'origine <span className="hint">(facultatif)</span></span>
            <select className="select" value={reunion} onChange={(e) => setReunion(e.target.value)}>
              <option value="">Aucune</option>
              {reunionsInst.map((r) => <option key={r.id} value={r.id}>{fmtDate(r.date_reunion)} · {r.titre}</option>)}
            </select>
          </label>
          {initial && (
            <div className="field"><span>Statut</span>
              <div className="status-picker">
                {STATUTS.map((s) => (
                  <button type="button" key={s.value} className={`s-${s.value} ${statut === s.value ? "on" : ""}`} onClick={() => setStatut(s.value)}>{s.label}</button>
                ))}
              </div>
            </div>
          )}
          <label className="field"><span>Description <span className="hint">(facultatif)</span></span>
            <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <ErrorBox msg={error} />
          <button className="btn primary block" disabled={busy}>{busy ? "Enregistrement…" : initial ? "Enregistrer" : "Créer l'action"}</button>
          <button type="button" className="btn ghost block" onClick={onCancel}>Annuler</button>
        </form>
      </main>
    </>
  );
}
