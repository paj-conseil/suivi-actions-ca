import { useMemo, useState, type FormEvent } from "react";
import {
  supabase, type AdminDoc, type AdminFile, type Association, type EtatDoc, CATEGORIES, ETAT_CLASS, ETAT_LABEL, LISTE_TYPE,
  addYears, canAssociations, errMsg, etatDoc, fmtDate, fmtSize, fullName, todayISO, validiteText,
} from "../lib";
import { useApp, useQuery } from "../store";
import { Avatar, ConfirmButton, DropZone, Empty, ErrorBox, Sheet, Spinner, Topbar } from "../components/ui";
import { IClock, IEdit, IFile, IPlus, ITrash } from "../components/Icons";
import { safeName } from "./Reunions";

const BUCKET = "documents-associations";

export function EtatBadge({ d }: { d: Parameters<typeof etatDoc>[0] }) {
  const e = etatDoc(d);
  return <span className={`badge ${ETAT_CLASS[e]}`}><span className="dot" />{ETAT_LABEL[e]}</span>;
}

const RANK: Record<EtatDoc, number> = { expire: 0, a_renouveler: 1, a_renseigner: 2, valide: 3, permanent: 4, archive: 5 };
export function sortDocs(list: AdminDoc[]) {
  return [...list].sort((a, b) => {
    const r = RANK[etatDoc(a)] - RANK[etatDoc(b)];
    if (r) return r;
    if (a.date_validite && b.date_validite) return a.date_validite.localeCompare(b.date_validite);
    return a.titre.localeCompare(b.titre, "fr");
  });
}

export function DocCard({ d, assoc }: { d: AdminDoc; assoc?: string }) {
  const { go, peopleById } = useApp();
  const resp = d.responsable_id ? peopleById.get(d.responsable_id) : null;
  return (
    <button className={`action-card ${ETAT_CLASS[etatDoc(d)]} ${d.archive ? "closed" : ""}`} onClick={() => go({ v: "doc", id: d.id })}>
      <div className="title">{d.titre}</div>
      <div className="meta">
        <EtatBadge d={d} />
        {assoc && <span className="badge">{assoc}</span>}
        <span className="row" style={{ gap: 4 }}><IClock width={15} height={15} />{validiteText(d)}</span>
        {d.date_signature && <span>Signé le {fmtDate(d.date_signature)}</span>}
        {resp && <span className="row" style={{ gap: 6 }}><Avatar p={resp} sm />{fullName(resp)}</span>}
      </div>
    </button>
  );
}

const FILTERS: { v: string; label: string; test: (d: AdminDoc) => boolean }[] = [
  { v: "actifs", label: "Tous", test: (d) => !d.archive },
  { v: "alertes", label: "À traiter", test: (d) => ["expire", "a_renouveler"].includes(etatDoc(d)) },
  { v: "expire", label: "Expirés", test: (d) => etatDoc(d) === "expire" },
  { v: "a_renouveler", label: "À renouveler", test: (d) => etatDoc(d) === "a_renouveler" },
  { v: "a_renseigner", label: "À renseigner", test: (d) => etatDoc(d) === "a_renseigner" },
  { v: "valide", label: "Valides", test: (d) => ["valide", "permanent"].includes(etatDoc(d)) },
  { v: "archives", label: "Anciennes versions", test: (d) => d.archive },
];

export function AssociationsPage() {
  const { me, route, go, toast, bump, dataVersion } = useApp();
  const [search, setSearch] = useState("");
  const [renaming, setRenaming] = useState<Association | null>(null);
  const [adding, setAdding] = useState(false);

  const q = useQuery(async () => {
    const [a, d] = await Promise.all([
      supabase.from("associations").select("*").order("ordre"),
      supabase.from("admin_documents").select("*"),
    ]);
    if (a.error) throw a.error;
    if (d.error) throw d.error;
    return { assocs: a.data as Association[], docs: d.data as AdminDoc[] };
  }, [dataVersion]);

  const assocs = q.data?.assocs ?? [];
  const current = assocs.find((x) => x.code === route.a) ?? assocs[0];
  const f = route.f || "actifs";
  const filter = FILTERS.find((x) => x.v === f) ?? FILTERS[0];
  const ofAssoc = (q.data?.docs ?? []).filter((d) => d.association_id === current?.id
    && (!search || `${d.titre} ${d.categorie} ${d.notes ?? ""}`.toLowerCase().includes(search.toLowerCase())));
  const list = sortDocs(ofAssoc.filter(filter.test));

  const byCat = useMemo(() => {
    const m = new Map<string, AdminDoc[]>();
    for (const d of list) m.set(d.categorie, [...(m.get(d.categorie) ?? []), d]);
    const order = (c: string) => { const i = CATEGORIES.indexOf(c); return i < 0 ? 99 : i; };
    return [...m.entries()].sort(([a], [b]) => order(a) - order(b) || a.localeCompare(b, "fr"));
  }, [list]);

  const active = ofAssoc.filter((d) => !d.archive);
  const count = (e: EtatDoc) => active.filter((d) => etatDoc(d) === e).length;

  if (!canAssociations(me)) return (<><Topbar title="Associations" /><main className="content"><Empty>Cette section nécessite le droit d'accès « Associations ».</Empty></main></>);

  async function addTemplate() {
    if (!current) return;
    const existing = new Set(ofAssoc.map((d) => d.titre.toLowerCase()));
    const rows = LISTE_TYPE.filter((t) => !existing.has(t.titre.toLowerCase()))
      .map((t) => ({ ...t, association_id: current.id, created_by: me.id }));
    if (!rows.length) { toast("La liste type est déjà présente"); setAdding(false); return; }
    const { error } = await supabase.from("admin_documents").insert(rows);
    if (error) { toast(errMsg(error)); return; }
    toast(`${rows.length} documents ajoutés à compléter`);
    setAdding(false); bump(); go({ ...route, a: current.code, f: "a_renseigner" }, true);
  }

  return (
    <>
      <Topbar title="Associations" />
      <main className="content">
        <ErrorBox msg={q.error} />
        {q.loading && !q.data ? <Spinner /> : !current ? <Empty>Aucune association.</Empty> : (
          <>
            <div className="segmented" role="group" aria-label="Association">
              {assocs.map((a) => (
                <button key={a.id} className={a.id === current.id ? "on" : ""} onClick={() => go({ v: "associations", a: a.code, f }, true)}>
                  {a.code === "primaire" ? "Primaire" : "Collège"}
                </button>
              ))}
            </div>

            <div className="row" style={{ margin: "14px 2px 4px" }}>
              <h2 style={{ fontSize: 19, margin: 0, flex: 1, color: "var(--primary)" }}>{current.nom}</h2>
              {me.is_admin && <button className="icon-btn" aria-label="Renommer l'association" onClick={() => setRenaming(current)}><IEdit /></button>}
            </div>

            <div className="kpis" style={{ marginTop: 8 }}>
              {(["expire", "a_renouveler", "a_renseigner", "valide"] as EtatDoc[]).map((e) => (
                <button key={e} className={`kpi ${ETAT_CLASS[e]}`} onClick={() => go({ v: "associations", a: current.code, f: e }, true)}>
                  <span className="n">{e === "valide" ? count("valide") + count("permanent") : count(e)}</span>
                  <span className="l">{e === "valide" ? "Valides" : ETAT_LABEL[e]}</span>
                </button>
              ))}
            </div>

            <div className="stack" style={{ marginTop: 14 }}>
              <input className="search" type="search" placeholder="Rechercher un document" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Rechercher" />
              <div className="chips" role="group" aria-label="Filtre">
                {FILTERS.map((x) => (
                  <button key={x.v} className={`chip ${f === x.v ? "on" : ""}`} onClick={() => go({ v: "associations", a: current.code, f: x.v }, true)}>
                    {x.label}<span className="count">{ofAssoc.filter(x.test).length}</span>
                  </button>
                ))}
              </div>
            </div>

            {list.length === 0 ? (
              <div className="card" style={{ marginTop: 12 }}>
                <Empty icon={<IFile />}>
                  {active.length === 0 ? "Aucun document enregistré pour cette association." : "Aucun document pour ce filtre."}
                </Empty>
                {active.length === 0 && (
                  <button className="btn block" onClick={() => setAdding(true)}>Partir d'une liste type</button>
                )}
              </div>
            ) : byCat.map(([cat, docs]) => (
              <section key={cat}>
                <div className="section-title">{cat}</div>
                <div className="stack">{docs.map((d) => <DocCard key={d.id} d={d} />)}</div>
              </section>
            ))}

            {active.length > 0 && (
              <button className="btn ghost block" style={{ marginTop: 18 }} onClick={() => setAdding(true)}>Compléter avec la liste type</button>
            )}
          </>
        )}
      </main>
      {current && (
        <button className="fab" onClick={() => go({ v: "doc-form", assoc: current.id })}><IPlus />Document</button>
      )}

      {adding && current && (
        <Sheet title="Liste type de documents" onClose={() => setAdding(false)}>
          <div className="stack-lg">
            <div className="small">
              Ajoute {LISTE_TYPE.length} documents courants pour une association gestionnaire d'établissement, sans dates, à compléter ensuite.
              <br />Les documents déjà présents ne sont pas dupliqués.
              <br />Cette liste est un point de départ : faites-la valider par le bureau de chaque association et votre expert-comptable.
            </div>
            <ul className="small" style={{ margin: 0, paddingLeft: 18, maxHeight: 240, overflow: "auto" }}>
              {LISTE_TYPE.map((t) => <li key={t.titre}>{t.titre}</li>)}
            </ul>
            <button className="btn primary block" onClick={addTemplate}>Ajouter à {current.nom}</button>
            <button className="btn ghost block" onClick={() => setAdding(false)}>Annuler</button>
          </div>
        </Sheet>
      )}
      {renaming && (
        <RenameSheet a={renaming} onClose={() => setRenaming(null)} onDone={() => { setRenaming(null); bump(); toast("Association mise à jour"); }} />
      )}
    </>
  );
}

function RenameSheet({ a, onClose, onDone }: { a: Association; onClose: () => void; onDone: () => void }) {
  const [nom, setNom] = useState(a.nom);
  const [notes, setNotes] = useState(a.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet title="Association" onClose={onClose}>
      <form className="stack-lg" onSubmit={async (e) => {
        e.preventDefault();
        const { error } = await supabase.from("associations").update({ nom: nom.trim(), notes: notes.trim() || null }).eq("id", a.id);
        if (error) setError(errMsg(error)); else onDone();
      }}>
        <label className="field"><span>Nom officiel</span><input className="input" value={nom} onChange={(e) => setNom(e.target.value)} required /></label>
        <label className="field"><span>Notes <span className="hint">(SIREN, adresse du siège…)</span></span><textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <ErrorBox msg={error} />
        <button className="btn primary block">Enregistrer</button>
      </form>
    </Sheet>
  );
}

async function openFile(f: AdminFile, toast: (m: string) => void) {
  const w = window.open("", "_blank");
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(f.storage_path, 300);
  if (error || !data) { w?.close(); toast("Impossible d'ouvrir le fichier"); return; }
  if (w) w.location.href = data.signedUrl; else window.location.href = data.signedUrl;
}

async function uploadFiles(docId: string, files: File[], uploaderId: string) {
  for (const f of files) {
    const path = `${docId}/${safeName(f.name)}`;
    const up = await supabase.storage.from(BUCKET).upload(path, f, { contentType: f.type || undefined, upsert: false });
    if (up.error) throw up.error;
    const ins = await supabase.from("admin_document_files").insert({
      document_id: docId, nom_fichier: f.name, storage_path: path, taille: f.size, mime_type: f.type || null, uploaded_by: uploaderId,
    });
    if (ins.error) { await supabase.storage.from(BUCKET).remove([path]); throw ins.error; }
  }
}

export function AdminDocDetail({ id }: { id: string }) {
  const { me, go, back, toast, bump, peopleById, dataVersion } = useApp();
  const [uploading, setUploading] = useState(false);
  const q = useQuery(async () => {
    const { data, error } = await supabase.from("admin_documents").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const d = data as AdminDoc;
    const [files, assoc, all] = await Promise.all([
      supabase.from("admin_document_files").select("*").eq("document_id", id).order("created_at"),
      supabase.from("associations").select("*").eq("id", d.association_id).maybeSingle(),
      supabase.from("admin_documents").select("*").eq("association_id", d.association_id),
    ]);
    // Reconstituer la chaîne des versions
    const docs = (all.data as AdminDoc[]) ?? [];
    const byId = new Map(docs.map((x) => [x.id, x]));
    const older: AdminDoc[] = [];
    let cur = d.remplace_id ? byId.get(d.remplace_id) : undefined;
    while (cur && older.length < 30) { older.push(cur); cur = cur.remplace_id ? byId.get(cur.remplace_id) : undefined; }
    const newer = docs.find((x) => x.remplace_id === d.id) ?? null;
    return { d, files: (files.data as AdminFile[]) ?? [], assoc: assoc.data as Association | null, older, newer };
  }, [id, dataVersion]);

  if (q.loading && !q.data) return (<><Topbar title="Document" backTo /><Spinner /></>);
  if (!q.data) return (<><Topbar title="Document" backTo /><main className="content"><ErrorBox msg={q.error} /><Empty>Document introuvable ou non accessible.</Empty></main></>);
  const { d, files, assoc, older, newer } = q.data;
  const resp = d.responsable_id ? peopleById.get(d.responsable_id) : null;
  const e = etatDoc(d);

  return (
    <>
      <Topbar title={assoc?.code === "college" ? "Association du Collège" : "Association du Primaire"} backTo right={
        <button className="icon-btn" aria-label="Modifier" onClick={() => go({ v: "doc-form", id: d.id })}><IEdit /></button>
      } />
      <main className="content">
        <div className="detail-head">
          <div className="row wrap"><EtatBadge d={d} /><span className="badge">{d.categorie}</span></div>
          <h2>{d.titre}</h2>
        </div>

        {newer && (
          <div className="alert info" style={{ marginBottom: 12 }}>
            Une version plus récente existe.
            <br /><a href="#" onClick={(ev) => { ev.preventDefault(); go({ v: "doc", id: newer.id }); }}>Voir la version en vigueur</a>
          </div>
        )}

        <div className="card">
          <dl className="kv">
            <dt>Signature</dt><dd>{d.date_signature ? fmtDate(d.date_signature) : <span className="muted">Non renseignée</span>}</dd>
            <dt>Validité</dt><dd className={ETAT_CLASS[e]} style={{ color: ["expire", "a_renouveler"].includes(e) ? "var(--fg)" : undefined }}>{validiteText(d)}</dd>
            {!d.sans_echeance && <><dt>Alerte</dt><dd>{d.rappel_jours} jours avant l'échéance</dd></>}
            <dt>Suivi par</dt><dd className="row">{resp ? <><Avatar p={resp} sm />{fullName(resp)}</> : <span className="muted">Personne</span>}</dd>
            <dt>Association</dt><dd>{assoc?.nom}</dd>
          </dl>
          {d.notes && (<><div className="section-title" style={{ marginTop: 16 }}>Notes</div><div className="prose">{d.notes}</div></>)}
        </div>

        {!d.archive && (
          <button className="btn primary block" style={{ marginTop: 14 }} onClick={() => go({ v: "doc-form", renew: d.id })}>
            Enregistrer le renouvellement
          </button>
        )}

        <div className="section-title">Pièces</div>
        <div className="card stack">
          {files.length === 0 && <div className="muted small">Aucune pièce jointe.</div>}
          {files.map((f) => (
            <div key={f.id} className="row">
              <button className="doc" onClick={() => openFile(f, toast)}>
                <span className="ico"><IFile width={20} /></span>
                <span style={{ minWidth: 0 }}>
                  <span className="name">{f.nom_fichier}</span>
                  <span className="tiny muted" style={{ display: "block" }}>{fmtSize(f.taille)}{f.taille ? " · " : ""}Ajouté le {fmtDate(f.created_at, true)}</span>
                </span>
              </button>
              <button className="icon-btn" aria-label={`Supprimer ${f.nom_fichier}`} onClick={async () => {
                if (!window.confirm(`Supprimer « ${f.nom_fichier} » ?`)) return;
                await supabase.storage.from(BUCKET).remove([f.storage_path]);
                const { error } = await supabase.from("admin_document_files").delete().eq("id", f.id);
                if (error) toast(errMsg(error)); else { toast("Pièce supprimée"); bump(); }
              }}><ITrash width={20} /></button>
            </div>
          ))}
          <DropZone busy={uploading} label="Joindre le document signé" onFiles={async (fs) => {
            setUploading(true);
            try { await uploadFiles(d.id, fs, me.id); toast(fs.length > 1 ? `${fs.length} pièces ajoutées` : "Pièce ajoutée"); bump(); }
            catch (err) { toast(errMsg(err)); } finally { setUploading(false); }
          }} />
        </div>

        {older.length > 0 && (
          <>
            <div className="section-title">Versions précédentes</div>
            <div className="stack">{older.map((o) => <DocCard key={o.id} d={o} />)}</div>
          </>
        )}

        <div style={{ marginTop: 28 }}>
          <ConfirmButton label="Supprimer ce document" confirmLabel="Confirmer : document et pièces supprimés" onConfirm={async () => {
            if (files.length) await supabase.storage.from(BUCKET).remove(files.map((f) => f.storage_path));
            const { error } = await supabase.from("admin_documents").delete().eq("id", d.id);
            if (error) { toast(errMsg(error)); return; }
            toast("Document supprimé"); bump(); back({ v: "associations", a: assoc?.code });
          }} />
          <p className="tiny muted">Pour un renouvellement, préférez « Enregistrer le renouvellement » : l'ancienne version reste consultable.</p>
        </div>
      </main>
    </>
  );
}

export function AdminDocForm({ id, assoc, renew }: { id?: string; assoc?: string; renew?: string }) {
  const { me } = useApp();
  const srcId = id || renew;
  const q = useQuery(async () => {
    const [d, a] = await Promise.all([
      srcId ? supabase.from("admin_documents").select("*").eq("id", srcId).maybeSingle() : Promise.resolve({ data: null, error: null }),
      supabase.from("associations").select("*").order("ordre"),
    ]);
    return { d: d.data as AdminDoc | null, assocs: (a.data as Association[]) ?? [] };
  }, [srcId]);
  const title = renew ? "Renouvellement" : id ? "Modifier le document" : "Nouveau document";
  if (!canAssociations(me)) return (<><Topbar title={title} backTo /><main className="content"><Empty>Accès réservé.</Empty></main></>);
  if (q.loading && !q.data) return (<><Topbar title={title} backTo /><Spinner /></>);
  return <AdminDocFormInner key={srcId ?? "new"} title={title} mode={renew ? "renew" : id ? "edit" : "new"} src={q.data?.d ?? null}
    assocs={q.data?.assocs ?? []} defaultAssoc={assoc} />;
}

function AdminDocFormInner({ title, mode, src, assocs, defaultAssoc }: {
  title: string; mode: "new" | "edit" | "renew"; src: AdminDoc | null; assocs: Association[]; defaultAssoc?: string;
}) {
  const { me, people, go, back, toast, bump } = useApp();
  const renewing = mode === "renew";
  const [associationId, setAssociationId] = useState(src?.association_id ?? defaultAssoc ?? assocs[0]?.id ?? "");
  const [categorie, setCategorie] = useState(src?.categorie ?? CATEGORIES[0]);
  const [titre, setTitre] = useState(src?.titre ?? "");
  const [dateSignature, setDateSignature] = useState(renewing ? todayISO() : src?.date_signature ?? "");
  const [dateValidite, setDateValidite] = useState(renewing ? "" : src?.date_validite ?? "");
  const [sansEcheance, setSansEcheance] = useState(src?.sans_echeance ?? false);
  const [rappel, setRappel] = useState(src?.rappel_jours ?? 60);
  const [responsable, setResponsable] = useState(src?.responsable_id ?? "");
  const [notes, setNotes] = useState(renewing ? "" : src?.notes ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eligible = people.filter((p) => p.actif && canAssociations(p));
  const cats = CATEGORIES.includes(categorie) ? CATEGORIES : [...CATEGORIES, categorie];

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!titre.trim()) { setError("L'intitulé est obligatoire."); return; }
    if (!sansEcheance && dateSignature && dateValidite && dateValidite < dateSignature) { setError("La date de validité précède la date de signature."); return; }
    setBusy(true); setError(null);
    const row = {
      association_id: associationId, categorie, titre: titre.trim(),
      date_signature: dateSignature || null, date_validite: sansEcheance ? null : dateValidite || null,
      sans_echeance: sansEcheance, rappel_jours: rappel, responsable_id: responsable || null, notes: notes.trim() || null,
    };
    try {
      let docId: string;
      if (mode === "edit" && src) {
        const { error } = await supabase.from("admin_documents").update(row).eq("id", src.id);
        if (error) throw error;
        docId = src.id;
      } else if (renewing && src) {
        const { data, error } = await supabase.rpc("renouveler_document", {
          p_ancien: src.id, p_titre: row.titre, p_categorie: row.categorie, p_date_signature: row.date_signature,
          p_date_validite: row.date_validite, p_sans_echeance: row.sans_echeance, p_rappel_jours: row.rappel_jours,
          p_responsable: row.responsable_id, p_notes: row.notes,
        });
        if (error) throw error;
        docId = data as string;
      } else {
        const { data, error } = await supabase.from("admin_documents").insert({ ...row, created_by: me.id }).select("id").single();
        if (error) throw error;
        docId = data.id;
      }
      if (files.length) await uploadFiles(docId, files, me.id);
      toast(renewing ? "Renouvellement enregistré" : mode === "edit" ? "Document mis à jour" : "Document créé");
      bump();
      if (mode === "edit") back(); else go({ v: "doc", id: docId }, true);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  const base = dateSignature || todayISO();

  return (
    <>
      <Topbar title={title} backTo />
      <main className="content">
        <form className="stack-lg" onSubmit={submit}>
          {renewing && src && (
            <div className="alert info small">
              Nouvelle version de « {src.titre} ».
              <br />L'ancienne version sera conservée dans l'historique.
            </div>
          )}
          {mode === "new" && (
            <div className="field"><span>Association</span>
              <div className="segmented">
                {assocs.map((a) => (
                  <button type="button" key={a.id} className={associationId === a.id ? "on" : ""} onClick={() => setAssociationId(a.id)}>
                    {a.code === "primaire" ? "Primaire" : "Collège"}
                  </button>
                ))}
              </div>
            </div>
          )}
          <label className="field"><span>Intitulé</span>
            <input className="input" value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Ex. Assurance responsabilité civile" required />
          </label>
          <label className="field"><span>Catégorie</span>
            <select className="select" value={categorie} onChange={(e) => setCategorie(e.target.value)}>
              {cats.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="field"><span>Date de signature</span>
            <input className="input" type="date" value={dateSignature} onChange={(e) => setDateSignature(e.target.value)} />
          </label>
          <div className="field"><span>Date de validité</span>
            <label className="check">
              <input type="checkbox" checked={sansEcheance} onChange={(e) => setSansEcheance(e.target.checked)} />
              <span><span className="t">Sans date de fin</span><br /><span className="d">Ex. statuts, publication au Journal officiel</span></span>
            </label>
            {!sansEcheance && (
              <>
                <input className="input" type="date" value={dateValidite} onChange={(e) => setDateValidite(e.target.value)} aria-label="Date de validité" />
                <div className="chips" style={{ padding: "2px 0", margin: 0 }}>
                  {[1, 2, 3, 5].map((n) => (
                    <button type="button" key={n} className="chip" onClick={() => setDateValidite(addYears(base, n))}>+{n} an{n > 1 ? "s" : ""}</button>
                  ))}
                </div>
                <span className="hint">Les raccourcis partent de la date de signature.</span>
              </>
            )}
          </div>
          {!sansEcheance && (
            <label className="field"><span>Alerte de renouvellement</span>
              <select className="select" value={rappel} onChange={(e) => setRappel(Number(e.target.value))}>
                {[15, 30, 60, 90, 120, 180].map((n) => <option key={n} value={n}>{n} jours avant l'échéance</option>)}
              </select>
            </label>
          )}
          <label className="field"><span>Suivi par <span className="hint">(facultatif)</span></span>
            <select className="select" value={responsable} onChange={(e) => setResponsable(e.target.value)}>
              <option value="">Personne</option>
              {eligible.map((p) => <option key={p.id} value={p.id}>{fullName(p)}</option>)}
            </select>
          </label>
          <label className="field"><span>Notes <span className="hint">(organisme, n° de contrat…)</span></span>
            <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <div className="field"><span>Document signé <span className="hint">(facultatif)</span></span>
            <DropZone label="Ajouter le document" onFiles={(fs) => setFiles((p) => [...p, ...fs])} />
            {files.map((f, i) => (
              <div key={i} className="doc" style={{ cursor: "default" }}>
                <span className="ico"><IFile width={20} /></span>
                <span style={{ minWidth: 0, flex: 1 }}><span className="name">{f.name}</span>
                  <span className="tiny muted" style={{ display: "block" }}>{fmtSize(f.size)} · envoyé à l'enregistrement</span></span>
                <button type="button" className="icon-btn" aria-label={`Retirer ${f.name}`} onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}><ITrash width={20} /></button>
              </div>
            ))}
          </div>
          <ErrorBox msg={error} />
          <button className="btn primary block" disabled={busy}>{busy ? "Enregistrement…" : renewing ? "Enregistrer le renouvellement" : mode === "edit" ? "Enregistrer" : "Créer le document"}</button>
          <button type="button" className="btn ghost block" onClick={() => back()}>Annuler</button>
        </form>
      </main>
    </>
  );
}
