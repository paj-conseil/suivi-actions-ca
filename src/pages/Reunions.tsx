import { useState, type FormEvent } from "react";
import {
  supabase, type Action, type Doc, type Instance, type Reunion, type ReunionSection,
  errMsg, fmtDate, fmtSize, instanceLabel, todayISO,
} from "../lib";
import { useApp, useQuery } from "../store";
import { ActionCard, ConfirmButton, DropZone, Empty, ErrorBox, InstanceBadge, Spinner, Topbar } from "../components/ui";
import { ICalendar, IChevron, IEdit, IFile, IPlus, ITrash } from "../components/Icons";
import { sortActions } from "./Dashboard";

const BUCKET = "comptes-rendus";
const ORDER: Instance[] = ["bureau", "ca"];

export function ReunionsList() {
  const { me, go, instances, dataVersion } = useApp();
  const q = useQuery(async () => {
    const [r, d, a] = await Promise.all([
      supabase.from("reunions").select("*").order("date_reunion", { ascending: false }),
      supabase.from("documents").select("reunion_id, instance"),
      supabase.from("actions").select("reunion_id, instance"),
    ]);
    if (r.error) throw r.error;
    const key = (id: string, i: string) => `${id}:${i}`;
    const nDocs = new Map<string, number>();
    (d.data ?? []).forEach((x: { reunion_id: string; instance: string }) => nDocs.set(key(x.reunion_id, x.instance), (nDocs.get(key(x.reunion_id, x.instance)) ?? 0) + 1));
    const nAct = new Map<string, number>();
    (a.data ?? []).forEach((x: { reunion_id: string | null; instance: string }) => { if (x.reunion_id) nAct.set(key(x.reunion_id, x.instance), (nAct.get(key(x.reunion_id, x.instance)) ?? 0) + 1); });
    return { reunions: r.data as Reunion[], nDocs, nAct, key };
  }, [dataVersion]);

  const list = q.data?.reunions ?? [];
  const byYear = new Map<string, Reunion[]>();
  list.forEach((r) => { const y = r.date_reunion.slice(0, 4); byYear.set(y, [...(byYear.get(y) ?? []), r]); });

  return (
    <>
      <Topbar title="Réunions" />
      <main className="content">
        <ErrorBox msg={q.error} />
        {q.loading && !q.data ? <Spinner /> : list.length === 0 ? (
          <Empty icon={<ICalendar />}>Aucune réunion enregistrée.</Empty>
        ) : [...byYear.entries()].map(([y, rs]) => (
          <section key={y}>
            <div className="section-title">{y}</div>
            <div className="stack">
              {rs.map((r) => (
                <button key={r.id} className="list-item" onClick={() => go({ v: "reunion", id: r.id })}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="muted small" style={{ marginBottom: 2 }}>{fmtDate(r.date_reunion)}</div>
                    <div style={{ fontWeight: 600 }}>{r.titre}</div>
                    <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
                      {ORDER.filter((i) => instances.includes(i)).map((i) => {
                        const nd = q.data?.nDocs.get(q.data.key(r.id, i)) ?? 0;
                        const na = q.data?.nAct.get(q.data.key(r.id, i)) ?? 0;
                        return (
                          <span key={i} className={`badge instance-${i}`} style={{ opacity: nd || na ? 1 : 0.55 }}>
                            {i === "bureau" ? "CS" : "CA"} · {nd ? `${nd} CR` : "pas de CR"} · {na} action{na > 1 ? "s" : ""}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <IChevron width={20} className="muted" />
                </button>
              ))}
            </div>
          </section>
        ))}
      </main>
      {me.is_admin && (
        <button className="fab" onClick={() => go({ v: "reunion-form" })}><IPlus />Réunion</button>
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

export function safeName(name: string) {
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot).toLowerCase() : "";
  const stem = (dot > 0 ? name.slice(0, dot) : name).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9-_]+/g, "-").slice(0, 60);
  return `${Date.now()}-${stem || "document"}${ext}`;
}

export async function uploadDocs(reunionId: string, instance: Instance, files: File[], uploaderId: string) {
  for (const f of files) {
    const path = `${reunionId}/${instance}/${safeName(f.name)}`;
    const up = await supabase.storage.from(BUCKET).upload(path, f, { contentType: f.type || undefined, upsert: false });
    if (up.error) throw up.error;
    const ins = await supabase.from("documents").insert({
      reunion_id: reunionId, instance, nom_fichier: f.name, storage_path: path, taille: f.size, mime_type: f.type || null, uploaded_by: uploaderId,
    });
    if (ins.error) { await supabase.storage.from(BUCKET).remove([path]); throw ins.error; }
  }
}

function SectionBlock({ r, i, docs, notes, actions }: { r: Reunion; i: Instance; docs: Doc[]; notes: string | null; actions: Action[] }) {
  const { me, go, toast, bump } = useApp();
  return (
    <section className="reunion-section">
      <div className={`reunion-section-head head-${i}`}>
        <h3>{instanceLabel(i)}</h3>
      </div>

      <div className="section-title">Compte rendu</div>
      <div className="card stack">
        {docs.length === 0 && <div className="muted small">Aucun document joint.{me.is_admin ? " Pour en ajouter, utilisez le crayon de modification en haut de la page." : ""}</div>}
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
      </div>

      {notes && (
        <>
          <div className="section-title">{i === "ca" ? "Synthèse et notes" : "Notes"}</div>
          <div className="card prose">{notes}</div>
        </>
      )}

      <div className="section-title">Actions décidées ({actions.length})</div>
      <div className="stack">
        {actions.length === 0 && <div className="card muted small">Aucune action rattachée à cette section.</div>}
        {sortActions(actions).map((a) => <ActionCard key={a.id} a={a} showInstance={false} />)}
        {me.is_admin && (
          <button className="btn block" onClick={() => go({ v: "action-form", reunion: r.id, instance: i })}>
            <IPlus width={20} />Ajouter une action
          </button>
        )}
      </div>
    </section>
  );
}

export function ReunionDetail({ id }: { id: string }) {
  const { me, go, back, toast, bump, instances, dataVersion } = useApp();
  const q = useQuery(async () => {
    const { data, error } = await supabase.from("reunions").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const [d, a, s] = await Promise.all([
      supabase.from("documents").select("*").eq("reunion_id", id).order("created_at"),
      supabase.from("actions").select("*").eq("reunion_id", id),
      supabase.from("reunion_sections").select("*").eq("reunion_id", id),
    ]);
    return { r: data as Reunion, docs: (d.data as Doc[]) ?? [], actions: (a.data as Action[]) ?? [], sections: (s.data as ReunionSection[]) ?? [] };
  }, [id, dataVersion]);

  if (q.loading && !q.data) return (<><Topbar title="Réunion" backTo /><Spinner /></>);
  if (!q.data) return (<><Topbar title="Réunion" backTo /><main className="content"><ErrorBox msg={q.error} /><Empty>Réunion introuvable ou non accessible.</Empty></main></>);
  const { r, docs, actions, sections } = q.data;
  const visible = ORDER.filter((i) => instances.includes(i));

  return (
    <>
      <Topbar title="Réunion" backTo right={me.is_admin && (
        <button className="icon-btn" aria-label="Modifier" onClick={() => go({ v: "reunion-form", id: r.id })}><IEdit /></button>
      )} />
      <main className="content">
        <div className="detail-head">
          <div className="muted small">{fmtDate(r.date_reunion)}</div>
          <h2>{r.titre}</h2>
        </div>

        {visible.map((i) => (
          <SectionBlock key={i} r={r} i={i}
            docs={docs.filter((d) => d.instance === i)}
            notes={sections.find((x) => x.instance === i)?.notes ?? null}
            actions={actions.filter((a) => a.instance === i)} />
        ))}

        {me.is_admin && (
          <div style={{ marginTop: 28 }}>
            <ConfirmButton label="Supprimer la réunion" confirmLabel="Confirmer : réunion et documents supprimés" onConfirm={async () => {
              if (docs.length) await supabase.storage.from(BUCKET).remove(docs.map((d) => d.storage_path));
              const { error } = await supabase.from("reunions").delete().eq("id", r.id);
              if (error) { toast(errMsg(error)); return; }
              toast("Réunion supprimée"); bump(); back({ v: "reunions" });
            }} />
            <p className="tiny muted">Supprime les deux sections et leurs documents. Les actions rattachées sont conservées.</p>
          </div>
        )}
      </main>
    </>
  );
}

export function ReunionForm({ id }: { id?: string; instance?: string }) {
  const { me, go, back, toast, bump } = useApp();
  const q = useQuery(async () => {
    if (!id) return null;
    const [r, s, d] = await Promise.all([
      supabase.from("reunions").select("*").eq("id", id).maybeSingle(),
      supabase.from("reunion_sections").select("*").eq("reunion_id", id),
      supabase.from("documents").select("*").eq("reunion_id", id).order("created_at"),
    ]);
    return { r: r.data as Reunion | null, sections: (s.data as ReunionSection[]) ?? [], docs: (d.data as Doc[]) ?? [] };
  }, [id]);
  if (!me.is_admin) return (<><Topbar title="Réunion" backTo /><main className="content"><Empty>Réservé aux admins.</Empty></main></>);
  if (id && q.loading) return (<><Topbar title="Modifier la réunion" backTo /><Spinner /></>);
  return <ReunionFormInner initial={q.data?.r ?? null} sections={q.data?.sections ?? []} existingDocs={q.data?.docs ?? []}
    onSaved={(rid, isNew) => { toast(isNew ? "Réunion créée" : "Réunion mise à jour"); bump(); if (isNew) go({ v: "reunion", id: rid }, true); else back(); }}
    onCancel={() => back()} />;
}

function ReunionFormInner({ initial, sections, existingDocs, onSaved, onCancel }: {
  initial: Reunion | null; sections: ReunionSection[]; existingDocs: Doc[]; onSaved: (id: string, isNew: boolean) => void; onCancel: () => void;
}) {
  const { me, toast } = useApp();
  const [docs, setDocs] = useState<Doc[]>(existingDocs);
  async function removeDoc(d: Doc) {
    if (!window.confirm(`Supprimer « ${d.nom_fichier} » ?`)) return;
    await supabase.storage.from(BUCKET).remove([d.storage_path]);
    const { error } = await supabase.from("documents").delete().eq("id", d.id);
    if (error) toast(errMsg(error)); else { setDocs((p) => p.filter((x) => x.id !== d.id)); toast("Document supprimé"); }
  }
  const [date, setDate] = useState(initial?.date_reunion ?? todayISO());
  const [titre, setTitre] = useState(initial?.titre ?? "");
  const [notes, setNotes] = useState<Record<Instance, string>>({
    bureau: sections.find((s) => s.instance === "bureau")?.notes ?? "",
    ca: sections.find((s) => s.instance === "ca")?.notes ?? "",
  });
  const [files, setFiles] = useState<Record<Instance, File[]>>({ bureau: [], ca: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const autoTitle = () => {
    const m = new Date(date + "T00:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    return `Réunion de ${m}`;
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const row = { date_reunion: date, titre: titre.trim() || autoTitle() };
    try {
      let rid: string;
      if (initial) {
        const { error } = await supabase.from("reunions").update(row).eq("id", initial.id);
        if (error) throw error;
        rid = initial.id;
      } else {
        const { data, error } = await supabase.from("reunions").insert({ ...row, created_by: me.id }).select("id").single();
        if (error) throw error;
        rid = data.id;
      }
      const secRows = ORDER.map((i) => ({ reunion_id: rid, instance: i, notes: notes[i].trim() || null, updated_at: new Date().toISOString() }));
      const { error: sErr } = await supabase.from("reunion_sections").upsert(secRows, { onConflict: "reunion_id,instance" });
      if (sErr) throw sErr;
      for (const i of ORDER) if (files[i].length) await uploadDocs(rid, i, files[i], me.id);
      onSaved(rid, !initial);
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
          <label className="field"><span>Date</span>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label className="field"><span>Titre <span className="hint">(facultatif)</span></span>
            <input className="input" value={titre} onChange={(e) => setTitre(e.target.value)} placeholder={autoTitle()} />
          </label>

          {ORDER.map((i) => (
            <fieldset key={i} className="form-section">
              <legend><InstanceBadge i={i} /> {instanceLabel(i)}</legend>
              <span className="hint">{i === "bureau" ? "Visible par les membres ayant l'accès Conseil scolaire." : "Visible par les membres ayant l'accès Conseil d'administration."}</span>
              <label className="field"><span>{i === "ca" ? "Synthèse du conseil scolaire et notes" : "Notes"} <span className="hint">(facultatif)</span></span>
                <textarea className="textarea" value={notes[i]} onChange={(e) => setNotes((n) => ({ ...n, [i]: e.target.value }))} />
              </label>
              <div className="field"><span>Compte rendu <span className="hint">(facultatif)</span></span>
                {docs.filter((d) => d.instance === i).map((d) => (
                  <div key={d.id} className="doc" style={{ cursor: "default" }}>
                    <span className="ico"><IFile width={20} /></span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span className="name">{d.nom_fichier}</span>
                      <span className="tiny muted" style={{ display: "block" }}>{fmtSize(d.taille)}{d.taille ? " · " : ""}déjà joint</span>
                    </span>
                    <button type="button" className="icon-btn" aria-label={`Supprimer ${d.nom_fichier}`} onClick={() => removeDoc(d)}><ITrash width={20} /></button>
                  </div>
                ))}
                <DropZone label="Ajouter le compte rendu" onFiles={(fs) => setFiles((p) => ({ ...p, [i]: [...p[i], ...fs] }))} />
                {files[i].map((f, k) => (
                  <div key={k} className="doc" style={{ cursor: "default" }}>
                    <span className="ico"><IFile width={20} /></span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span className="name">{f.name}</span>
                      <span className="tiny muted" style={{ display: "block" }}>{fmtSize(f.size)} · envoyé à l'enregistrement</span>
                    </span>
                    <button type="button" className="icon-btn" aria-label={`Retirer ${f.name}`} onClick={() => setFiles((p) => ({ ...p, [i]: p[i].filter((_, j) => j !== k) }))}><ITrash width={20} /></button>
                  </div>
                ))}
              </div>
            </fieldset>
          ))}

          <ErrorBox msg={error} />
          <button className="btn primary block" disabled={busy}>{busy ? "Enregistrement…" : initial ? "Enregistrer" : "Créer la réunion"}</button>
          <button type="button" className="btn ghost block" onClick={onCancel}>Annuler</button>
        </form>
      </main>
    </>
  );
}
