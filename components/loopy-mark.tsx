import Image from "next/image";

type LoopyMarkProps = {
  size?: "small" | "medium" | "login" | "hero";
  mood?: "happy" | "alert";
};

export function LoopyMark({ size = "medium", mood = "happy" }: LoopyMarkProps) {
  return (
    <span className={`loopy loopy-${size}`} data-mood={mood} aria-hidden="true">
      <Image
        className="loopy-logo-image"
        src="/brand/loopicafe-logo.webp"
        alt=""
        width={512}
        height={512}
        sizes={size === "hero" ? "230px" : size === "login" ? "104px" : size === "medium" ? "64px" : "34px"}
        unoptimized
      />
    </span>
  );
}
