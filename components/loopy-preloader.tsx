"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { LoopyMark } from "./loopy-mark";

export type LoopyPreloaderVariant = "welcome" | "depart" | "success";

export function LoopyPreloader({
  visible,
  variant = "welcome",
  progress,
  message,
}: {
  visible: boolean;
  variant?: LoopyPreloaderVariant | string;
  progress?: number;
  message?: string;
}) {
  const shouldReduceMotion = useReducedMotion();
  const normalizedProgress = typeof progress === "number"
    ? Math.min(100, Math.max(0, progress))
    : null;
  const statusMessage = message ?? (
    variant === "depart"
      ? "Đang đăng xuất an toàn..."
      : variant === "success"
        ? "Đã hoàn tất, đang chuyển trang..."
        : "Đang tải dữ liệu hệ thống..."
  );

  return (
    <AnimatePresence mode="wait">
      {visible && (
        <motion.div
          key="loopy-single-preloader"
          className="loopy-preloader loopy-preloader--minimal"
          data-variant={variant}
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-label={statusMessage}
          initial={false}
          animate={{ opacity: 1 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 1.02 }}
          transition={{ duration: shouldReduceMotion ? 0.12 : 0.25, ease: "easeOut" }}
        >
          <div className="loopy-preloader__soft-glow" aria-hidden="true" />
          <div className="loopy-preloader__content">
            <motion.div
              className="loopy-preloader__logo-card"
              initial={shouldReduceMotion ? false : { opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: shouldReduceMotion ? 0 : 0.28, ease: "easeOut" }}
            >
              <LoopyMark size="medium" />
            </motion.div>

            <motion.h1
              initial={shouldReduceMotion ? false : { opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: shouldReduceMotion ? 0 : 0.24, delay: 0.06 }}
            >
              LoopiCafe
            </motion.h1>

            <div
              className={`loopy-preloader__progress${normalizedProgress === null ? " is-indeterminate" : ""}`}
              role="progressbar"
              aria-label="Tiến trình đăng nhập"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={normalizedProgress ?? undefined}
              aria-valuetext={normalizedProgress === null ? statusMessage : `${Math.round(normalizedProgress)}% — ${statusMessage}`}
            >
              <span
                style={normalizedProgress === null
                  ? undefined
                  : { transform: `scaleX(${normalizedProgress / 100})` }}
              />
            </div>

            <p className="loopy-preloader__status">{statusMessage}</p>
          </div>

          <p className="loopy-preloader__footer">
            Hệ thống quản lý vận hành LoopiCafe <span aria-hidden="true">•</span> Phiên bản v2026.10
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
