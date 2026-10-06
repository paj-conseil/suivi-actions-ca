import { useState } from "react";
import { supabase, fullName, assocNiveau } from "../lib";
import { useApp } from "../store";
import { Avatar, Topbar } from "../components/ui";
import { ChangePassword } from "./Auth";
import { InstallCard } from "../components/InstallCard";
import { IChevron, IUsers } from "../components/Icons";

export function ProfilePage() {
  const { me, toast, go } = useApp();
  const [changing, setChanging] = useState(false);
  return (
    <>
      <Topbar title={me.is_admin ? "Réglages" : "Profil"} />
      <main className="content">
        <div className="card row" style={{ gap: 14 }}>
          <Avatar p={me} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{fullName(me)}</div>
            {me.fonction && <div className="small" style={{ color: "var(--accent)", fontWeight: 600 }}>{me.fonction}</div>}
            <div className="small muted" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{me.email}</div>
          </div>
        </div>

        <div className="section-title">Application sur votre téléphone</div>
        <InstallCard />

        <div className="section-title">Mes accès</div>
        <div className="card row wrap" style={{ gap: 6 }}>
          {me.is_admin && <span className="badge role">Admin</span>}
          {me.is_bureau && <span className="badge instance-bureau">Conseil scolaire</span>}
          {me.is_ca && <span className="badge instance-ca">Conseil d'administration</span>}
          {assocNiveau(me) && <span className="badge role">{assocNiveau(me)}</span>}
        </div>

        {me.is_admin && (
          <>
            <div className="section-title">Administration</div>
            <button className="list-item" onClick={() => go({ v: "users" })}>
              <IUsers width={24} className="muted" />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>Membres et droits d'accès</div>
                <div className="tiny muted">Créer un compte, attribuer les accès, réinitialiser un mot de passe</div>
              </div>
              <IChevron width={20} className="muted" />
            </button>
          </>
        )}

        <div className="section-title">Sécurité</div>
        <div className="card">
          {changing ? (
            <ChangePassword reason="voluntary" onDone={() => { setChanging(false); toast("Mot de passe modifié"); }} />
          ) : (
            <button className="btn block" onClick={() => setChanging(true)}>Changer mon mot de passe</button>
          )}
        </div>

        <button className="btn block" style={{ marginTop: 24 }} onClick={() => supabase.auth.signOut()}>Se déconnecter</button>
      </main>
    </>
  );
}
