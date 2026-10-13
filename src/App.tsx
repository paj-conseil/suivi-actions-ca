import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { arrivedFromRecoveryLink, supabase, type Profile } from "./lib";
import { AppProvider, useApp } from "./store";
import { Login, ChangePassword } from "./pages/Auth";
import { Dashboard } from "./pages/Dashboard";
import { ActionsList, ActionDetail, ActionForm } from "./pages/Actions";
import { ReunionsList, ReunionDetail, ReunionForm } from "./pages/Reunions";
import { UsersPage } from "./pages/Users";
import { ProfilePage } from "./pages/Profile";
import { AssociationsPage, AdminDocDetail, AdminDocForm } from "./pages/Associations";
import { canAssociations, canProjets } from "./lib";
import { ProjetsList, ProjetDetail, ProjetForm, TacheDetail, TacheForm } from "./pages/Projets";
import { PropositionsPage, usePropositionsEnAttente } from "./pages/Propositions";
import { InstallPrompt } from "./components/InstallPrompt";
import { Spinner } from "./components/ui";
import { IBuilding, ICalendar, IFolder, IHome, IList, IUser } from "./components/Icons";

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [recovery, setRecovery] = useState(arrivedFromRecoveryLink);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (event === "SIGNED_OUT") { setRecovery(false); setProfile(undefined); }
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadProfile = useCallback(async () => {
    if (!session) return;
    const { data, error } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
    setProfile(error ? null : (data as Profile | null));
  }, [session]);

  useEffect(() => {
    if (session) loadProfile();
  }, [session?.user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (session === undefined || (session && profile === undefined)) return <Spinner />;
  if (!session) return <Login />;

  if (!profile || !profile.actif) {
    return (
      <div className="auth-wrap stack-lg">
        <div className="alert error">
          Votre compte n'a pas accès à l'application.
          <br />Contactez un admin.
        </div>
        <button className="btn block" onClick={() => supabase.auth.signOut()}>Se déconnecter</button>
      </div>
    );
  }

  if (recovery || profile.must_change_password) {
    return (
      <ChangePassword
        reason={recovery ? "recovery" : "first"}
        onDone={async () => { setRecovery(false); await loadProfile(); }}
      />
    );
  }

  return (
    <AppProvider me={profile} refreshMe={loadProfile}>
      <Shell />
    </AppProvider>
  );
}

function Shell() {
  const { route, go, me, instances } = useApp();
  const enAttente = usePropositionsEnAttente();
  // Un compte sans accès aux conseils (par exemple « Projets » seul) n'a pas d'accueil ni d'actions
  const conseils = instances.length > 0;
  const projetsMatch = ["projets", "projet", "projet-form", "tache", "tache-form"];
  const tabs = [
    ...(conseils ? [
      { v: "home", label: "Accueil", icon: <IHome />, match: ["home"] },
      { v: "actions", label: "Actions", icon: <IList />, match: ["actions", "action", "action-form"] },
      { v: "reunions", label: "Réunions", icon: <ICalendar />, match: ["reunions", "reunion", "reunion-form"] },
    ] : []),
    ...(canAssociations(me) ? [{ v: "associations", label: "Associations", icon: <IBuilding />, match: ["associations", "doc", "doc-form"] }] : []),
    ...(canProjets(me) ? [{ v: "projets", label: "Projets", icon: <IFolder />, match: conseils ? projetsMatch : [...projetsMatch, "home"] }] : []),
    { v: "profile", label: me.is_admin ? "Réglages" : "Profil", icon: <IUser />, match: ["profile", "users", "propositions"], badge: enAttente },
  ];

  let page;
  switch (route.v) {
    case "actions": page = <ActionsList />; break;
    case "action": page = <ActionDetail id={route.id!} />; break;
    case "action-form": page = <ActionForm id={route.id} reunionId={route.reunion} instance={route.instance} />; break;
    case "reunions": page = <ReunionsList />; break;
    case "reunion": page = <ReunionDetail id={route.id!} />; break;
    case "reunion-form": page = <ReunionForm id={route.id} instance={route.instance} />; break;
    case "associations": page = <AssociationsPage />; break;
    case "doc": page = <AdminDocDetail id={route.id!} />; break;
    case "doc-form": page = <AdminDocForm id={route.id} assoc={route.assoc} renew={route.renew} />; break;
    case "projets": page = <ProjetsList />; break;
    case "projet": page = <ProjetDetail id={route.id!} />; break;
    case "projet-form": page = <ProjetForm id={route.id} />; break;
    case "tache": page = <TacheDetail id={route.id!} />; break;
    case "tache-form": page = <TacheForm id={route.id} projet={route.projet} theme={route.theme} parent={route.parent} />; break;
    case "propositions": page = <PropositionsPage />; break;
    case "users": page = me.is_admin ? <UsersPage /> : <Dashboard />; break;
    case "profile": page = <ProfilePage />; break;
    default:
      page = conseils ? <Dashboard />
        : canProjets(me) ? <ProjetsList />
          : canAssociations(me) ? <AssociationsPage />
            : <ProfilePage />;
  }

  return (
    <div className="app">
      {page}
      <InstallPrompt />
      <nav className="tabbar" aria-label="Navigation principale">
        {tabs.map((t) => (
          <button key={t.v} className={`tab ${t.match.includes(route.v) ? "active" : ""}`}
            aria-current={t.match.includes(route.v) ? "page" : undefined}
            onClick={() => go({ v: t.v })}>
            <span className="tab-ico">{t.icon}{"badge" in t && (t as { badge?: number }).badge ? <span className="tab-badge">{(t as { badge?: number }).badge}</span> : null}</span>{t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
