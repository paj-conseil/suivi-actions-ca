import { useEffect, useState, type ReactNode } from "react";
import {
  type Action, type Instance, type Profile, type Statut, echeanceText, fullName, initials,
  instanceShort, isClosed, sante, SANTE_LABEL, statutLabel,
} from "../lib";
import { useApp } from "../store";
import { IBack, IClock, IUser } from "./Icons";

export function Topbar({ title, backTo, right }: { title: string; backTo?: boolean; right?: ReactNode }) {
  const { back } = useApp();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const f = () => setScrolled(window.scrollY > 4);
    window.addEventListener("scroll", f, { passive: true });
    return () => window.removeEventListener("scroll", f);
  }, []);
  return (
    <header className={`topbar ${scrolled ? "scrolled" : ""}`}>
      {backTo && (
        <button className="icon-btn back" onClick={() => back()} aria-label="Retour"><IBack /></button>
      )}
      <h1>{title}</h1>
      {right}
    </header>
  );
}

export function InstanceBadge({ i }: { i: Instance }) {
  return <span className={`badge instance-${i}`}>{instanceShort(i)}</span>;
}

export function SanteBadge({ a }: { a: Pick<Action, "statut" | "echeance"> }) {
  const s = sante(a);
  return <span className={`badge s-${s}`}><span className="dot" />{SANTE_LABEL[s]}</span>;
}

export function StatutBadge({ s }: { s: Statut }) {
  return <span className={`badge s-${s}`}><span className="dot" />{statutLabel(s)}</span>;
}

export function Avatar({ p, sm }: { p?: Profile | null; sm?: boolean }) {
  return <span className={`avatar ${sm ? "sm" : ""}`} aria-hidden>{p ? initials(p) : <IUser width={16} />}</span>;
}

export function ActionCard({ a, showInstance = true }: { a: Action; showInstance?: boolean }) {
  const { go, peopleById } = useApp();
  const resp = a.responsable_id ? peopleById.get(a.responsable_id) : null;
  const s = sante(a);
  return (
    <button className={`action-card s-${s} ${isClosed(a.statut) ? "closed" : ""}`} onClick={() => go({ v: "action", id: a.id })}>
      <div className="title">{a.titre}</div>
      <div className="meta">
        <SanteBadge a={a} />
        {showInstance && <InstanceBadge i={a.instance} />}
        <span className="row" style={{ gap: 6 }}><Avatar p={resp} sm />{fullName(resp)}</span>
        <span className="row" style={{ gap: 4 }}><IClock width={15} height={15} />{echeanceText(a)}</span>
      </div>
    </button>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="grip" />
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

export function Empty({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return <div className="empty">{icon}<div>{children}</div></div>;
}

export const Spinner = () => <div className="spinner" aria-label="Chargement" />;

export function ErrorBox({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <div className="alert error" role="alert">{msg}</div>;
}

export function ConfirmButton({ label, confirmLabel, onConfirm, className = "btn danger block" }:
  { label: ReactNode; confirmLabel: string; onConfirm: () => void | Promise<void>; className?: string }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t); }, [armed]);
  return (
    <button className={className} disabled={busy} onClick={async () => {
      if (!armed) { setArmed(true); return; }
      setBusy(true);
      try { await onConfirm(); } finally { setBusy(false); setArmed(false); }
    }}>{armed ? confirmLabel : label}</button>
  );
}
