"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, X } from "lucide-react";

export function ConfirmDialog({
  open,
  title,
  description,
  details = [],
  confirmLabel,
  busy = false,
  tone = "danger",
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  details?: string[];
  confirmLabel: string;
  busy?: boolean;
  tone?: "danger" | "primary";
  onConfirm: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    window.setTimeout(() => closeRef.current?.focus(), 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCloseRef.current();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [busy, open]);

  if (!open) return null;
  return (
    <div className="confirm-dialog-layer" role="presentation">
      <button className="confirm-dialog-backdrop" type="button" aria-label="Đóng hộp xác nhận" onClick={() => !busy && onClose()} />
      <div className="confirm-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-description">
        <div className="confirm-dialog-heading">
          <span className={`confirm-dialog-icon ${tone}`}><AlertTriangle size={20} aria-hidden="true" /></span>
          <div><h2 id="confirm-dialog-title">{title}</h2><p id="confirm-dialog-description">{description}</p></div>
          <button ref={closeRef} className="icon-button" type="button" disabled={busy} onClick={onClose} aria-label="Đóng"><X size={18} /></button>
        </div>
        {details.length > 0 && <ul className="confirm-dialog-details">{details.map((detail) => <li key={detail}>{detail}</li>)}</ul>}
        <div className="confirm-dialog-actions">
          <button className="button-secondary" type="button" disabled={busy} onClick={onClose}>Hủy</button>
          <button className={tone === "danger" ? "button button-danger" : "button"} type="button" disabled={busy} onClick={onConfirm}>{busy ? "Đang xử lý…" : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
