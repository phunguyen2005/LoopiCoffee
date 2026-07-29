type StickerMood =
  | "hello"
  | "celebrate"
  | "alert"
  | "calm"
  | "checklist"
  | "working"
  | "success"
  | "confused";

const positions: Record<StickerMood, [number, number]> = {
  hello: [0, 0],
  celebrate: [1, 0],
  alert: [2, 2],
  calm: [0, 3],
  working: [3, 4],
  checklist: [1, 5],
  success: [3, 6],
  confused: [0, 6],
};

export function LoopySticker({
  mood,
  size = 160,
  className = "",
}: {
  mood: StickerMood;
  size?: number;
  className?: string;
}) {
  const [column, row] = positions[mood];
  return (
    <span
      className={`loopy-sticker ${className}`}
      role="img"
      aria-label={`Loopy ${mood}`}
      style={{
        width: size,
        backgroundPosition: `${column * 33.3333}% ${row * 16.6667}%`,
      }}
    />
  );
}
