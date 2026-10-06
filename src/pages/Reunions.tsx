import { useRef, useState, type FormEvent } from "react";
import {
  supabase, type Action, type Doc, type Instance, type Reunion, errMsg, fmtDate, fmtSize, instanceLabel, todayISO,
} from "../lib";
import { useApp, useQuery } from "../store";
import { ActionCard, ConfirmButton, Empty, ErrorBox, InstanceBadge, Spinner, Topbar } from "../components/ui";
import { ICalendar, IChevron, IEdit, IFile, IPlus, ITrash, IUpload } from "../components/Icons";
import { sortActions } from "./Dashboard";

const BUCKET = "comptes-rendus";

export function ReunionsList() {
  const { me, route, go, instances, dataVersion } = useApp();
  const inst = (route.i as Instance | undefined) ?? (instances.length === 1 ? instances[0] : "");
  const q = useQuery(async () => {
    const [r, d, a] = await Promise.all([
      supabase.from("reunions").select("*").order("date_reunion", { ascending: false }),
      supabase.from("documents").select("reunion_id"),
      supabase.from("actions").select("reunion_id"),
    ]);
    if (r.error) throw r.error;
    const nDocs = new Map<string, number>(); (d.data ?? []).forEach((x: { reunion_id: string }) => nDocs.set(x.reunion_id, (nDocs.get(x.reunion_id) ?? 0) + 1));
    const nAct = new Map<string, number>(); (a.data ?? []).forEach((x: { reunion_id: string | null }) => { if (x.reunion_id) nAct.set(x.reunion_id, (nAct.get(x.reunion_id) ?? 0) + 1); });
    return { reunions: r.data as Reunion[], nDocs, nAct };
  }, [dataVersion]);

  const list = (q.data?.reunions ?? []).filter((r) => !inst || r.instance === inst);
  const byYear = new Map<string, Reunion[]>();
  list.forEach((r) => { const y = r.date_reunion.slice(0, 4); byYear.set(y, [...(byYear.get(y) ?? []), r]); });

  return (
    <>
      <Topbar title="Réunions" />
      <main className="content">
        {instances.length > 1 && (
          <div className="segmented" role="group" aria-label="Instance" style={{ marginBottom: 6 }}>
            <button className={!inst ? "on" : ""} onClick={() => go({ v: "reunions" }, true)}>Toutes</button>
            <button className={inst === "bureau" ? "on" : ""} onClick={() => go({ v: "reunions", i: "bureau" }, true)}>Bureau</button>
            <button className={inst === "ca" ? "on" : ""} onClick={() => go({ v: "reunions", i: "ca" }, true)}>CA</button>
          </div>
        )}
        <ErrorBox msg={q.error} />
        {q.loading && !q.data ? <Spinner /> : list.length === 0 ? (
          <Empty icon={<ICalendar />}>Aucune réunion enregistrée.</Empty>
        ) : [...byYear.entries()].map(([y, rs]) => (
          <section key={y}>
            <div className="section-title">{y}</div>
            <div className="stack">
              {rs.map((r) => {
                const nd = q.data?.nDocs.get(r.id) ?? 0;
                const na = q.data?.nAct.get(r.id) ?? 0;
                return (
                  <button key={r.id} className="list-item" onClick={() => go({ v: "reunion", id: r.id })}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="row" style={{ marginBottom: 4 }}>
                        <InstanceBadge i={r.instance} />
                        <span className="muted small">{fmtDate(r.date_reunion)}</span>
                      </div>
                      <div style={{ fontWeight: 650 }}>{r.titre}</div>
                      <div className="tiny muted" style={{ marginTop: 2 }}>
                        {nd ? `${nd} document${nd > 1 ? "s" : ""}` : "Pas de compte rendu"} · {na} action{na > 1 ? "s" : ""}
                      </div>
                    </div>
                    <IChevron width={20} className="muted" />
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </main>
      {me.is_admin && (
        <button className="fab" onClick={() => go({ v: "reunion-form", instance: inst || undefined })}><IPlus />Réunion</button>
      )}
    </>
  );
}

async function openDoc(d: Doc, toast: (m: string) => void) {
  // Ouvrir l'onglet tout de suite (sinon bloqué sur iPhone), puis charger le lien sécurisé
  const w = window.open("", "_blank");
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(d.storage_path, 300);
  if (error || !data) { w?.close(); toast("Impossible d'ouvrir le document"); return; }
  if (w) w.location.href = data.signedUrl; else window.location.href = data.signedUrl;
}

function safeName(name: string) {
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot).toLowerCase() : "";
  const stem = (dot > 0 ? name.slice(0, dot) : name).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9-_]+/g, "-").slice(0, 60);
  return `${Date.now()}-${stem || "document"}${ext}`;
}

export async function uploadDocs(reunionId: string, files: FileList | File[], uploaderId: string) {
  for (const f of Array.from(files)) {
    const path = `${reunionId}/${safeName(f.name)}`;
    const up = await supabase.storage.from(BUCKET).upload(path, f, { contentType: f.type || undefined, upsert: false });
    if (up.error) throw up.error;
    const ins = await supabase.from("documents").insert({
      reunion_id: reunionId, nom_fichier: f.name, storage_path: path, taille: f.size, mime_type: f.type || null, uploaded_by: uploaderId,
    });
    if (ins.error) { await supabase.storage.from(BUCKET).remove([path]); throw ins.error; }
  }
}

export function ReunionDetail({ id }: { id: string }) {
  const { me, go, back, toast, bump, dataVersion } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const q = useQuery(async () => {
    const { data, error } = await supabase.from("reunions").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const [d, a] = await Promise.all([
      supabase.from("documents").select("*").eq("reunion_id", id).order("created_at"),
      supabase.from("actions").select("*").eq("reunion_id", id),
    ]);
    return { r: data as Reunion, docs: (d.data as Doc[]) ?? [], actions: (a.data as Action[]) ?? [] };
  }, [id, dataVersion]);

  if (q.loading && !q.data) return (<><Topbar title="Réunion" backTo /><Spinner /></>);
  if (!q.data) return (<><Topbar title="Réunion" backTo /><main className="content"><ErrorBox msg={q.error} /><Empty>Réunion introuvable ou non accessible.</Empty></main></>);
  const { r, docs, actions } = q.data;

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try { await uploadDocs(r.id, files, me.id); toast("Document ajouté"); bump(); }
    catch (e) { toast(errMsg(e)); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  return (
    <>
      <Topbar title={r.instance === "bureau" ? "Bureau" : "Conseil d'administration"} backTo right={me.is_admin && (
        <button className="icon-btn" aria-label="Modifier" onClick={() => go({ v: "reunion-form", id: r.id })}><IEdit /></button>
      )} />
      <main className="content">
        <div className="detail-head">
          <div className="row"><InstanceBadge i={r.instance} /><span className="muted small">{fmtDate(r.date_reunion)}</span></div>
          <h2>{r.titre}</h2>
        </div>

        <div className="section-title">Compte rendu</div>
        <div className="card stack">
          {docs.length === 0 && <div className="muted small">Aucun document joint pour l'instant.</div>}
          {docs.map((d) => (
            <div key={d.id} className="row">
              <button className="doc" onClick={() => openDoc(d, toast)}>
                <span className="ico"><IFile width={20} /></span>
                <span style={{ minWidth: 0 }}>
                  <span className="name">{d.nom_fichier}</span>
                  <span className="tiny muted" style={{ display: "block" }}>{fmtSize(d.taille)}{d.taille ? " · " : ""}Ajouté le {fmtDate(d.created_at, true)}</span>
                </span>
              </button>
              {me.is_admin && (
                <button className="icon-btn" aria-label={`Supprimer ${d.nom_fichier}`} onClick={async () => {
                  if (!window.confirm(`Supprimer « ${d.nom_fichier} » ?`)) return;
                  await supabase.storage.from(BUCKET).remove([d.storage_path]);
                  const { error } = await supabase.from("documents").delete().eq("id", d.id);
                  if (error) toast(errMsg(error)); else { toast("Document supprimé"); bump(); }
                }}><ITrash width={20} /></button>
              )}
            </div>
          ))}
          {me.is_admin && (
            <>
              <input ref={fileRef} type="file" multiple hidden onChange={(e) => onFiles(e.target.files)}
                accept=".pdf,.doc,.docx,.odt,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.txt" />
              <button className="btn block" disabled={uploading} onClick={() => fileRef.current?.click()}>
                <IUpload width={20} />{uploading ? "Envoi en cours…" : "Joindre un document"}
              </button>
            </>
          )}
        </div>

        {r.notes && (
          <>
            <div className="section-title">{r.instance === "ca" ? "Synthèse et notes" : "Notes"}</div>
            <div className="card prose">{r.notes}</div>
          </>
        )}

        <div className="section-title">Actions décidées ({actions.length})</div>
        <div className="stack">
          {actions.length === 0 && <div className="card muted small">Aucune action rattachée à cette réunion.</div>}
          {sortActions(actions).map((a) => <ActionCard key={a.id} a={a} showInstance={false} />)}
          {me.is_admin && (
            <button className="btn block" onClick={() => go({ v: "action-form", reunion: r.id, instance: r.instance })}>
              <IPlus width={20} />Ajouter une action
            </button>
          )}
        </div>

        {me.is_admin && (
          <div style={{ marginTop: 28 }}>
            <ConfirmButton label="Supprimer la réunion" confirmLabel="Confirmer : réunion et documents supprimés" onConfirm={async () => {
              if (docs.length) await supabase.storage.from(BUCKET).remove(docs.map((d) => d.storage_path));
              const { error } = await supabase.from("reunions").delete().eq("id", r.id);
              if (error) { toast(errMsg(error)); return; }
              toast("Réunion supprimée"); bump(); back({ v: "reunions" });
            }} />
            <p className="tiny muted">Les actions rattachées sont conservées.</p>
          </div>
        )}
      </main>
    </>
  );
}

export function ReunionForm({ id, instance }: { id?: string; instance?: string }) {
  const { me, go, back, toast, bump, instances } = useApp();
  const q = useQuery(async () => {
    if (!id) return null;
    const { data } = await supabase.from("reunions").select("*").eq("id", id).maybeSingle();
    return data as Reunion | null;
  }, [id]);
  if (!me.is_admin) return (<><Topbar title="Réunion" backTo /><main className="content"><Empty>Réservé aux administrateurs.</Empty></main></>);
  if (id && q.loading) return (<><Topbar title="Modifier la réunion" backTo /><Spinner /></>);
  return <ReunionFormInner initial={q.data ?? null} defaultInstance={(instance as Instance) || instances[0]}
    onSaved={(rid, isNew) => { toast(isNew ? "Réunion créée" : "Réunion mise à jour"); bump(); if (isNew) go({ v: "reunion", id: rid }, true); else back(); }}
    onCancel={() => back()} />;
}

function ReunionFormInner({ initial, defaultInstance, onSaved, onCancel }: {
  initial: Reunion | null; defaultInstance: Instance; onSaved: (id: string, isNew: boolean) => void; onCancel: () => void;
}) {
  const { me } = useApp();
  const [inst, setInst] = useState<Instance>(initial?.instance ?? defaultInstance);
  const [date, setDate] = useState(initial?.date_reunion ?? todayISO());
  const [titre, setTitre] = useState(initial?.titre ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const autoTitle = () => {
    const m = new Date(date + "T00:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    return `${inst === "bureau" ? "Bureau" : "Conseil d'administration"} de ${m}`;
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const row = { instance: inst, date_reunion: date, titre: titre.trim() || autoTitle(), notes: notes.trim() || null };
    try {
      if (initial) {
        const { error } = await supabase.from("reunions").update(row).eq("id", initial.id);
        if (error) throw error;
        if (files.length) await uploadDocs(initial.id, files, me.id);
        onSaved(initial.id, false);
      } else {
        const { data, error } = await supabase.from("reunions").insert({ ...row, created_by: me.id }).select("id").single();
        if (error) throw error;
        if (files.length) await uploadDocs(data.id, files, me.id);
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
      <Topbar title={initial ? "Modifier la réunion" : "Nouvelle réunion"} backTo />
      <main className="content">
        <form className="stack-lg" onSubmit={submit}>
          <div className="field"><span>Instance</span>
            <div className="segmented">
              <button type="button" className={inst === "bureau" ? "on" : ""} onClick={() => setInst("bureau")}>Bureau</button>
              <button type="button" className={inst === "ca" ? "on" : ""} onClick={() => setInst("ca")}>Conseil d'administration</button>
            </div>
            <span className="hint">{inst === "bureau" ? "Visible par les membres du bureau." : "Visible par les administrateurs du conseil."}</span>
          </div>
          <label className="field"><span>Date</span>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label className="field"><span>Titre <span className="hint">(facultatif)</span></span>
            <input className="input" value={titre} onChange={(e) => setTitre(e.target.value)} placeholder={autoTitle()} />
          </label>
          <label className="field"><span>{inst === "ca" ? "Synthèse du bureau et notes" : "Notes"} <span className="hint">(facultatif)</span></span>
            <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} style={{ minHeight: 140 }} />
          </label>
          <label className="field"><span>Compte rendu <span className="hint">(PDF, Word…)</span></span>
            <input className="input" type="file" multiple style={{ paddingTop: 11 }} onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              accept=".pdf,.doc,.docx,.odt,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.txt" />
            {files.length > 0 && <span className="hint">{files.length} fichier{files.length > 1 ? "s" : ""} sélectionné{files.length > 1 ? "s" : ""}</span>}
          </label>
          <ErrorBox msg={error} />
          <button className="btn primary block" disabled={busy}>{busy ? "Enregistrement…" : initial ? "Enregistrer" : "Créer la réunion"}</button>
          <button type="button" className="btn ghost block" onClick={onCancel}>Annuler</button>
          <p className="tiny muted" style={{ margin: 0 }}>{instanceLabel(inst)} · {fmtDate(date)}</p>
        </form>
      </main>
    </>
  );
}
