"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LoopySticker } from "./loopy-sticker";
import type { StickerMood } from "./loopy-sticker";
import { X, Sparkles, CheckCircle2, AlertTriangle, Info } from "lucide-react";

export type LoopyMood = StickerMood;

export interface ToastMessage {
  id: string;
  title: string;
  message?: string;
  mood?: LoopyMood;
  type?: "success" | "info" | "warning";
}

interface ToastContextType {
  showLoopyToast: (title: string, options?: { message?: string; mood?: LoopyMood; type?: "success" | "info" | "warning" }) => void;
  playChime: (type?: "success" | "pop") => void;
}

const ToastContext = createContext<ToastContextType>({
  showLoopyToast: () => {},
  playChime: () => {},
});

export function useLoopyToast() {
  return useContext(ToastContext);
}

// Web Audio API synth chime (no external audio assets needed!)
function triggerAudioChime(type: "success" | "pop" = "success") {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    if (type === "success") {
      // Pleasant dual chime (E5 -> G#5)
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = "sine";
      osc2.type = "sine";

      osc1.frequency.setValueAtTime(659.25, now); // E5
      osc2.frequency.setValueAtTime(830.61, now + 0.08); // G#5

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now + 0.08);
      osc1.stop(now + 0.35);
      osc2.stop(now + 0.35);
    } else {
      // Pop sound
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.06);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.08);
    }
  } catch {
    // Ignore audio context block policies
  }
}

export function LoopyToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const playChime = useCallback((type: "success" | "pop" = "success") => {
    triggerAudioChime(type);
  }, []);

  const showLoopyToast = useCallback(
    (
      title: string,
      options?: { message?: string; mood?: LoopyMood; type?: "success" | "info" | "warning" }
    ) => {
      const id = Math.random().toString(36).substring(2, 9);
      const mood = options?.mood ?? (options?.type === "warning" ? "worries" : "success");
      const newToast: ToastMessage = {
        id,
        title,
        message: options?.message,
        mood,
        type: options?.type ?? "success",
      };

      setToasts((prev) => [...prev.slice(-2), newToast]); // Limit to max 3 toasts
      triggerAudioChime(options?.type === "warning" ? "pop" : "success");

      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    []
  );

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showLoopyToast, playChime }}>
      {children}
      {/* Toast Container */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-3 max-w-sm pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 40, scale: 0.85 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 380, damping: 22 }}
              className="pointer-events-auto flex items-center gap-3 p-3.5 pr-4 rounded-2xl shadow-xl border bg-white text-slate-800 backdrop-blur-md"
              style={{
                borderColor:
                  toast.type === "warning"
                    ? "#f4b85f"
                    : toast.type === "info"
                    ? "#d96d83"
                    : "#4c9779",
                background: "linear-gradient(135deg, #ffffff 0%, #fffaf5 100%)",
                boxShadow: "0 14px 36px rgba(111, 41, 57, 0.16)",
              }}
            >
              <div className="relative shrink-0 flex items-center justify-center">
                <motion.div
                  animate={{ rotate: [0, -8, 8, 0], scale: [1, 1.1, 1] }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                >
                  <LoopySticker mood={toast.mood ?? "celebrate"} size={48} />
                </motion.div>
                <span className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm">
                  {toast.type === "warning" ? (
                    <AlertTriangle size={13} className="text-amber-500" />
                  ) : toast.type === "info" ? (
                    <Info size={13} className="text-pink-500" />
                  ) : (
                    <CheckCircle2 size={13} className="text-emerald-500" />
                  )}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-slate-900 leading-snug flex items-center gap-1.5">
                  {toast.title}
                </h4>
                {toast.message && (
                  <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{toast.message}</p>
                )}
              </div>

              <button
                onClick={() => removeToast(toast.id)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors"
                aria-label="Đóng thông báo"
              >
                <X size={15} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
