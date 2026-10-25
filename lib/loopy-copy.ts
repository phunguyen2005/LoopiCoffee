/**
 * LoopiCafe Tone & Voice Guidelines and Copy Constants
 *
 * Voice pillars:
 * - Cute, warm, friendly, and playful (inspired by Loopy's character)
 * - Clear, concise, and unambiguous for operational tasks and payroll
 * - Context-aware & personalized (roles, names, time of day, system status)
 */

export type TimeOfDay = "morning" | "afternoon" | "evening" | "night";

export function getTimeOfDay(date: Date = new Date()): TimeOfDay {
  // Use Vietnam timezone hour (UTC+7)
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "numeric",
    hour12: false,
  });
  const hour = parseInt(formatter.format(date), 10);

  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 22) return "evening";
  return "night";
}

const ROLE_TITLES = new Set(["chủ quán", "chủ cửa hàng", "quản lý", "trưởng ca", "quản trị", "quản trị viên"]);

export function getUserFirstName(displayName?: string, email?: string): string {
  if (!displayName || !displayName.trim()) {
    if (email && email.trim()) {
      return email.split("@")[0].trim();
    }
    return "bạn";
  }

  // Loại bỏ các hậu tố thử nghiệm/demo nếu có (ví dụ: "Chủ quán thử nghiệm" -> "Chủ quán")
  let cleaned = displayName
    .trim()
    .replace(/\s*[\(\[\{]?(?:thử nghiệm|thu nghiem|demo|test)[\)\]\}]?\s*$/i, "")
    .trim();

  if (!cleaned) {
    cleaned = displayName.trim();
  }

  // Nếu là danh xưng vai trò ngắn, giữ nguyên danh xưng
  if (ROLE_TITLES.has(cleaned.toLowerCase())) {
    return cleaned;
  }

  // Cắt lấy tên gọi (chữ cuối cùng) để giao diện gọn gàng, tiết kiệm diện tích
  const parts = cleaned.split(/\s+/);
  return parts[parts.length - 1];
}

export function getUserAccountName(displayName?: string, email?: string): string {
  return getUserFirstName(displayName, email);
}

export function getPersonalizedGreeting(
  user?: { displayName?: string; email?: string; role?: string },
  date: Date = new Date()
): { greeting: string; submessage: string; emoji: string } {
  const timeOfDay = getTimeOfDay(date);
  const name = getUserFirstName(user?.displayName, user?.email);
  const role = user?.role ?? "employee";
  const hasSpecificName = name !== "bạn";

  if (timeOfDay === "morning") {
    if (role === "owner") {
      return {
        greeting: hasSpecificName ? `Chào buổi sáng ${name}!` : "Chào buổi sáng!",
        submessage: "Hôm nay ở quán thế nào? Cùng xem nhịp vận hành nhé ✨",
        emoji: "☕",
      };
    }
    if (role === "manager") {
      return {
        greeting: hasSpecificName ? `Chào buổi sáng ${name}!` : "Chào buổi sáng!",
        submessage: "Sẵn sàng cho một ngày quán rộn ràng cùng các bạn chưa? 🌸",
        emoji: "☀️",
      };
    }
    if (role === "system_admin") {
      return {
        greeting: hasSpecificName ? `Chào buổi sáng ${name}!` : "Chào buổi sáng!",
        submessage: "Hệ thống LoopyCafe hoạt động ổn định và sẵn sàng phục vụ.",
        emoji: "🛡️",
      };
    }
    return {
      greeting: hasSpecificName ? `Chào buổi sáng ${name} nè!` : "Chào buổi sáng bạn nhé!",
      submessage: "Chúc bạn một ca làm thật vui và ngập tràn năng lượng nhé ☕",
      emoji: "✨",
    };
  }

  if (timeOfDay === "afternoon") {
    if (role === "owner") {
      return {
        greeting: hasSpecificName ? `Chào buổi chiều ${name}!` : "Chào buổi chiều!",
        submessage: "Cùng xem quán hoạt động buổi chiều thế nào nhé 🧋",
        emoji: "🍰",
      };
    }
    if (role === "manager") {
      return {
        greeting: hasSpecificName ? `Chào buổi chiều ${name}!` : "Chào buổi chiều!",
        submessage: "Giữ nhịp phục vụ thật êm ái cho giờ cao điểm nhé!",
        emoji: "🧋",
      };
    }
    return {
      greeting: hasSpecificName ? `Chào buổi chiều ${name} nhé!` : "Chào buổi chiều bạn nhé!",
      submessage: "Uống ngụm nước rồi cùng giữ nhịp quán thật tốt nha 🧋",
      emoji: "🌸",
    };
  }

  if (timeOfDay === "evening") {
    if (role === "owner") {
      return {
        greeting: hasSpecificName ? `Chào buổi tối ${name}!` : "Chào buổi tối!",
        submessage: "Cùng nhìn lại một ngày rực rỡ và đầm ấm của quán nhé.",
        emoji: "🌙",
      };
    }
    if (role === "manager") {
      return {
        greeting: hasSpecificName ? `Chào buổi tối ${name}!` : "Chào buổi tối!",
        submessage: "Kiểm tra bàn giao và checklist đóng ca cùng các bạn nhé.",
        emoji: "⭐",
      };
    }
    return {
      greeting: hasSpecificName ? `Chào buổi tối ${name}!` : "Chào buổi tối bạn nhé!",
      submessage: "Sắp xong ngày làm việc rồi nè, cố gắng một chút nhé!",
      emoji: "🧁",
    };
  }

  // Late night / early dawn (22h - 5h)
  return {
    greeting: hasSpecificName ? `Khuya rồi ${name} ơi!` : "Khuya rồi bạn ơi!",
    submessage: "Nhớ nghỉ ngơi thật ngon giấc để nạp lại năng lượng nhé 🌙",
    emoji: "💤",
  };
}

export const LOOPY_COPY = {
  // Navigation & Core titles
  dashboardNav: "Hôm nay ở quán thế nào?",
  teamNav: "Nhà mình có những ai?",
  scheduleNav: "Lịch làm việc",
  myScheduleNav: "Lịch làm của bạn",
  attendanceNav: "Chấm công vào ra",
  attendanceReviewNav: "Duyệt chấm công",
  checklistsNav: "Việc cần làm hôm nay",
  handoversNav: "Sổ bàn giao ca",
  issuesNav: "Sự cố & Hỗ trợ quầy",
  requestsNav: "Đơn từ & Yêu cầu",
  ordersNav: "Đơn hàng của quán",
  reportsNav: "Báo cáo & Giờ công",
  settingsNav: "Thiết lập cửa hàng",
  notificationsNav: "Hộp thông báo",

  // Specific canonical examples requested by User
  dashboardTitle: "Hôm nay ở quán thế nào?",
  activeStaffSection: "Ai đang ở quán nhỉ?",
  noShiftsToday: "Hôm nay quán chưa có ca nào được xếp",
  teamTitle: "Nhà mình có những ai?",
  emptyStateDefault: "Chỗ này vẫn còn trống nè!",
  checkInSuccessToast: "Check-in xong rồi! Chúc bạn một ca thật vui. ☕",
  checkInSuccessCard: "Check-in xong rồi! Chúc bạn một ca thật vui.",
  checkOutSuccessToast: "Check-out xong rồi! Bạn đã vất vả hôm nay rồi nè, nghỉ ngơi nhé. 👋",
  checkOutSuccessCard: "Check-out xong rồi! Nghỉ ngơi lấy lại sức nhé bạn ơi.",
  noNotifications: "Mọi thứ đang yên ắng, chưa có thông báo mới.",
  leaveApproved: "Đơn nghỉ của bạn được duyệt rồi!",

  // Detailed empty states
  emptyStaffAtStore: "Chỗ này vẫn còn trống nè! Hiện chưa có bạn nào check-in vào ca.",
  emptyPendingExceptions: "Tuyệt vời ghê! Không có ngoại lệ nào cần xử lý.",
  emptyRequests: "Chỗ này vẫn còn trống nè! Hiện chưa có yêu cầu nào cần xử lý.",
  emptyChecklists: "Chỗ này vẫn còn trống nè! Quán chưa có đầu việc nào hôm nay.",
  allChecklistsDone: "Tuyệt vời quá! Đã hoàn thành hết mọi công việc hôm nay rồi nè ✨",
  emptyHandovers: "Chỗ này vẫn còn trống nè! Chưa có ghi chú bàn giao nào.",
  emptyIssues: "Quán đang chạy êm ru, không có sự cố nào ghi nhận nè! ✨",
  emptySearchResults: "Chưa tìm thấy kết quả nào nè, bạn thử đổi từ khóa xem sao nhé!",
  emptyScheduleStaff: "Chưa có ca nào được xếp cho bạn nè! Hãy thong thả nghỉ ngơi hoặc xem tuần sau nhé.",
  emptyScheduleManager: "Hôm nay quán chưa có ca nào được xếp. Hãy thêm ca để các bạn nắm lịch nhé!",

  // Reassurance & friendly hints
  allOnTimeReassurance: "Tuyệt vời ghê! Ai cũng đến đúng giờ và đầy đủ ✨",
  storeOperatingSmoothly: "Mọi việc ở quán đang rất êm ả và đúng nhịp nè!",
} as const;
