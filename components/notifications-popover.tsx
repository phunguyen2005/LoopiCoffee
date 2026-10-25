"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useCallback } from "react";
import { Bell, Check, ChevronRight, X, Inbox } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { readJson } from "@/platform/http/client";
import {
  formatRelativeTime,
  getNotificationMeta,
  type LoopiNotificationItem,
} from "@/lib/notifications";

export function NotificationsPopover({
  unreadCount,
  onUnreadCountChange,
  iconSize = 17,
}: {
  unreadCount: number;
  onUnreadCountChange?: (count: number) => void;
  iconSize?: number;
}) {
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<LoopiNotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await readJson<{ notifications: LoopiNotificationItem[] }>(
        await fetch("/api/notifications", { cache: "no-store" })
      );
      const list = payload.notifications ?? [];
      setItems(list);
      const count = list.filter((n) => n.read_at === null).length;
      onUnreadCountChange?.(count);
    } catch {
      setError("Không thể tải thông báo.");
    } finally {
      setLoading(false);
    }
  }, [onUnreadCountChange]);

  // Load when popover is opened
  useEffect(() => {
    if (!isOpen) return;
    const frame = window.setTimeout(() => {
      void loadNotifications();
    }, 0);
    return () => window.clearTimeout(frame);
  }, [isOpen, loadNotifications]);

  // Click outside and Escape key handler
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [isOpen]);

  const markRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (pendingId) return;
    setPendingId(id);
    try {
      await readJson(
        await fetch("/api/notifications", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id }),
        })
      );
      const nowIso = new Date().toISOString();
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, read_at: nowIso } : item))
      );
      const nextUnread = Math.max(0, unreadCount - 1);
      onUnreadCountChange?.(nextUnread);
    } catch {
      // Keep optimistic or silent
    } finally {
      setPendingId(null);
    }
  };

  const handleItemClick = async (item: LoopiNotificationItem) => {
    if (!item.read_at) {
      void markRead(item.id);
    }
    setIsOpen(false);
    if (item.entity_href) {
      router.push(item.entity_href);
    }
  };

  const notificationLabel =
    unreadCount > 0 ? `Thông báo, ${unreadCount} chưa đọc` : "Thông báo";

  // Limit latest 7 items in popover
  const displayedItems = items.slice(0, 7);

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className="icon-button mobile-notification-button focus:outline-none"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={notificationLabel}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        title={notificationLabel}
      >
        <Bell size={iconSize} />
        {unreadCount > 0 && <span aria-hidden="true" />}
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              aria-hidden="true"
              initial={shouldReduceMotion ? false : { opacity: 0 }}
              animate={shouldReduceMotion ? undefined : { opacity: 1 }}
              exit={shouldReduceMotion ? undefined : { opacity: 0 }}
              transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.14 }}
              className="fixed inset-0 bg-black/30 z-40 sm:hidden"
              onClick={() => setIsOpen(false)}
            />
            <motion.div
              role="dialog"
              aria-label="Danh sách thông báo nhanh"
              aria-modal="false"
              initial={shouldReduceMotion ? false : { opacity: 0, y: -6, scale: 0.98 }}
              animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, y: -6, scale: 0.98 }}
              transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.16, ease: "easeOut" }}
              className="fixed inset-x-3 top-16 z-50 max-h-[75vh] flex flex-col sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[360px] sm:max-w-[calc(100vw-20px)] sm:max-h-[min(520px,calc(100vh-100px))] bg-white rounded-2xl border border-[#eee3df] shadow-xl shadow-[#6f2939]/10 overflow-hidden text-left"
            >
            {/* Header */}
            <div className="px-4 py-3 border-b border-[#f3e9ea] flex items-center justify-between bg-[#fffafb]">
              <div className="flex items-center gap-2">
                <span className="font-bold text-[14px] text-[#332a2b]">Thông báo</span>
                {unreadCount > 0 ? (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#fee2e7] text-[#9a293f] border border-[#f8c2cd]">
                    {unreadCount} chưa đọc
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#f3f4f6] text-[#6b7280]">
                    Đã đọc hết
                  </span>
                )}
              </div>
              <button
                type="button"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[#7b6f70] hover:text-[#332a2b] hover:bg-[#f5ebee] transition-colors focus:outline-none"
                onClick={() => setIsOpen(false)}
                aria-label="Đóng bảng thông báo"
              >
                <X size={15} />
              </button>
            </div>

            {/* Notifications List */}
            <div className="flex-1 overflow-y-auto divide-y divide-[#f5eeef] overscroll-contain">
              {loading && items.length === 0 ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex gap-3 animate-pulse items-center">
                      <div className="w-8 h-8 rounded-xl bg-stone-100 flex-shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3.5 bg-stone-100 rounded w-4/5" />
                        <div className="h-2.5 bg-stone-100 rounded w-1/3" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : error ? (
                <div className="p-6 text-center">
                  <p className="text-xs text-[#a83d4c] mb-2">{error}</p>
                  <button
                    type="button"
                    onClick={() => void loadNotifications()}
                    className="text-xs font-semibold text-[#6f2939] hover:underline"
                  >
                    Thử lại
                  </button>
                </div>
              ) : items.length === 0 ? (
                <div className="p-8 text-center flex flex-col items-center">
                  <div className="w-12 h-12 rounded-2xl bg-[#fff2f4] flex items-center justify-center text-[#d96d83] mb-3">
                    <Inbox size={22} />
                  </div>
                  <strong className="text-xs font-semibold text-[#332a2b] mb-1">Mọi thứ đang yên ắng, chưa có thông báo mới.</strong>
                  <p className="text-[11px] text-[#7b6f70] max-w-[220px]">
                    Khi có cập nhật về ca làm hay yêu cầu vận hành, Loopy sẽ nhắn bạn ngay tại đây nhé! ✨
                  </p>
                </div>
              ) : (
                displayedItems.map((item) => {
                  const isUnread = !item.read_at;
                  const meta = getNotificationMeta(item.type);
                  const Icon = meta.icon;

                  return (
                    <div
                      key={item.id}
                      onClick={() => void handleItemClick(item)}
                      className={`relative px-4 py-3 flex items-start gap-3 transition-colors cursor-pointer group ${
                        isUnread
                          ? "bg-[#fffafb] hover:bg-[#fff2f5]"
                          : "bg-white hover:bg-[#faf7f8]"
                      }`}
                    >
                      {/* Icon */}
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 border ${meta.iconBgClass} ${meta.borderClass}`}
                      >
                        <Icon size={15} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 pr-1">
                        <div className="flex items-start justify-between gap-1 mb-0.5">
                          <p
                            className={`text-xs leading-snug line-clamp-2 ${
                              isUnread
                                ? "font-bold text-[#332a2b]"
                                : "font-normal text-[#554849]"
                            }`}
                          >
                            {item.title}
                          </p>
                          {isUnread && (
                            <span
                              className="w-2 h-2 rounded-full bg-[#d96d83] flex-shrink-0 mt-1"
                              title="Chưa đọc"
                            />
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[10.5px] text-[#7b6f70]">
                          <span>{formatRelativeTime(item.created_at)}</span>
                          {item.entity_href && (
                            <>
                              <span>·</span>
                              <span className="text-[#6f2939] font-medium group-hover:underline">
                                Xem
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Action: Mark as read button */}
                      {isUnread && (
                        <button
                          type="button"
                          onClick={(e) => void markRead(item.id, e)}
                          disabled={pendingId === item.id}
                          className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-1 rounded-md text-[#7b6f70] hover:text-[#2e7d32] hover:bg-emerald-50 focus:outline-none flex-shrink-0 self-center"
                          title="Đánh dấu đã đọc"
                          aria-label="Đánh dấu thông báo này là đã đọc"
                        >
                          <Check size={14} />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="p-2.5 bg-[#fdfafb] border-t border-[#f3e9ea] text-center">
              <Link
                href="/app/notifications"
                onClick={() => setIsOpen(false)}
                className="inline-flex items-center justify-center gap-1.5 w-full py-1.5 text-xs font-semibold text-[#6f2939] hover:bg-[#fff2f5] rounded-lg transition-colors"
              >
                <span>Xem tất cả thông báo</span>
                <ChevronRight size={14} />
              </Link>
            </div>
          </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
