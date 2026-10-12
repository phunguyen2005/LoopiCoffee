"use client";

import React from "react";

interface LaBoongLogoProps {
  size?: "small" | "medium" | "large";
  showSubtitle?: boolean;
  className?: string;
  light?: boolean;
}

export function LaBoongLogo({
  size = "medium",
  showSubtitle = true,
  className = "",
  light = false,
}: LaBoongLogoProps) {
  const iconSize = size === "small" ? 28 : size === "large" ? 48 : 36;
  const primaryColor = light ? "#FAF7F2" : "#3D5A40";
  const secondaryColor = light ? "#E8EFE6" : "#634832";
  const textColor = light ? "#FAF7F2" : "#2B3E2D";

  return (
    <div className={`flex items-center gap-3 ${className}`} style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      {/* Authentic La Boong stylized 4-leaf windmill / tea clover icon */}
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ flexShrink: 0 }}
        aria-hidden="true"
      >
        {/* Top-left leaf petal */}
        <path
          d="M50 48C50 32 36 20 22 22C20 36 32 50 48 50L50 48Z"
          fill={primaryColor}
        />
        {/* Top-right leaf petal */}
        <path
          d="M48 50C32 50 20 64 22 78C36 80 50 68 50 52L48 50Z"
          fill={primaryColor}
          opacity="0.9"
        />
        {/* Bottom-right leaf petal */}
        <path
          d="M50 52C50 68 64 80 78 78C80 64 68 50 52 50L50 52Z"
          fill={primaryColor}
        />
        {/* Bottom-left leaf petal */}
        <path
          d="M52 50C68 50 80 36 78 22C64 20 50 32 50 48L52 50Z"
          fill={primaryColor}
          opacity="0.9"
        />
        {/* Center floral ring */}
        <circle cx="50" cy="50" r="7" fill={light ? "#3D5A40" : "#FAF7F2"} />
        {/* Traditional village house arch base below */}
        <path
          d="M38 88L50 76L62 88"
          stroke={secondaryColor}
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
        <span
          style={{
            fontFamily: "var(--font-heading, ui-sans-serif, system-ui, sans-serif)",
            fontWeight: 800,
            fontSize: size === "small" ? 17 : size === "large" ? 24 : 20,
            letterSpacing: "0.08em",
            color: textColor,
            textTransform: "uppercase",
          }}
        >
          LA BOONG
        </span>
        {showSubtitle && (
          <span
            style={{
              fontSize: size === "small" ? 9 : size === "large" ? 12 : 10,
              fontWeight: 600,
              letterSpacing: "0.14em",
              color: secondaryColor,
              textTransform: "uppercase",
              marginTop: 2,
            }}
          >
            Trà Ô Long Làng La Boong
          </span>
        )}
      </div>
    </div>
  );
}
