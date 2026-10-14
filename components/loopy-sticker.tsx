"use client";

import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { Mascot } from "page-mascot";

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
  hello: { src: "/mascots/loopy-hello.webp", label: "Loopy chào bạn" },
  cheer: { src: "/mascots/loopy-cheer.webp", label: "Loopy cổ vũ" },
  celebrate: { src: "/mascots/loopy-celebrate.webp", label: "Loopy ăn mừng" },
  worries: { src: "/mascots/loopy-worries.webp", label: "Loopy lo lắng" },
  shy: { src: "/mascots/loopy-shy.webp", label: "Loopy ngại ngùng" },
  checkin: { src: "/mascots/loopy-checkin.webp", label: "Loopy kiểm tra" },
  checklist: { src: "/mascots/loopy-checklist.webp", label: "Loopy với checklist" },
  working: { src: "/mascots/loopy-working.webp", label: "Loopy đang làm việc" },
  success: { src: "/mascots/loopy-success.webp", label: "Loopy xác nhận hoàn tất" },
  panicked: { src: "/mascots/loopy-panicked.webp", label: "Loopy hốt hoảng lo lắng" },
  investigating: { src: "/mascots/loopy-investigating.webp", label: "Loopy soi kính lúp tìm kiếm" },
  sleeping: { src: "/mascots/loopy-sleeping.webp", label: "Loopy ngủ gật Zzz" },
  thinking: { src: "/mascots/loopy-thinking.webp", label: "Loopy đăm chiêu suy nghĩ" },
  crying: { src: "/mascots/loopy-crying.webp", label: "Loopy mếu khóc sự cố" },
  alert: { src: "/mascots/loopy-panicked.webp", label: "Loopy cảnh báo" },
  confused: { src: "/mascots/loopy-thinking.webp", label: "Loopy thắc mắc" },
  calm: { src: "/mascots/loopy-hello.webp", label: "Loopy điềm tĩnh" },
};

export function InteractiveLoopyMascot({
  size = 140,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Mascot
      directions="/mascots/loopy-directions.webp"
      reactions="/mascots/loopy-reactions.webp"
      size={size}
      label="Loopy"
      className={`loopy-interactive-mascot ${className}`}
    />
  );
}

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
      // These small WebP assets are already compressed. Sticker sizes need not
      // match the image optimizer's allowed resize widths.
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
