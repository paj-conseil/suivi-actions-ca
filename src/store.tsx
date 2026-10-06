import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase, type Profile, type Instance } from "./lib";

// ---------- Navigation légère (paramètres dans l'URL, bouton retour du téléphone géré) ----------
export type Route = { v: string; id?: string; [k: string]: string | undefined };

function readRoute(): Route {
  const p = new URLSearchParams(window.location.search);
  const r: Route = { v: p.get("v") || "home" };
  p.forEach((val, key) => { if (key !== "v") r[key] = val; });
  return r;
}
function toSearch(r: Route) {
  const p = new URLSearchParams();
  Object.entries(r).forEach(([k, v]) => { if (v) p.set(k, v); });
  return "?" + p.toString();
}

// ---------- Contexte applicatif ----------
interface Ctx {
  me: Profile;
  people: Profile[];
  peopleById: Map<string, Profile>;
  refreshPeople: () => Promise<void>;
  refreshMe: () => Promise<void>;
  instances: Instance[];
  route: Route;
  go: (r: Route, replace?: boolean) => void;
  back: (fallback?: Route) => void;
  toast: (msg: string) => void;
  dataVersion: number;
  bump: () => void;
}
const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error("Contexte manquant");
  return c;
};

export function AppProvider({ me, refreshMe, children }: { me: Profile; refreshMe: () => Promise<void>; children: ReactNode }) {
  const [people, setPeople] = useState<Profile[]>([]);
  const [route, setRoute] = useState<Route>(readRoute);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const depth = useRef(0);
  const timer = useRef<number>();

  const refreshPeople = useCallback(async () => {
    const { data } = await supabase.from("profiles").select("*").order("nom").order("prenom");
    setPeople((data as Profile[]) ?? []);
  }, []);
  useEffect(() => { refreshPeople(); }, [refreshPeople]);

  useEffect(() => {
    const onPop = () => { depth.current = Math.max(0, depth.current - 1); setRoute(readRoute()); window.scrollTo(0, 0); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const go = useCallback((r: Route, replace = false) => {
    if (replace) window.history.replaceState(null, "", toSearch(r));
    else { window.history.pushState(null, "", toSearch(r)); depth.current += 1; }
    setRoute(r);
    window.scrollTo(0, 0);
  }, []);

  const back = useCallback((fallback: Route = { v: "home" }) => {
    if (depth.current > 0) window.history.back();
    else go(fallback, true);
  }, [go]);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToastMsg(null), 2600);
  }, []);

  const instances = useMemo<Instance[]>(() => {
    const out: Instance[] = [];
    if (me.is_admin || me.is_bureau) out.push("bureau");
    if (me.is_admin || me.is_ca) out.push("ca");
    return out;
  }, [me]);

  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  const value: Ctx = {
    me, people, peopleById, refreshPeople, refreshMe, instances, route, go, back, toast,
    dataVersion, bump: () => setDataVersion((v) => v + 1),
  };
  return (
    <AppCtx.Provider value={value}>
      {children}
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </AppCtx.Provider>
  );
}

/** Petit utilitaire de chargement de données */
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fn().then((d) => { if (alive) { setData(d); setError(null); } })
      .catch((e) => { if (alive) setError(e?.message ?? String(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return { data, error, loading, reload: () => setN((x) => x + 1), setData };
}
