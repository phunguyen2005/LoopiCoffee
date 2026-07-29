type LoopyMarkProps = {
  size?: "small" | "medium" | "hero";
  mood?: "happy" | "alert";
};

export function LoopyMark({ size = "medium", mood = "happy" }: LoopyMarkProps) {
  return (
    <span className={`loopy loopy-${size} loopy-${mood}`} aria-hidden="true">
      <span className="loopy-ear loopy-ear-left" />
      <span className="loopy-ear loopy-ear-right" />
      <span className="loopy-face">
        <span className="loopy-eye loopy-eye-left" />
        <span className="loopy-eye loopy-eye-right" />
        <span className="loopy-cheek loopy-cheek-left" />
        <span className="loopy-cheek loopy-cheek-right" />
        <span className="loopy-mouth" />
      </span>
    </span>
  );
}
