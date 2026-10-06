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
