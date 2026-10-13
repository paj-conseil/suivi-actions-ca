// Installation de l'application sur l'écran d'accueil (PWA)

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let deferred: BIPEvent | null = null;
let installedNow = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());

// Chrome et Edge (Android, ordinateur) proposent l'installation via cet événement : on le garde pour le bouton
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferred = e as BIPEvent;
  notify();
});
window.addEventListener("appinstalled", () => { deferred = null; installedNow = true; notify(); });

export function onInstallChange(f: () => void) { listeners.add(f); return () => { listeners.delete(f); }; }
export const canPromptInstall = () => !!deferred;

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  notify();
  return outcome === "accepted";
}

export type Device = {
  os: "ios" | "android" | "desktop";
  browser: "safari" | "chrome" | "edge" | "firefox" | "samsung" | "inapp" | "other";
  model: string;
  installed: boolean;
};

export function detectDevice(): Device {
  const ua = navigator.userAgent;
  const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  const os: Device["os"] = /iPhone|iPad|iPod/.test(ua) || iPadOS ? "ios" : /Android/.test(ua) ? "android" : "desktop";

  let browser: Device["browser"] = "other";
  if (/FBAN|FBAV|Instagram|LinkedInApp|Line\/|WhatsApp|GSA\//.test(ua)) browser = "inapp";
  else if (/SamsungBrowser/.test(ua)) browser = "samsung";
  else if (/EdgiOS|EdgA|Edg\//.test(ua)) browser = "edge";
  else if (/CriOS|Chrome\//.test(ua)) browser = "chrome";
  else if (/FxiOS|Firefox\//.test(ua)) browser = "firefox";
  else if (/Safari\//.test(ua)) browser = "safari";

  let model = os === "ios" ? (/iPad/.test(ua) || iPadOS ? "iPad" : "iPhone") : os === "android" ? "téléphone Android" : "ordinateur";
  if (os === "android") {
    const m = ua.match(/Android [\d.]+; ([^;)]+?)(?: Build|\))/);
    const raw = m?.[1]?.trim();
    if (raw && raw !== "K" && !/^wv$/.test(raw)) model = /^SM-/.test(raw) ? `Samsung Galaxy (${raw})` : raw;
  }

  const installed = installedNow
    || window.matchMedia?.("(display-mode: standalone)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;

  return { os, browser, model, installed };
}

// ---------- Proposition automatique à l'ouverture ----------
const KEY_DONE = "gsca:install:done";
const KEY_LATER = "gsca:install:later";
const LATER_DAYS = 7;

function get(k: string) { try { return localStorage.getItem(k); } catch { return null; } }
function set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* stockage indisponible */ } }

window.addEventListener("appinstalled", () => set(KEY_DONE, "1"));

export const markInstalled = () => set(KEY_DONE, "1");
export const remindLater = () => set(KEY_LATER, String(Date.now()));

/** Vrai si l'application est déjà installée sur ce téléphone (quand le navigateur sait le dire) */
async function alreadyInstalled(): Promise<boolean> {
  const n = navigator as Navigator & { getInstalledRelatedApps?: () => Promise<unknown[]> };
  if (typeof n.getInstalledRelatedApps !== "function") return false;
  try { return (await n.getInstalledRelatedApps()).length > 0; } catch { return false; }
}

/** Faut-il proposer l'installation maintenant ? Uniquement sur smartphone, hors application installée, si l'utilisateur ne l'a pas déjà fait */
export async function shouldProposeInstall(): Promise<boolean> {
  const d = detectDevice();
  if (d.os === "desktop" || d.installed) {
    if (d.installed) set(KEY_DONE, "1");
    return false;
  }
  if (get(KEY_DONE)) return false;
  const later = Number(get(KEY_LATER) ?? 0);
  if (later && Date.now() - later < LATER_DAYS * 86400000) return false;
  if (await alreadyInstalled()) { set(KEY_DONE, "1"); return false; }
  return true;
}
