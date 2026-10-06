import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { canPromptInstall, detectDevice, onInstallChange, promptInstall } from "../install";
import { useApp } from "../store";

const APP_NAME = "CA GSCA";

// Pictogrammes reprenant les boutons des navigateurs, pour que la personne les reconnaisse
const ShareIOS = () => (
  <svg className="inline-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="bouton Partager">
    <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" /><path d="M8 10H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-2" />
  </svg>
);
const Dots = () => (
  <svg className="inline-ico" viewBox="0 0 24 24" fill="currentColor" aria-label="menu">
    <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
  </svg>
);
const PlusSquare = () => (
  <svg className="inline-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-label="Sur l'écran d'accueil">
    <rect x="4" y="4" width="16" height="16" rx="3" /><path d="M12 8v8M8 12h8" />
  </svg>
);

function AppPreview() {
  return (
    <div className="app-preview" aria-hidden>
      <img src="./icon-192.png" alt="" />
      <span>{APP_NAME}</span>
    </div>
  );
}

export function InstallCard() {
  const { toast } = useApp();
  const [dev, setDev] = useState(detectDevice);
  const [canPrompt, setCanPrompt] = useState(canPromptInstall());
  const [qr, setQr] = useState<string | null>(null);
  const url = window.location.origin + window.location.pathname;

  useEffect(() => onInstallChange(() => { setCanPrompt(canPromptInstall()); setDev(detectDevice()); }), []);
  useEffect(() => {
    if (dev.os !== "desktop") return;
    QRCode.toDataURL(url, { width: 220, margin: 1, color: { dark: "#163C3A", light: "#FFFFFF" } }).then(setQr).catch(() => setQr(null));
  }, [dev.os, url]);

  if (dev.installed) {
    return (
      <div className="card install-card">
        <div className="row" style={{ gap: 12 }}>
          <AppPreview />
          <div className="small"><strong>Application installée.</strong><br />Vous utilisez {APP_NAME} depuis l'écran d'accueil de votre {dev.model}.</div>
        </div>
      </div>
    );
  }

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(url); toast("Lien copié"); } catch { toast("Copie impossible"); }
  };

  return (
    <div className="card install-card stack">
      <div className="row" style={{ gap: 12 }}>
        <AppPreview />
        <div className="small">
          {dev.os === "desktop"
            ? <>Installez <strong>{APP_NAME}</strong> sur votre téléphone : l'application apparaîtra sur l'écran d'accueil avec le logo de l'école.</>
            : <>Votre appareil : <strong>{dev.model}</strong>.<br />Ajoutez <strong>{APP_NAME}</strong> à votre écran d'accueil pour l'ouvrir comme une application.</>}
        </div>
      </div>

      {canPrompt && (
        <button className="btn primary block" onClick={async () => { if (await promptInstall()) toast("Application installée"); }}>
          Installer {APP_NAME} sur {dev.os === "desktop" ? "cet ordinateur" : `ce ${dev.model === "iPad" ? "iPad" : "téléphone"}`}
        </button>
      )}

      {dev.os === "ios" && (
        dev.browser === "inapp" || dev.browser === "firefox" ? (
          <div className="alert info small">
            Ouvrez d'abord cette page dans <strong>Safari</strong> : copiez le lien ci-dessous et collez-le dans Safari.
            <br />L'ajout à l'écran d'accueil se fait ensuite depuis Safari.
          </div>
        ) : (
          <ol className="install-steps">
            <li>Touchez le bouton Partager <ShareIOS /> {dev.browser === "safari" ? "en bas de l'écran (ou en haut sur iPad)" : "dans la barre d'adresse"}.</li>
            <li>Faites défiler et choisissez <strong>« Sur l'écran d'accueil »</strong> <PlusSquare />.</li>
            <li>Vérifiez que le nom est <strong>{APP_NAME}</strong>, puis touchez <strong>« Ajouter »</strong>.</li>
          </ol>
        )
      )}

      {dev.os === "android" && !canPrompt && (
        dev.browser === "inapp" ? (
          <div className="alert info small">
            Ouvrez d'abord cette page dans <strong>Chrome</strong> : menu <Dots /> puis « Ouvrir dans Chrome ».
          </div>
        ) : dev.browser === "samsung" ? (
          <ol className="install-steps">
            <li>Touchez le menu <strong>≡</strong> en bas à droite.</li>
            <li>Choisissez <strong>« Ajouter la page à »</strong>, puis <strong>« Écran d'accueil »</strong>.</li>
            <li>Confirmez avec <strong>« Ajouter »</strong>.</li>
          </ol>
        ) : (
          <ol className="install-steps">
            <li>Touchez le menu <Dots /> en haut à droite de Chrome.</li>
            <li>Choisissez <strong>« Installer l'application »</strong> ou <strong>« Ajouter à l'écran d'accueil »</strong>.</li>
            <li>Confirmez avec <strong>« Installer »</strong>.</li>
          </ol>
        )
      )}

      {dev.os === "desktop" && (
        <div className="install-qr">
          {qr && <img src={qr} alt={`QR code vers ${url}`} width={180} height={180} />}
          <div className="small">
            Scannez ce code avec l'appareil photo de votre téléphone pour ouvrir l'application.
            <br />Revenez ensuite sur cette page Réglages depuis le téléphone : les instructions adaptées à votre modèle s'afficheront.
          </div>
        </div>
      )}

      <button className="btn ghost block small" onClick={copyLink}>Copier le lien de l'application</button>
    </div>
  );
}
