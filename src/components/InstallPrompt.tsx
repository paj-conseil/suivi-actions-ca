import { useEffect, useState } from "react";
import { markInstalled, remindLater, shouldProposeInstall } from "../install";
import { Sheet } from "./ui";
import { InstallCard } from "./InstallCard";

/** Fenêtre proposée à l'ouverture sur smartphone pour ajouter GSCA à l'écran d'accueil */
export function InstallPrompt() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    const t = window.setTimeout(async () => { if (alive && await shouldProposeInstall()) setOpen(true); }, 1200);
    return () => { alive = false; window.clearTimeout(t); };
  }, []);
  if (!open) return null;
  const later = () => { remindLater(); setOpen(false); };
  return (
    <Sheet title="Installer GSCA sur votre téléphone" onClose={later}>
      <div className="stack-lg">
        <p className="small" style={{ margin: 0 }}>
          En une minute, GSCA apparaît sur votre écran d'accueil avec le logo de l'école.
          <br />Elle s'ouvre ensuite en plein écran, comme une vraie application.
        </p>
        <InstallCard compact />
        <button className="btn primary block" onClick={() => { markInstalled(); setOpen(false); }}>C'est fait</button>
        <button className="btn ghost block" onClick={later}>Plus tard</button>
      </div>
    </Sheet>
  );
}
