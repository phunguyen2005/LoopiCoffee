"use client";

import React from "react";
import { normalizeMenuText } from "@/lib/menu-filter";

export type DrinkVisualType = "coffee" | "tea" | "milk_tea" | "topping" | "other";

export interface DrinkVisualProps {
  itemId?: string;
  name?: string;
  category?: string;
  imageUrl?: string;
  className?: string;
  aspectRatio?: "square" | "video" | "tall";
}

export function detectDrinkVisualType(name: string = "", category: string = ""): {
  type: DrinkVisualType;
  badgeLabel: string;
  badgeIcon: string;
} {
  const norm = normalizeMenuText(`${name} ${category}`);

  // 1. Topping / Dessert
  if (
    norm.includes("topping") ||
    norm.includes("tran chau") ||
    norm.includes("thach") ||
    norm.includes("pudding") ||
    norm.includes("kem trung") ||
    norm.includes("pho mai vien") ||
    norm.includes("kem cheese") ||
    norm.includes("flan")
  ) {
    return { type: "topping", badgeLabel: "Topping", badgeIcon: "🍮" };
  }

  // 2. Coffee / Bạc xỉu / Espresso
  if (
    norm.includes("ca phe") ||
    norm.includes("coffee") ||
    norm.includes("cafe") ||
    norm.includes("bac xiu") ||
    norm.includes("espresso") ||
    norm.includes("cold brew") ||
    norm.includes("americano") ||
    norm.includes("latte") ||
    norm.includes("cappuccino") ||
    norm.includes("phin")
  ) {
    return { type: "coffee", badgeLabel: "Cà phê", badgeIcon: "☕" };
  }

  // 3. Milk Tea / Săn mây / Ô long sữa
  if (
    norm.includes("tra sua") ||
    norm.includes("milk tea") ||
    norm.includes("milktea") ||
    norm.includes("san may") ||
    norm.includes("bong benh") ||
    norm.includes("o long sua") ||
    norm.includes("olong sua") ||
    norm.includes("nhai sua") ||
    norm.includes("sua tuoi") ||
    norm.includes("sua dua") ||
    norm.includes("gao khoi") ||
    norm.includes("olong nuong") ||
    norm.includes("o long nuong") ||
    norm.includes("mac ca")
  ) {
    return { type: "milk_tea", badgeLabel: "Trà sữa", badgeIcon: "🧋" };
  }

  // 4. Tea (Fruit tea, Pure tea, Herbal tea)
  if (
    norm.includes("tra") ||
    norm.includes("tea") ||
    norm.includes("o long") ||
    norm.includes("olong") ||
    norm.includes("hoa qua") ||
    norm.includes("chanh") ||
    norm.includes("buoi") ||
    norm.includes("dao") ||
    norm.includes("vai") ||
    norm.includes("thanh mai") ||
    norm.includes("mo xanh") ||
    norm.includes("hoa hong") ||
    norm.includes("matcha") ||
    norm.includes("luc tra") ||
    norm.includes("hong tra")
  ) {
    const isFruit = norm.includes("hoa qua") || norm.includes("chanh") || norm.includes("buoi") || norm.includes("dao") || norm.includes("vai");
    return {
      type: "tea",
      badgeLabel: isFruit ? "Trà hoa quả" : "Trà tươi",
      badgeIcon: isFruit ? "🍊" : "🍃",
    };
  }

  return { type: "other", badgeLabel: "Đồ uống", badgeIcon: "✨" };
}

export function DrinkVisual({
  name = "",
  category = "",
  className = "",
  aspectRatio = "square",
}: DrinkVisualProps) {
  const { type, badgeLabel, badgeIcon } = detectDrinkVisualType(name, category);
  const ratioClass =
    aspectRatio === "video"
      ? "aspect-video"
      : aspectRatio === "tall"
      ? "aspect-[3/4]"
      : "aspect-square";

  // Visual Theme Config
  const theme = React.useMemo(() => {
    switch (type) {
      case "coffee":
        return {
          bg: "linear-gradient(145deg, #f7efe6 0%, #e6d8c9 100%)",
          accent: "#543a29",
          badgeBg: "rgba(255, 255, 255, 0.9)",
          badgeText: "#4a3020",
        };
      case "tea":
        return {
          bg: "linear-gradient(145deg, #f3f8ee 0%, #dbecd0 100%)",
          accent: "#2e6a38",
          badgeBg: "rgba(255, 255, 255, 0.9)",
          badgeText: "#255c2f",
        };
      case "milk_tea":
        return {
          bg: "linear-gradient(145deg, #fcf4ea 0%, #f4e1cb 100%)",
          accent: "#8c532b",
          badgeBg: "rgba(255, 255, 255, 0.9)",
          badgeText: "#743f1b",
        };
      case "topping":
        return {
          bg: "linear-gradient(145deg, #fef4f0 0%, #fce1d9 100%)",
          accent: "#993556",
          badgeBg: "rgba(255, 255, 255, 0.9)",
          badgeText: "#802744",
        };
      default:
        return {
          bg: "linear-gradient(145deg, #f6f2ec 0%, #ede3d6 100%)",
          accent: "#5a4a42",
          badgeBg: "rgba(255, 255, 255, 0.9)",
          badgeText: "#42352e",
        };
    }
  }, [type]);

  return (
    <div
      className={`relative w-full ${ratioClass} overflow-hidden rounded-2xl flex items-center justify-center select-none ${className}`}
      style={{
        background: theme.bg,
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

      {/* SVG Cartoon Artwork per Category */}
      <div className="relative z-10 flex flex-col items-center justify-center">
        {type === "coffee" && (
          <svg
            width="130"
            height="140"
            viewBox="0 0 130 140"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="drop-shadow-md transition-transform duration-300 group-hover:scale-105"
            aria-label="Minh họa Cà phê"
          >
            {/* Steam waves */}
            <path
              d="M52 18C50 12 55 8 53 2"
              stroke="#8c6d58"
              strokeWidth="2.5"
              strokeLinecap="round"
              opacity="0.6"
            />
            <path
              d="M66 16C64 10 69 6 67 1"
              stroke="#8c6d58"
              strokeWidth="2.5"
              strokeLinecap="round"
              opacity="0.75"
            />
            <path
              d="M79 19C77 13 82 9 80 3"
              stroke="#8c6d58"
              strokeWidth="2.5"
              strokeLinecap="round"
              opacity="0.55"
            />

            {/* Coffee Saucer */}
            <ellipse cx="65" cy="130" rx="46" ry="7" fill="#d9c7b8" opacity="0.8" />
            <ellipse cx="65" cy="129" rx="38" ry="5" fill="#fdfbf9" />

            {/* Ceramic Mug Handle */}
            <path
              d="M84 48C98 48 102 62 102 74C102 86 94 96 82 98"
              stroke="#efe6dc"
              strokeWidth="7"
              strokeLinecap="round"
            />
            <path
              d="M84 50C95 50 98 62 98 73C98 84 91 93 82 95"
              stroke="#c5b2a2"
              strokeWidth="2"
              strokeLinecap="round"
            />

            {/* Coffee Mug Body */}
            <path
              d="M36 34H94L88 116C87.4 123 81 128 73 128H57C49 128 42.6 123 42 116L36 34Z"
              fill="#fffaf5"
              stroke="#e4d5c7"
              strokeWidth="2"
            />

            {/* Liquid / Espresso Layer */}
            <path
              d="M40 44L44 114C44.4 119 49 123 54 123H76C81 123 85.6 119 86 114L90 44C81 48 49 48 40 44Z"
              fill="url(#coffeeGradient)"
            />

            {/* Golden Crema & Foam Layer */}
            <ellipse cx="65" cy="45" rx="25" ry="6" fill="#c4976c" />
            <ellipse cx="64" cy="44" rx="21" ry="4.5" fill="#e8cfb3" />

            {/* Latte Heart / Crema Swirl */}
            <path
              d="M60 43C58 41 62 39 64 42C66 39 70 41 68 43L64 46L60 43Z"
              fill="#fffdf9"
              opacity="0.9"
            />

            {/* Floating Ice Cubes in Coffee */}
            <rect
              x="52"
              y="56"
              width="14"
              height="14"
              rx="3"
              fill="rgba(255, 255, 255, 0.35)"
              stroke="rgba(255, 255, 255, 0.65)"
              strokeWidth="1"
              transform="rotate(15 52 56)"
            />

            {/* Mug Specular Highlight */}
            <path
              d="M44 42L48 112"
              stroke="rgba(255, 255, 255, 0.85)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />

            {/* Roasted Coffee Bean icon on mug */}
            <ellipse cx="65" cy="88" rx="7" ry="5" fill="#4d3221" transform="rotate(-25 65 88)" />
            <path
              d="M61 90C63 87 67 89 69 86"
              stroke="#efe6dc"
              strokeWidth="1.2"
              strokeLinecap="round"
            />

            <defs>
              <linearGradient id="coffeeGradient" x1="65" y1="44" x2="65" y2="123" gradientUnits="userSpaceOnUse">
                <stop stopColor="#634531" />
                <stop offset="0.65" stopColor="#3d2719" />
                <stop offset="1" stopColor="#25160c" />
              </linearGradient>
            </defs>
          </svg>
        )}

        {type === "tea" && (
          <svg
            width="130"
            height="145"
            viewBox="0 0 130 145"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="drop-shadow-md transition-transform duration-300 group-hover:scale-105"
            aria-label="Minh họa Trà tươi"
          >
            {/* Green / Eco Straw */}
            <path
              d="M72 10L68 70"
              stroke="#388e3c"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <path
              d="M72 10L78 2"
              stroke="#388e3c"
              strokeWidth="4"
              strokeLinecap="round"
            />

            {/* Glass Contour */}
            <path
              d="M34 24L41 126C41.6 135 48.5 141 57.5 141H72.5C81.5 141 88.4 135 89 126L96 24H34Z"
              fill="rgba(255, 255, 255, 0.45)"
              stroke="rgba(255, 255, 255, 0.9)"
              strokeWidth="2.5"
            />

            {/* Clear Tea Liquid */}
            <path
              d="M37 38L43 124C43.5 131 48.5 136 56 136H74C81.5 136 86.5 131 87 124L93 38C84 41 46 41 37 38Z"
              fill="url(#teaGradient)"
              opacity="0.9"
            />

            {/* Floating Ice Cubes */}
            <rect
              x="50"
              y="48"
              width="16"
              height="16"
              rx="3"
              fill="rgba(255, 255, 255, 0.4)"
              stroke="rgba(255, 255, 255, 0.7)"
              strokeWidth="1.2"
              transform="rotate(18 50 48)"
            />
            <rect
              x="68"
              y="62"
              width="15"
              height="15"
              rx="3"
              fill="rgba(255, 255, 255, 0.35)"
              stroke="rgba(255, 255, 255, 0.65)"
              strokeWidth="1.2"
              transform="rotate(-12 68 62)"
            />

            {/* Fresh Fruit / Lemon slice */}
            <circle cx="56" cy="94" r="14" fill="#ffb703" opacity="0.85" />
            <circle cx="56" cy="94" r="11" fill="#fd9e02" opacity="0.9" />
            {/* Lemon segments */}
            <path d="M56 84V104M46 94H66M49 87L63 101M49 101L63 87" stroke="#fff8e7" strokeWidth="1.5" strokeLinecap="round" />

            {/* Fresh Tea Leaf */}
            <path
              d="M72 32C76 24 86 25 88 33C88 41 78 44 72 32Z"
              fill="#43a047"
            />
            <path
              d="M74 32C78 29 83 29 86 33"
              stroke="#c8e6c9"
              strokeWidth="1"
            />

            {/* Glass Reflection */}
            <path
              d="M41 30L46 122"
              stroke="rgba(255, 255, 255, 0.8)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />

            <defs>
              <linearGradient id="teaGradient" x1="65" y1="38" x2="65" y2="136" gradientUnits="userSpaceOnUse">
                <stop stopColor="#95d5b2" stopOpacity="0.8" />
                <stop offset="0.5" stopColor="#52b788" />
                <stop offset="1" stopColor="#2d6a4f" />
              </linearGradient>
            </defs>
          </svg>
        )}

        {type === "milk_tea" && (
          <svg
            width="130"
            height="145"
            viewBox="0 0 130 145"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="drop-shadow-md transition-transform duration-300 group-hover:scale-105"
            aria-label="Minh họa Trà sữa"
          >
            {/* Wide Boba Straw */}
            <path
              d="M68 6L64 55"
              stroke="#c85a32"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <path
              d="M68 6L74 -2"
              stroke="#c85a32"
              strokeWidth="5"
              strokeLinecap="round"
            />

            {/* Glass Cup Body */}
            <path
              d="M33 22L41 126C41.8 135 48.5 141 57.5 141H72.5C81.5 141 88.2 135 89 126L97 22H33Z"
              fill="rgba(255, 255, 255, 0.45)"
              stroke="rgba(255, 255, 255, 0.9)"
              strokeWidth="2.5"
            />

            {/* Creamy Milk Tea Base Layer */}
            <path
              d="M37 36L43 124C43.5 131 48.5 136 56 136H74C81.5 136 86.5 131 87 124L93 36C84 39 46 39 37 36Z"
              fill="url(#milkTeaGradient)"
            />

            {/* Bồng Bềnh / Săn Mây Thick Cloud Foam Cap */}
            <path
              d="M34 26C34 26 44 20 65 20C86 20 96 26 96 26L94 50C82 53 48 53 36 50L34 26Z"
              fill="#fffaf2"
              opacity="0.96"
            />

            {/* Caramel / Brown Sugar drizzle on cream */}
            <path
              d="M46 27C52 32 58 25 64 30C70 26 76 30 82 28"
              stroke="#965228"
              strokeWidth="2.5"
              strokeLinecap="round"
              opacity="0.8"
            />

            {/* Floating Ice Cubes */}
            <rect
              x="52"
              y="56"
              width="14"
              height="14"
              rx="3"
              fill="rgba(255, 255, 255, 0.35)"
              stroke="rgba(255, 255, 255, 0.6)"
              strokeWidth="1"
              transform="rotate(12 52 56)"
            />

            {/* Glossy Tapioca Boba Pearls */}
            <circle cx="50" cy="123" r="5.5" fill="#26170f" />
            <circle cx="62" cy="127" r="6" fill="#1f120b" />
            <circle cx="75" cy="122" r="5.5" fill="#2b1a11" />
            <circle cx="56" cy="115" r="5" fill="#24140c" />
            <circle cx="68" cy="114" r="5.2" fill="#1f120b" />
            <circle cx="80" cy="115" r="4.8" fill="#2b1a11" />
            {/* Boba pearl gloss highlights */}
            <circle cx="49" cy="121" r="1.3" fill="rgba(255, 255, 255, 0.6)" />
            <circle cx="61" cy="125" r="1.5" fill="rgba(255, 255, 255, 0.6)" />
            <circle cx="74" cy="120" r="1.3" fill="rgba(255, 255, 255, 0.6)" />

            {/* Glass Reflection */}
            <path
              d="M40 28L46 122"
              stroke="rgba(255, 255, 255, 0.75)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />

            <defs>
              <linearGradient id="milkTeaGradient" x1="65" y1="36" x2="65" y2="136" gradientUnits="userSpaceOnUse">
                <stop stopColor="#f3ddc8" />
                <stop offset="0.4" stopColor="#cca27e" />
                <stop offset="1" stopColor="#966743" />
              </linearGradient>
            </defs>
          </svg>
        )}

        {type === "topping" && (
          <svg
            width="130"
            height="135"
            viewBox="0 0 130 135"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="drop-shadow-md transition-transform duration-300 group-hover:scale-105"
            aria-label="Minh họa Topping"
          >
            {/* Dessert Spoon */}
            <path
              d="M86 28L98 12C101 8 106 10 105 14L93 35"
              stroke="#d5c1b2"
              strokeWidth="3.5"
              strokeLinecap="round"
            />

            {/* Dessert Coupe Bowl / Glass Plate */}
            <ellipse cx="65" cy="122" rx="34" ry="5.5" fill="#e6d4c6" opacity="0.8" />
            <path
              d="M62 108V122H68V108"
              fill="#f7ede4"
              stroke="#dfcdc0"
              strokeWidth="2"
            />
            {/* Glass Bowl Body */}
            <path
              d="M26 62C26 92 42 108 65 108C88 108 104 92 104 62H26Z"
              fill="rgba(255, 255, 255, 0.55)"
              stroke="rgba(255, 255, 255, 0.9)"
              strokeWidth="2.5"
            />

            {/* Wobbly Egg Pudding / Caramel Flan */}
            <path
              d="M44 68L48 94C48 97 54 100 65 100C76 100 82 97 82 94L86 68H44Z"
              fill="#fed976"
            />
            {/* Caramel Syrup Glaze */}
            <ellipse cx="65" cy="68" rx="21" ry="5.5" fill="#b05d23" />
            <path
              d="M50 69C50 75 54 78 55 83C56 78 61 74 63 80C65 74 72 75 74 81C76 75 80 73 80 69"
              fill="#b05d23"
            />

            {/* Mint leaf garnish */}
            <path
              d="M65 60C62 53 67 48 72 52C74 57 70 62 65 60Z"
              fill="#43a047"
            />
            <path
              d="M65 60C68 55 75 56 77 62C75 66 69 64 65 60Z"
              fill="#66bb6a"
            />

            {/* Shiny Boba Pearls surrounding flan */}
            <circle cx="38" cy="74" r="5" fill="#2b1a11" />
            <circle cx="92" cy="74" r="5" fill="#2b1a11" />
            <circle cx="44" cy="84" r="4.5" fill="#2b1a11" />
            <circle cx="86" cy="84" r="4.5" fill="#2b1a11" />

            {/* Glass reflection highlight */}
            <path
              d="M32 68C34 84 44 98 56 102"
              stroke="rgba(255, 255, 255, 0.85)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        )}

        {type === "other" && (
          <svg
            width="130"
            height="145"
            viewBox="0 0 130 145"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="drop-shadow-md transition-transform duration-300 group-hover:scale-105"
            aria-label="Minh họa Đồ uống"
          >
            {/* Modern Tumbler */}
            <path
              d="M34 26L41 126C41.8 135 48.5 141 57.5 141H72.5C81.5 141 88.2 135 89 126L96 26H34Z"
              fill="rgba(255, 255, 255, 0.45)"
              stroke="rgba(255, 255, 255, 0.9)"
              strokeWidth="2.5"
            />
            {/* Liquid */}
            <path
              d="M37 40L43 124C43.5 131 48.5 136 56 136H74C81.5 136 86.5 131 87 124L93 40C84 43 46 43 37 40Z"
              fill="url(#otherGradient)"
            />
            {/* Sparkles */}
            <circle cx="65" cy="70" r="3" fill="#ffffff" opacity="0.8" />
            <circle cx="55" cy="90" r="2.5" fill="#ffffff" opacity="0.7" />
            <circle cx="75" cy="85" r="2" fill="#ffffff" opacity="0.7" />
            {/* Glass Reflection */}
            <path
              d="M40 32L46 122"
              stroke="rgba(255, 255, 255, 0.8)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <defs>
              <linearGradient id="otherGradient" x1="65" y1="40" x2="65" y2="136" gradientUnits="userSpaceOnUse">
                <stop stopColor="#e29578" />
                <stop offset="1" stopColor="#b45309" />
              </linearGradient>
            </defs>
          </svg>
        )}
      </div>

      {/* Decorative category badge icon */}
      <span
        className="absolute bottom-2.5 right-2.5 text-xs px-2.5 py-1 rounded-full font-semibold shadow-xs flex items-center gap-1 select-none pointer-events-none"
        style={{
          background: theme.badgeBg,
          color: theme.badgeText,
          boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
        }}
      >
        <span>{badgeIcon}</span>
        <span>{badgeLabel}</span>
      </span>
    </div>
  );
}
