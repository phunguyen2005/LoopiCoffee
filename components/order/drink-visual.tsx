"use client";

import React from "react";

interface DrinkVisualProps {
  itemId: string;
  name: string;
  category?: string;
  imageUrl?: string;
  className?: string;
  aspectRatio?: "square" | "video" | "tall";
}

// Generate distinctive visual styling for each drink based on name and category
function getDrinkGradient(name: string): {

  bg: string;
  accent: string;
  cupType: "tall" | "cup" | "layered";
  badgeIcon: string;
  liquidTop: string;
  liquidBottom: string;
} {
  const lower = name.toLowerCase();

  // Matcha Săn Mây / Green drinks
  if (lower.includes("matcha")) {
    return {
      bg: "linear-gradient(145deg, #e8efe7 0%, #d5e2d3 100%)",
      accent: "#4e704f",
      cupType: "layered",
      badgeIcon: "🍵",
      liquidTop: "#fefcf9",
      liquidBottom: "#527556",
    };
  }

  // Fruit teas / Citrus / Berry
  if (lower.includes("chanh") || lower.includes("bưởi") || lower.includes("thanh mai") || lower.includes("mơ") || lower.includes("đỏ")) {
    return {
      bg: "linear-gradient(145deg, #fdf1e8 0%, #fae1d1 100%)",
      accent: "#c85a32",
      cupType: "tall",
      badgeIcon: "🍊",
      liquidTop: "#f4a261",
      liquidBottom: "#e76f51",
    };
  }

  // Cloud series (Săn mây, bồng bềnh)
  if (lower.includes("mây") || lower.includes("bồng bềnh") || lower.includes("tuyết")) {
    return {
      bg: "linear-gradient(145deg, #f5f0ea 0%, #ebe2d6 100%)",
      accent: "#d4a373",
      cupType: "layered",
      badgeIcon: "☁️",
      liquidTop: "#fffaf0",
      liquidBottom: "#c69c6d",
    };
  }

  // Coffee
  if (lower.includes("cà phê") || lower.includes("bạc xỉu")) {
    return {
      bg: "linear-gradient(145deg, #f2ece6 0%, #ded4cb 100%)",
      accent: "#5c4434",
      cupType: "cup",
      badgeIcon: "☕",
      liquidTop: "#f5ece2",
      liquidBottom: "#3d2b1f",
    };
  }

  // Peach / Lychee / Non-caffeine pink
  if (lower.includes("đào") || lower.includes("vải") || lower.includes("hồng")) {
    return {
      bg: "linear-gradient(145deg, #faece9 0%, #f7deda 100%)",
      accent: "#d66853",
      cupType: "tall",
      badgeIcon: "🍑",
      liquidTop: "#fdeced",
      liquidBottom: "#e2847a",
    };
  }

  // Standard Oolong Milk Tea default
  return {
    bg: "linear-gradient(145deg, #f7f3ec 0%, #eee6db 100%)",
    accent: "#634832",
    cupType: "tall",
    badgeIcon: "🧋",
    liquidTop: "#fdf8f0",
    liquidBottom: "#b8936d",
  };
}

export function DrinkVisual({
  name,
  className = "",
  aspectRatio = "square",
}: DrinkVisualProps) {
  const style = getDrinkGradient(name);
  const ratioClass =
    aspectRatio === "video"
      ? "aspect-video"
      : aspectRatio === "tall"
      ? "aspect-[3/4]"
      : "aspect-square";

  return (
    <div
      className={`relative w-full ${ratioClass} overflow-hidden rounded-2xl flex items-center justify-center select-none ${className}`}
      style={{
        background: style.bg,
        boxShadow: "inset 0 1px 2px rgba(255, 255, 255, 0.6)",
      }}
    >
      {/* Soft atmospheric ambient light */}
      <div
        className="absolute inset-0 pointer-events-none opacity-60"
        style={{
          background:
            "radial-gradient(circle at 65% 25%, rgba(255,255,255,0.85) 0%, transparent 65%)",
        }}
      />

      {/* Stylized Modern Beverage Illustration */}
      <div className="relative z-10 flex flex-col items-center justify-center">
        <svg
          width="130"
          height="150"
          viewBox="0 0 130 150"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="drop-shadow-md transition-transform duration-300 group-hover:scale-105"
        >
          {/* Glass cup contour */}
          <path
            d="M32 24L40 128C40.8 138 48 144 58 144H72C82 144 89.2 138 90 128L98 24H32Z"
            fill="rgba(255, 255, 255, 0.45)"
            stroke="rgba(255, 255, 255, 0.85)"
            strokeWidth="2.5"
          />

          {/* Liquid base layer */}
          <path
            d="M36 40L42 126C42.6 134 48 140 56 140H74C82 140 87.4 134 88 126L94 40C84 43 46 43 36 40Z"
            fill={style.liquidBottom}
            opacity="0.88"
          />

          {/* Foam / Cream / Cloud Layer */}
          <path
            d="M34 28C34 28 46 24 65 24C84 24 96 28 96 28L94 52C82 54 48 54 36 52L34 28Z"
            fill={style.liquidTop}
            opacity="0.95"
          />

          {/* Golden drizzle / sprinkles on foam */}
          <path
            d="M48 30C54 34 60 28 66 33C72 29 78 32 82 31"
            stroke={style.accent}
            strokeWidth="3"
            strokeLinecap="round"
            opacity="0.75"
          />

          {/* Ice cubes floating */}
          <rect
            x="48"
            y="54"
            width="15"
            height="15"
            rx="3"
            fill="rgba(255, 255, 255, 0.35)"
            stroke="rgba(255, 255, 255, 0.6)"
            strokeWidth="1"
            transform="rotate(12 48 54)"
          />
          <rect
            x="68"
            y="62"
            width="14"
            height="14"
            rx="3"
            fill="rgba(255, 255, 255, 0.3)"
            stroke="rgba(255, 255, 255, 0.55)"
            strokeWidth="1"
            transform="rotate(-15 68 62)"
          />

          {/* Boba pearls or fruit slices at the bottom */}
          <circle cx="52" cy="124" r="5" fill="#2b1f16" opacity="0.8" />
          <circle cx="64" cy="128" r="5.5" fill="#2b1f16" opacity="0.85" />
          <circle cx="76" cy="122" r="5" fill="#2b1f16" opacity="0.8" />
          <circle cx="58" cy="116" r="4.5" fill="#2b1f16" opacity="0.75" />
          <circle cx="70" cy="114" r="4.8" fill="#2b1f16" opacity="0.75" />

          {/* Glass reflection highlight */}
          <path
            d="M40 32L46 124"
            stroke="rgba(255, 255, 255, 0.7)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {/* Decorative category badge icon */}
      <span
        className="absolute bottom-2.5 right-2.5 text-xs px-2 py-1 rounded-full font-medium"
        style={{
          background: "rgba(255, 255, 255, 0.8)",
          color: style.accent,
          boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
        }}
      >
        {style.badgeIcon} La Boong
      </span>
    </div>
  );
}
