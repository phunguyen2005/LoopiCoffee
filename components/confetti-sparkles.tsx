"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
  rotation: number;
  vx: number;
  vy: number;
}

const COLORS = [
  "#d96d83", // burgundy/pink
  "#f4a9b7", // soft pink
  "#f4b85f", // amber gold
  "#4c9779", // mint green
  "#6f2939", // deep burgundy
];

export function TaskSparkleBurst({ active, onComplete }: { active: boolean; onComplete?: () => void }) {
  return active ? <ActiveTaskSparkleBurst onComplete={onComplete} /> : null;
}

function ActiveTaskSparkleBurst({ onComplete }: { onComplete?: () => void }) {
  const [finished, setFinished] = useState(false);
  const [particles] = useState<Particle[]>(() => Array.from({ length: 14 }).map((_, i) => {
      const angle = (i / 14) * Math.PI * 2 + (Math.random() * 0.4 - 0.2);
      const velocity = 40 + Math.random() * 50;
      return {
        id: Date.now() + i,
        x: Math.cos(angle) * velocity,
        y: Math.sin(angle) * velocity,
        size: Math.random() * 7 + 5,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        rotation: Math.random() * 360,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
      };
    }));

  useEffect(() => {
    const timer = setTimeout(() => {
      setFinished(true);
      onComplete?.();
    }, 700);

    return () => clearTimeout(timer);
  }, [onComplete]);

  if (finished) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-visible flex items-center justify-center z-20">
      <AnimatePresence>
        {particles.map((p) => (
          <motion.span
            key={p.id}
            initial={{ opacity: 1, scale: 0, x: 0, y: 0, rotate: 0 }}
            animate={{
              opacity: [1, 1, 0],
              scale: [0, 1.2, 0.4],
              x: p.x,
              y: p.y + 15, // slight gravity drop
              rotate: p.rotation + 180,
            }}
            transition={{ duration: 0.65, ease: "easeOut" }}
            style={{
              position: "absolute",
              width: p.size,
              height: p.size,
              borderRadius: p.id % 2 === 0 ? "50%" : "2px",
              backgroundColor: p.color,
              boxShadow: `0 0 8px ${p.color}`,
            }}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

export function CelebrationConfetti({ active }: { active: boolean }) {
  return active ? <ActiveCelebrationConfetti /> : null;
}
function ActiveCelebrationConfetti() {
  const [finished, setFinished] = useState(false);
  const [pieces] = useState(() => Array.from({ length: 40 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      delay: Math.random() * 0.4,
      size: Math.random() * 10 + 6,
      drift: Math.random() * 10 - 5,
      duration: 2.5 + Math.random() * 1.5,
    })));

  useEffect(() => {
    const timer = setTimeout(() => setFinished(true), 4500);
    return () => clearTimeout(timer);
  }, []);

  if (finished) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {pieces.map((p) => (
        <motion.div
          key={p.id}
          initial={{ y: -20, opacity: 1, x: `${p.left}vw`, rotate: 0 }}
          animate={{
            y: "105vh",
            opacity: [1, 1, 0],
            rotate: 720,
            x: `${p.left + p.drift}vw`,
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            ease: "easeOut",
          }}
          style={{
            position: "absolute",
            width: p.size,
            height: p.size * (p.id % 3 === 0 ? 1.5 : 1),
            borderRadius: p.id % 2 === 0 ? "50%" : "3px",
            backgroundColor: p.color,
          }}
        />
      ))}
    </div>
  );
}
