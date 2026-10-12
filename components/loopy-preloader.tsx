"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { LoopySticker } from "./loopy-sticker";
import { LoopyMark } from "./loopy-mark";

export type LoopyPreloaderVariant = "welcome" | "depart" | "success";

export function LoopyPreloader({
  visible,
}: {
  visible: boolean;
  variant?: LoopyPreloaderVariant | string;
}) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <AnimatePresence mode="wait">
      {visible && (
        <motion.div
          key="loopy-single-preloader"
          className="loopy-preloader loopy-preloader--minimal"
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-label="Đang tải..."
          initial={shouldReduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 1.02 }}
          transition={{ duration: shouldReduceMotion ? 0.12 : 0.25, ease: "easeOut" }}
        >
          <div className="loopy-preloader__soft-glow" aria-hidden="true" />

          <div className="flex flex-col items-center justify-center gap-6">
            {/* Mascot tượng trưng Loopy */}
            <motion.div
              className="relative flex items-center justify-center"
              initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.85, y: 8 }}
              animate={
                shouldReduceMotion
                  ? undefined
                  : {
                      opacity: 1,
                      scale: [1, 1.035, 1],
                      y: [0, -6, 0],
                    }
              }
              transition={
                shouldReduceMotion
                  ? { duration: 0 }
                  : {
                      opacity: { duration: 0.3 },
                      scale: { duration: 2.4, repeat: Infinity, ease: "easeInOut" },
                      y: { duration: 2.4, repeat: Infinity, ease: "easeInOut" },
                    }
              }
            >
              <div
                className="absolute inset-0 -m-6 rounded-full bg-radial from-[#f4a9b7]/25 via-[#f4b85f]/10 to-transparent blur-xl pointer-events-none"
                aria-hidden="true"
              />
              <LoopySticker mood="hello" size={160} />
            </motion.div>

            {/* Logo Laboong */}
            <motion.div
              initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1, duration: 0.25 }}
              className="flex items-center justify-center p-3 rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 shadow-lg"
              aria-hidden="true"
            >
              <LoopyMark size="medium" />
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
