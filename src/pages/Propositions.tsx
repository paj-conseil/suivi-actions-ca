import { useState } from "react";
import { supabase, adminUsers, errMsg, fmtDateTime, fullName, type Projet, type Proposition } from "../lib";
import { useApp, useQuery } from "../store";
import { Empty, ErrorBox, Sheet, Spinner, Topbar } from "../components/ui";
import { ICheck, IUsers } from "../components/Icons";
import { CredsSheet, type Creds } from "./Users";

/** Nombre de propositions en attente (pour les admins) */
export function usePropositionsEnAttente() {
  const { me, dataVersion } = useApp();
  const q = useQuery(async () => {
    if (!me.is_admin) return 0;
    const { count } = await supabase.from("projet_propositions").select("id", { count: "exact", head: true }).eq("statut", "en_attente");
    return count ?? 0;
  }, [me.is_admin, dataVersion]);
  return q.data ?? 0;
}

export function PropositionsPage() {
  const { me, peopleById, people, refreshPeople, toast, bump, dataVersion } = useApp();
  const [creds, setCreds] = useState<Creds | null>(null);
  const [refus, setRefus] = useState<Proposition | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const q = useQuery(async () => {
    const [p, pj] = await Promise.all([
      supabase.from("projet_propositions").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("projets").select("id, nom"),
    ]);
    if (p.error) throw p.error;
    return { props: (p.data ?? []) as Proposition[], projets: (pj.data ?? []) as Pick<Projet, "id" | "nom">[] };
  }, [dataVersion]);

  if (!me.is_admin) return (<><Topbar title="Propositions" backTo /><main className="content"><Empty>Réservé aux admins.</Empty></main></>);

  const projetNom = (id: string) => q.data?.projets.find((x) => x.id === id)?.nom ?? "Projet supprimé";
  const attente = (q.data?.props ?? []).filter((x) => x.statut === "en_attente");
  const traitees = (q.data?.props ?? []).filter((x) => x.statut !== "en_attente");

  async function accepter(x: Proposition) {
    setBusyId(x.id);
    try {
      // Compte existant avec cet email : on l'ajoute simplement au projet
      let profileId = people.find((p) => p.email.toLowerCase() === x.email.toLowerCase())?.id;
      let newCreds: Creds | null = null;
      if (!profileId) {
        const res = await adminUsers<{ id: string; password: string }>({
          action: "create", prenom: x.prenom, nom: x.nom, email: x.email, fonction: x.fonction ?? "",
          is_admin: false, is_bureau: false, is_ca: false, is_associations: false,
          assoc_modification: false, assoc_suppression: false, is_projets: true, projet_creation: false,
        });
        profileId = res.id;
        newCreds = { prenom: x.prenom, email: x.email, password: res.password, reset: false };
      }
      const { error: mErr } = await supabase.from("projet_membres").upsert({ projet_id: x.projet_id, profile_id: profileId }, { onConflict: "projet_id,profile_id" });
      if (mErr) throw mErr;
      const { error } = await supabase.from("projet_propositions").update({
        statut: "acceptee", decided_by: me.id, decided_at: new Date().toISOString(), profile_id: profileId,
      }).eq("id", x.id);
      if (error) throw error;
      await refreshPeople();
      bump();
      if (newCreds) setCreds(newCreds); else toast(`${x.prenom} ${x.nom} avait déjà un compte : ajouté(e) au projet`);
    } catch (err) {
      toast(errMsg(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <Topbar title="Propositions de membres" backTo />
      <main className="content">
        <p className="muted small" style={{ marginTop: 0 }}>
          Personnes proposées par les créateurs de projets.
          <br />Accepter crée le compte (accès Projets uniquement) et l'ajoute au projet.
        </p>
        <ErrorBox msg={q.error} />
        {q.loading && !q.data ? <Spinner /> : (
          <>
            <div className="section-title">En attente ({attente.length})</div>
            {attente.length === 0 ? (
              <div className="card"><Empty icon={<ICheck />}>Aucune proposition en attente.</Empty></div>
            ) : (
              <div className="stack">
                {attente.map((x) => {
                  const auteur = x.proposed_by ? peopleById.get(x.proposed_by) : null;
                  const existe = people.find((p) => p.email.toLowerCase() === x.email.toLowerCase());
                  return (
                    <div key={x.id} className="card stack">
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 17, color: "var(--green)" }}>{x.prenom} {x.nom}</div>
                        {x.fonction && <div className="small" style={{ color: "var(--accent)", fontWeight: 600 }}>{x.fonction}</div>}
                        <div className="small muted" style={{ wordBreak: "break-word" }}>{x.email}</div>
                      </div>
                      <dl className="kv small">
                        <dt>Projet</dt><dd>{projetNom(x.projet_id)}</dd>
                        <dt>Proposé par</dt><dd>{auteur ? fullName(auteur) : "Inconnu"}</dd>
                        <dt>Le</dt><dd>{fmtDateTime(x.created_at)}</dd>
                      </dl>
                      {x.message && <div className="alert info small prose">{x.message}</div>}
                      {existe && <div className="alert info small">Un compte existe déjà avec cet email ({fullName(existe)}) : accepter l'ajoutera simplement au projet.</div>}
                      <div className="row" style={{ gap: 8 }}>
                        <button className="btn primary" style={{ flex: 1 }} disabled={busyId === x.id} onClick={() => accepter(x)}>
                          {busyId === x.id ? "Création…" : "Accepter"}
                        </button>
                        <button className="btn danger" style={{ flex: 1 }} disabled={busyId === x.id} onClick={() => setRefus(x)}>Refuser</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {traitees.length > 0 && (
              <>
                <div className="section-title">Déjà traitées</div>
                <div className="stack">
                  {traitees.map((x) => {
                    const d = x.decided_by ? peopleById.get(x.decided_by) : null;
                    return (
                      <div key={x.id} className="propo-line">
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="t">{x.prenom} {x.nom}</div>
                          <div className="d">{projetNom(x.projet_id)}{d ? ` · par ${fullName(d)}` : ""}{x.motif ? ` · ${x.motif}` : ""}</div>
                        </div>
                        <span className={`badge ${x.statut === "acceptee" ? "s-terminee" : "s-retard"}`}>{x.statut === "acceptee" ? "Acceptée" : "Refusée"}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </main>
      {refus && <RefusSheet x={refus} onClose={() => setRefus(null)} onDone={() => { setRefus(null); toast("Proposition refusée"); bump(); }} />}
      {creds && <CredsSheet c={creds} onClose={() => setCreds(null)} />}
    </>
  );
}

function RefusSheet({ x, onClose, onDone }: { x: Proposition; onClose: () => void; onDone: () => void }) {
  const { me } = useApp();
  const [motif, setMotif] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet title={`Refuser ${x.prenom} ${x.nom}`} onClose={onClose}>
      <form className="stack-lg" onSubmit={async (e) => {
        e.preventDefault();
        const { error } = await supabase.from("projet_propositions").update({
          statut: "refusee", decided_by: me.id, decided_at: new Date().toISOString(), motif: motif.trim() || null,
        }).eq("id", x.id);
        if (error) setError(errMsg(error)); else onDone();
      }}>
        <label className="field"><span>Motif <span className="hint">(facultatif, visible par la personne qui a proposé)</span></span>
          <textarea className="textarea" value={motif} onChange={(e) => setMotif(e.target.value)} />
        </label>
        <ErrorBox msg={error} />
        <button className="btn danger block">Confirmer le refus</button>
      </form>
    </Sheet>
  );
}

export function PropositionsLink({ count }: { count: number }) {
  const { go } = useApp();
  return (
    <button className="list-item" onClick={() => go({ v: "propositions" })}>
      <IUsers width={24} className="muted" />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600 }}>Propositions de membres</div>
        <div className="tiny muted">Nouvelles personnes proposées pour les projets</div>
      </div>
      {count > 0 && <span className="count-pill">{count}</span>}
    </button>
  );
}
