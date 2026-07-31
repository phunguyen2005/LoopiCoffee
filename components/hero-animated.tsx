"use client";

import Link from "next/link";
import React, { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  MapPin,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

const landingExpressions = [
  {
    mood: "hello",
    src: "/mascots/loopy-hello.png",
    bubble: "Hôm nay quán ổn nè! ♡",
    subtitle: "Bấm vào Loopy để xem biểu cảm ✨",
  },
  {
    mood: "investigating",
    src: "/mascots/loopy-investigating.png",
    bubble: "Đang soi kỹ dữ liệu vận hành... 🔍",
    subtitle: "Kiểm tra vị trí chính xác!",
  },
  {
    mood: "thinking",
    src: "/mascots/loopy-thinking.png",
    bubble: "Hừm, tối ưu lịch làm tuần này thế nào nhỉ? 🤔",
    subtitle: "Phân ca tự động!",
  },
  {
    mood: "cheer",
    src: "/mascots/loopy-cheer.png",
    bubble: "Cố lên! Một ngày bán đắt hàng nhé! 🎉",
    subtitle: "Tạo động lực cho nhân sự!",
  },
  {
    mood: "sleeping",
    src: "/mascots/loopy-sleeping.png",
    bubble: "Zzz... Đóng cửa an toàn, an tâm ngủ ngon 😴",
    subtitle: "Theo dõi từ xa 24/7!",
  },
  {
    mood: "celebrate",
    src: "/mascots/loopy-celebrate.png",
    bubble: "Tuyệt vời! Quản lý nhẹ nhàng, quán phát triển! ✨",
    subtitle: "Trải nghiệm mượt mà!",
  },
];

export function HeroAnimated() {
  const shouldReduceMotion = useReducedMotion();
  const [hasLanded, setHasLanded] = useState(false);
  const [expressionIndex, setExpressionIndex] = useState(0);

  const currentExpr = landingExpressions[expressionIndex];

  const handleMascotClick = () => {
    setExpressionIndex((prev) => (prev + 1) % landingExpressions.length);
  };

  // Left copy container staggered variants
  const copyContainerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: shouldReduceMotion ? 0 : 0.12,
        delayChildren: shouldReduceMotion ? 0 : 0.05,
      },
    },
  };

  const copyItemVariants = {
    hidden: {
      opacity: 0,
      x: shouldReduceMotion ? 0 : -40,
    },
    visible: {
      opacity: 1,
      x: 0,
      transition: {
        duration: 0.55,
        ease: [0.25, 1, 0.5, 1] as const,
      },
    },
  };

  // Background circle glow variants (animates in simultaneously with mascot)
  const glowVariants = {
    hidden: {
      opacity: 0,
      scale: shouldReduceMotion ? 1 : 0.4,
    },
    visible: {
      opacity: 1,
      scale: 1,
      transition: shouldReduceMotion
        ? { duration: 0.3 }
        : {
            delay: 0.35,
            type: "spring" as const,
            stiffness: 180,
            damping: 15,
          },
    },
  };

  // Mascot spring jump animation
  const mascotVariants = {
    hidden: {
      opacity: 0,
      y: shouldReduceMotion ? 0 : 280,
      scale: shouldReduceMotion ? 1 : 0.85,
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: shouldReduceMotion
        ? { duration: 0.3 }
        : {
            delay: 0.35,
            type: "spring" as const,
            stiffness: 190,
            damping: 14,
            bounce: 0.55,
          },
    },
  };

  // Card 1: Top Left
  const card1Variants = {
    hidden: {
      opacity: 0,
      scale: shouldReduceMotion ? 1 : 0.3,
      x: shouldReduceMotion ? 0 : 50,
      y: shouldReduceMotion ? 0 : 40,
    },
    visible: {
      opacity: 1,
      scale: 1,
      x: 0,
      y: 0,
      transition: shouldReduceMotion
        ? { duration: 0.2, delay: 0.2 }
        : {
            delay: 0.95,
            type: "spring" as const,
            stiffness: 240,
            damping: 17,
          },
    },
  };

  // Card 2: Bottom Right
  const card2Variants = {
    hidden: {
      opacity: 0,
      scale: shouldReduceMotion ? 1 : 0.3,
      x: shouldReduceMotion ? 0 : -50,
      y: shouldReduceMotion ? 0 : -35,
    },
    visible: {
      opacity: 1,
      scale: 1,
      x: 0,
      y: 0,
      transition: shouldReduceMotion
        ? { duration: 0.2, delay: 0.3 }
        : {
            delay: 1.15,
            type: "spring" as const,
            stiffness: 240,
            damping: 17,
          },
    },
  };

  // Card 3: Top Right (Speech Bubble & Status)
  const card3Variants = {
    hidden: {
      opacity: 0,
      scale: shouldReduceMotion ? 1 : 0.3,
      x: shouldReduceMotion ? 0 : -40,
      y: shouldReduceMotion ? 0 : 30,
    },
    visible: {
      opacity: 1,
      scale: 1,
      x: 0,
      y: 0,
      transition: shouldReduceMotion
        ? { duration: 0.2, delay: 0.4 }
        : {
            delay: 1.35,
            type: "spring" as const,
            stiffness: 260,
            damping: 16,
          },
    },
  };

  return (
    <section className="hero">
      {/* Left-side Headline, Description & CTA */}
      <motion.div
        className="hero-copy"
        variants={copyContainerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div className="eyebrow" variants={copyItemVariants}>
          <Sparkles size={15} /> Quản lý quán nhẹ nhàng hơn
        </motion.div>

        <motion.h1 variants={copyItemVariants}>
          Không có mặt,<br />
          vẫn nắm rõ tình hình quán.
        </motion.h1>

        <motion.p className="hero-lead" variants={copyItemVariants}>
          Biết ai đang làm, việc nào còn dang dở và quán có gì cần bạn chú ý.
        </motion.p>

        <motion.div className="hero-actions" variants={copyItemVariants}>
          <Link href="/auth/login" className="button button-large">
            Đăng nhập <ArrowRight size={18} />
          </Link>
          <a href="#video-demo" className="button-secondary button-large">
            Khám phá LoopiCafe
          </a>
        </motion.div>

        <motion.div className="trust-row" variants={copyItemVariants}>
          <span>
            <CheckCircle2 size={16} /> Không theo dõi vị trí liên tục
          </span>
          <span>
            <ShieldCheck size={16} /> Hình ảnh được bảo mật
          </span>
          <Link
            href="/camera-location-notice"
            className="nav-link"
            style={{ fontSize: 13, textDecoration: "underline" }}
          >
            Cách LoopiCafe bảo vệ dữ liệu
          </Link>
        </motion.div>
      </motion.div>

      {/* Right-side Loopy Mascot & 3 Outward Floating Cards */}
      <div
        className="hero-visual"
        aria-label="Minh họa trạng thái vận hành LoopiCafe"
      >
        <motion.div
          className="hero-glow"
          variants={glowVariants}
          initial="hidden"
          animate="visible"
        />

        {/* Mascot Wrapper */}
        <motion.div
          className="hero-mascot"
          variants={mascotVariants}
          initial="hidden"
          animate="visible"
          onClick={handleMascotClick}
          onAnimationComplete={() => setHasLanded(true)}
          whileHover={
            shouldReduceMotion
              ? undefined
              : {
                  scale: 1.07,
                  rotate: [0, -6, 6, -3, 3, 0],
                  transition: {
                    duration: 0.35,
                    ease: "easeInOut",
                  },
                }
          }
          whileTap={{ scale: 0.95 }}
          style={{ cursor: "pointer" }}
          title="Bấm để đổi biểu cảm Loopy!"
        >
          {/* Subtle idle breathing/floating animation after landing */}
          <motion.div
            key={currentExpr.mood}
            initial={{ scale: 0.85, opacity: 0.5, rotate: -8 }}
            animate={{
              scale: 1,
              opacity: 1,
              rotate: 0,
              y: hasLanded && !shouldReduceMotion ? [0, -8, 0] : 0,
            }}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 20,
              y: {
                duration: 3.6,
                repeat: Infinity,
                ease: "easeInOut",
              },
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentExpr.src}
              alt="Linh vật LoopiCafe HD"
              width={260}
              height={220}
              style={{
                objectFit: "contain",
                filter: "drop-shadow(0 14px 22px rgba(82, 43, 48, 0.14))",
              }}
            />
          </motion.div>

          {/* Card 2: Mascot Speech Bubble Status (Top Right) */}
          <motion.div
            key={`bubble-${currentExpr.mood}`}
            className="speech-bubble"
            variants={card3Variants}
            initial="hidden"
            animate="visible"
            whileHover={
              shouldReduceMotion
                ? undefined
                : {
                    y: -6,
                    scale: 1.05,
                    boxShadow: "0 22px 45px rgba(82, 43, 48, 0.16)",
                    transition: { duration: 0.2 },
                  }
            }
            style={{ cursor: "pointer" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <motion.span
                whileHover={shouldReduceMotion ? undefined : { scale: 1.25, rotate: 15 }}
                style={{ display: "inline-block" }}
              >
                <Sparkles size={14} className="text-[#f4b85f]" />
              </motion.span>
              <span>{currentExpr.bubble}</span>
            </div>
          </motion.div>
        </motion.div>

        {/* Card 1: Top Left Floating Card */}
        <motion.div
          className="floating-card floating-card-top"
          variants={card1Variants}
          initial="hidden"
          animate="visible"
          whileHover={
            shouldReduceMotion
              ? undefined
              : {
                  y: -6,
                  scale: 1.05,
                  boxShadow: "0 22px 45px rgba(82, 43, 48, 0.16)",
                  transition: { duration: 0.2 },
                }
          }
          style={{ cursor: "pointer" }}
        >
          <motion.span
            className="mini-icon mint"
            whileHover={shouldReduceMotion ? undefined : { scale: 1.2, rotate: -10 }}
          >
            <MapPin size={16} />
          </motion.span>
          <span>
            <strong>Đã ghi nhận vị trí</strong>
            <small>Chấm công tại quán</small>
          </span>
        </motion.div>

        {/* Card 3: Bottom Right Floating Card */}
        <motion.div
          className="floating-card floating-card-bottom"
          variants={card2Variants}
          initial="hidden"
          animate="visible"
          whileHover={
            shouldReduceMotion
              ? undefined
              : {
                  y: -6,
                  scale: 1.05,
                  boxShadow: "0 22px 45px rgba(82, 43, 48, 0.16)",
                  transition: { duration: 0.2 },
                }
          }
          style={{ cursor: "pointer" }}
        >
          <motion.span
            className="mini-icon pink"
            whileHover={shouldReduceMotion ? undefined : { scale: 1.2, rotate: 10 }}
          >
            <ClipboardCheck size={16} />
          </motion.span>
          <span>
            <strong>Ca sáng đã hoàn tất</strong>
            <small>6/6 công việc</small>
          </span>
        </motion.div>
      </div>
    </section>
  );
}
