"use client";

import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";

export type StickerMood =
  | "hello"
  | "cheer"
  | "celebrate"
  | "worries"
  | "shy"
  | "checkin"
  | "checklist"
  | "working"
  | "success"
  | "panicked"
  | "investigating"
  | "sleeping"
  | "thinking"
  | "crying"
  | "alert"
  | "confused"
  | "calm";

const stickers: Record<StickerMood, { src: string; label: string }> = {
  hello: { src: "/mascots/loopy-hello.png", label: "Loopy chào bạn" },
  cheer: { src: "/mascots/loopy-cheer.png", label: "Loopy cổ vũ" },
  celebrate: { src: "/mascots/loopy-celebrate.png", label: "Loopy ăn mừng" },
  worries: { src: "/mascots/loopy-worries.png", label: "Loopy lo lắng" },
  shy: { src: "/mascots/loopy-shy.png", label: "Loopy ngại ngùng" },
  checkin: { src: "/mascots/loopy-checkin.png", label: "Loopy kiểm tra" },
  checklist: { src: "/mascots/loopy-checklist.png", label: "Loopy với checklist" },
  working: { src: "/mascots/loopy-working.png", label: "Loopy đang làm việc" },
  success: { src: "/mascots/loopy-success.png", label: "Loopy xác nhận hoàn tất" },
  panicked: { src: "/mascots/loopy-panicked.png", label: "Loopy hốt hoảng lo lắng" },
  investigating: { src: "/mascots/loopy-investigating.png", label: "Loopy soi kính lúp tìm kiếm" },
  sleeping: { src: "/mascots/loopy-sleeping.png", label: "Loopy ngủ gật Zzz" },
  thinking: { src: "/mascots/loopy-thinking.png", label: "Loopy đăm chiêu suy nghĩ" },
  crying: { src: "/mascots/loopy-crying.png", label: "Loopy mếu khóc sự cố" },
  alert: { src: "/mascots/loopy-panicked.png", label: "Loopy cảnh báo" },
  confused: { src: "/mascots/loopy-thinking.png", label: "Loopy thắc mắc" },
  calm: { src: "/mascots/loopy-hello.png", label: "Loopy điềm tĩnh" },
};

function StickerArtwork({ mood, size }: { mood: StickerMood; size: number }) {
  const sticker = stickers[mood];

  return (
    <Image
      className="loopy-sticker-image"
      src={sticker.src}
      alt=""
      width={size}
      height={size}
      sizes={`${size}px`}
      unoptimized
      draggable={false}
    />
  );
}

export function LoopySticker({
  mood,
  size = 160,
  className = "",
}: {
  mood: StickerMood;
  size?: number;
  className?: string;
}) {
  const sticker = stickers[mood];

  return (
    <span
      className={`loopy-sticker ${className}`}
      role="img"
      aria-label={sticker.label}
      style={{
        width: size,
      }}
    >
      <StickerArtwork mood={mood} size={size} />
    </span>
  );
}

export function MotionLoopySticker({
  mood,
  size = 160,
  className = "",
  animateMoodChange = true,
  interactive = true,
}: {
  mood: StickerMood;
  size?: number;
  className?: string;
  animateMoodChange?: boolean;
  interactive?: boolean;
}) {
  const sticker = stickers[mood];

  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={mood}
        initial={animateMoodChange ? { scale: 0.8, rotate: -6, opacity: 0 } : false}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        exit={animateMoodChange ? { scale: 0.8, opacity: 0 } : undefined}
        whileHover={interactive ? { scale: 1.08, rotate: [0, -3, 3, 0] } : undefined}
        whileTap={interactive ? { scale: 0.95 } : undefined}
        transition={{
          type: "spring",
          stiffness: 300,
          damping: 18,
          rotate: {
            duration: 0.35,
            ease: "easeInOut",
          },
        }}
        className={`loopy-sticker motion-loopy-interactive ${className}`}
        role="img"
        aria-label={sticker.label}
        style={{
          width: size,
        }}
      >
        <StickerArtwork mood={mood} size={size} />
      </motion.span>
    </AnimatePresence>
  );
}
