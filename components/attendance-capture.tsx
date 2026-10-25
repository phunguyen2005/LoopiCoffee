"use client";
import { readJson } from "@/platform/http/client";

import { Camera, CheckCircle2, Clock, LoaderCircle, MapPin, RefreshCw, ShieldAlert, Wifi } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useReducedMotion } from "framer-motion";
import { useLoopyToast } from "./loopy-toast";
import { CelebrationConfetti } from "./confetti-sparkles";
import Link from "next/link";

type LocationEvidence = {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
  distance: number;
};

type CaptureSession = {
  id: string;
  captureToken: string;
  expiresAt: string;
  storeLocation: {
    latitude: number;
    longitude: number;
  };
  wifi?: {
    name?: string | null;
    matched: boolean;
  };
};

type AttendanceAction = "check_in" | "check_out";
type EvidenceReadiness = "unchecked" | "checking" | "ready" | "error";

function subscribeToOnlineStatus(onStoreChange: () => void) {
  window.addEventListener("online", onStoreChange);
  window.addEventListener("offline", onStoreChange);
  return () => {
    window.removeEventListener("online", onStoreChange);
    window.removeEventListener("offline", onStoreChange);
  };
}

function getOnlineStatus() {
  return navigator.onLine;
}

function getServerOnlineStatus() {
  return true;
}

type AttendanceResult = {
  eventId: string;
  recordedAt: string;
  localTime: string;
  verification: string[];
  reviewRequired: boolean;
  distance: number | null;
  photoStatus: "stored" | "unavailable" | "failed";
  evidenceStored: boolean;
};

export function AttendanceCapture() {
  const { showLoopyToast } = useLoopyToast();
  const shouldReduceMotion = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const idempotencyKeyRef = useRef("");
  const attemptIdRef = useRef(0);

  const [action, setAction] = useState<AttendanceAction>("check_in");
  const [step, setStep] = useState<"idle" | "preparing" | "ready" | "review_photo" | "submitting" | "success" | "error">("preparing");
  const [location, setLocation] = useState<LocationEvidence | null>(null);
  const [session, setSession] = useState<CaptureSession | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(60);
  const [isRetryingLocation, setIsRetryingLocation] = useState(false);
  const [result, setResult] = useState<AttendanceResult | null>(null);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [outcomeUncertain, setOutcomeUncertain] = useState(false);
  const [explanation, setExplanation] = useState("");
  const [preview, setPreview] = useState("");
  const [showCelebration, setShowCelebration] = useState(false);
  const [cameraReadiness, setCameraReadiness] = useState<EvidenceReadiness>("unchecked");
  const [locationReadiness, setLocationReadiness] = useState<EvidenceReadiness>("unchecked");
  const isOnline = useSyncExternalStore(
    subscribeToOnlineStatus,
    getOnlineStatus,
    getServerOnlineStatus,
  );

  // Auto-initialize on mount: check today attendance status and start camera/GPS immediately
  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function initialize() {
      let initialAction: AttendanceAction = "check_in";
      try {
        const response = await fetch("/api/today", { cache: "no-store", signal: controller.signal });
        if (response.ok) {
          const payload = await readJson<{ attendance: { opened_at?: string; closed_at?: string } | null }>(response);
          if (payload?.attendance?.opened_at && !payload.attendance.closed_at) {
            initialAction = "check_out";
          }
        }
      } catch {
        // Fallback default to check_in
      }

      if (active) {
        setAction(initialAction);
        void beginCapture(initialAction);
      }
    }

    void initialize();

    return () => {
      active = false;
      attemptIdRef.current += 1;
      controller.abort();
      stopStream();
    };
  }, []);

  // Session 60s countdown timer
  useEffect(() => {
    if ((step === "ready" || step === "review_photo") && session) {
      const interval = setInterval(() => {
        const expiresAt = Date.parse(session.expiresAt);
        const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
        setSecondsRemaining(remaining);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [step, session]);

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function retryLocation(currentSession = session) {
    if (!currentSession) return;
    setIsRetryingLocation(true);
    setLocationReadiness("checking");
    try {
      const position = await getFreshPosition();
      setLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp,
        distance: distanceInMeters(
          position.coords.latitude,
          position.coords.longitude,
          currentSession.storeLocation.latitude,
          currentSession.storeLocation.longitude,
        ),
      });
      setLocationReadiness("ready");
    } catch {
      setLocationReadiness("error");
    } finally {
      setIsRetryingLocation(false);
    }
  }

  async function refreshSession(targetAction?: AttendanceAction) {
    const act = targetAction ?? action;
    try {
      const res = await fetch("/api/attendance/capture-sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: act }),
      });
      if (!res.ok) {
        const errData = await readJson<{ error?: string; code?: string }>(res).catch(() => ({} as { error?: string; code?: string }));
        setErrorCode(errData.code ?? "");
        throw new Error(errData.error || "Không thể làm mới phiên chấm công.");
      }
      const newSession = await readJson<CaptureSession>(res);
      setSession(newSession);
      idempotencyKeyRef.current = crypto.randomUUID();
      const expiresAt = Date.parse(newSession.expiresAt);
      setSecondsRemaining(Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)));
      setError("");
      if (locationReadiness !== "ready") {
        void retryLocation(newSession);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể làm mới phiên.");
    }
  }

  async function beginCapture(targetAction?: AttendanceAction) {
    const act = targetAction ?? action;
    const currentAttempt = ++attemptIdRef.current;
    stopStream();
    setStep("preparing");
    setError("");
    setErrorCode("");
    setOutcomeUncertain(false);
    setPreview("");
    setResult(null);
    setShowCelebration(false);
    setCameraReadiness("checking");
    setLocationReadiness("checking");

    try {
      const sessionResponse = await fetch("/api/attendance/capture-sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: act }),
      });
      if (currentAttempt !== attemptIdRef.current) return;
      if (!sessionResponse.ok) {
        const errData = await readJson<{ error?: string; code?: string }>(sessionResponse).catch(() => ({} as { error?: string; code?: string }));
        setErrorCode(errData.code ?? "");
        throw new Error(errData.error || "Không thể bắt đầu phiên chấm công.");
      }
      const captureSession = (await sessionResponse.json()) as CaptureSession;
      if (currentAttempt !== attemptIdRef.current) return;
      setSession(captureSession);
      idempotencyKeyRef.current = crypto.randomUUID();
      const expiresAt = Date.parse(captureSession.expiresAt);
      setSecondsRemaining(Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)));

      if (typeof window !== "undefined" && !window.isSecureContext && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
        setCameraReadiness("error");
        setLocationReadiness("error");
        setError("Kết nối không an toàn (yêu cầu HTTPS hoặc localhost) nên trình duyệt chặn quyền mở camera.");
        setStep("error");
        return;
      }

      if (typeof navigator === "undefined" || !navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
        setCameraReadiness("error");
        setLocationReadiness("error");
        setError("Trình duyệt hiện tại không hỗ trợ truy cập camera (mediaDevices.getUserMedia).");
        setStep("error");
        return;
      }

      // Initialize Camera and GPS in parallel without blocking each other
      const [streamResult, positionResult] = await Promise.allSettled([
        navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        }),
        getFreshPosition(),
      ]);

      if (currentAttempt !== attemptIdRef.current) {
        if (streamResult.status === "fulfilled") {
          streamResult.value.getTracks().forEach((track) => track.stop());
        }
        return;
      }

      if (positionResult.status === "fulfilled") {
        const position = positionResult.value;
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
          distance: distanceInMeters(
            position.coords.latitude,
            position.coords.longitude,
            captureSession.storeLocation.latitude,
            captureSession.storeLocation.longitude,
          ),
        });
        setLocationReadiness("ready");
      } else {
        setLocationReadiness("error");
      }

      if (streamResult.status === "fulfilled") {
        const stream = streamResult.value;
        streamRef.current = stream;
        setCameraReadiness("ready");
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        if (currentAttempt !== attemptIdRef.current) {
          stopStream();
          return;
        }
        setStep("ready");
      } else {
        stopStream();
        setCameraReadiness("error");
        const camMsg = cameraErrorMessage(streamResult.reason);
        setError(camMsg);
        setStep("error");
      }
    } catch (caught) {
      if (currentAttempt !== attemptIdRef.current) return;
      stopStream();
      setError(caught instanceof Error ? caught.message : "Thiết bị chưa sẵn sàng.");
      setStep("error");
    }
  }

  // Snap photo with watermark stamp containing: Device Name - Wifi - Location - Time
  function snapPhoto() {
    if (secondsRemaining <= 0) {
      setError("Phiên chấm công đã hết hạn. Hãy bấm 'Làm mới phiên' để tiếp tục.");
      return;
    }
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      setError("Camera chưa sẵn sàng hoặc chưa nạp xong khung hình. Vui lòng đợi trong giây lát rồi chụp lại.");
      return;
    }
    const canvas = canvasRef.current;
    const width = Math.min(video.videoWidth, 1280);
    const height = Math.round(width * (video.videoHeight / video.videoWidth));
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      setError("Thiết bị không thể xử lý ảnh.");
      setStep("error");
      return;
    }

    // 1. Draw raw video frame
    context.drawImage(video, 0, 0, width, height);

    // 2. Render watermark overlay on photo with Device name, Wifi, Location, and Time
    const padding = Math.max(14, Math.round(width * 0.025));
    const bannerHeight = Math.max(90, Math.round(height * 0.17));
    const bannerY = height - bannerHeight;

    // Semi-transparent gradient background for legibility
    const gradient = context.createLinearGradient(0, bannerY - 12, 0, height);
    gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
    gradient.addColorStop(0.25, "rgba(15, 23, 42, 0.85)");
    gradient.addColorStop(1, "rgba(15, 23, 42, 0.96)");
    context.fillStyle = gradient;
    context.fillRect(0, bannerY - 12, width, bannerHeight + 12);

    // Accent line
    context.fillStyle = action === "check_in" ? "#10b981" : "#f59e0b";
    context.fillRect(0, bannerY - 12, width, 3);

    // Title / Action badge & Time
    const fontSizeTitle = Math.max(13, Math.round(width * 0.022));
    const fontSizeBody = Math.max(11, Math.round(width * 0.017));
    context.font = `bold ${fontSizeTitle}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    context.fillStyle = action === "check_in" ? "#34d399" : "#fbbf24";
    const actionLabel = action === "check_in" ? "VÀO CA (CHECK-IN)" : "RA CA (CHECK-OUT)";
    context.fillText(`☕ LOOPICAFE · ${actionLabel}`, padding, bannerY + fontSizeTitle + 2);

    const now = new Date();
    const timeStr = `${now.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · ${now.toLocaleDateString("vi-VN")}`;
    context.font = `bold ${fontSizeBody}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    context.fillStyle = "#ffffff";
    const timeWidth = context.measureText(timeStr).width;
    context.fillText(timeStr, width - padding - timeWidth, bannerY + fontSizeTitle + 2);

    // Row 1: Tên thiết bị & Wifi
    context.font = `${fontSizeBody}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    context.fillStyle = "#e2e8f0";
    const deviceName = getDeviceName();
    const networkStatus = getNetworkStatus(session);
    context.fillText(`📱 Thiết bị: ${deviceName}   |   📶 Mạng: ${networkStatus}`, padding, bannerY + fontSizeTitle + fontSizeBody + 10);

    // Row 2: Vị trí
    let locationStr = "📍 Vị trí: Đang cập nhật...";
    if (location) {
      locationStr = `📍 Vị trí: ${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)} (Sai số ~${Math.round(location.accuracy)}m · Cách quán ${Math.round(location.distance / 1000)} km)`;
    } else if (locationReadiness === "error") {
      locationStr = "📍 Vị trí: Chưa xác định được GPS (Yêu cầu duyệt ngoại lệ)";
    }
    context.fillStyle = "#cbd5e1";
    context.fillText(locationStr, padding, bannerY + fontSizeTitle + (fontSizeBody * 2) + 18);

    const rawPhoto = canvas.toDataURL("image/jpeg", 0.85);
    setPreview(rawPhoto);
    setStep("review_photo");
  }

  // Submit confirmed photo
  async function confirmSubmit() {
    if (!session || !preview) return;
    if (secondsRemaining <= 0 || Date.parse(session.expiresAt) <= Date.now()) {
      setPreview("");
      setStep("ready");
      setError("Phiên chụp ảnh đã hết hạn (60 giây). Vui lòng làm mới phiên và chụp lại ảnh mới.");
      return;
    }
    setStep("submitting");

    try {
      const actionResponse = await fetch("/api/attendance/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          captureSessionId: session.id,
          captureToken: session.captureToken,
          idempotencyKey: idempotencyKeyRef.current || (idempotencyKeyRef.current = crypto.randomUUID()),
          action,
          location: location ?? null,
          photo: preview,
        }),
      });

      if (!actionResponse.ok) {
        const errPayload = await readJson<{ error?: string; code?: string }>(actionResponse).catch(() => ({} as { error?: string; code?: string }));
        setErrorCode(errPayload.code ?? "");
        throw new Error(errPayload.error || "Chấm công chưa được ghi nhận.");
      }

      const payload = (await actionResponse.json()) as AttendanceResult;
      setResult(payload);
      stopStream();
      setStep("success");
      setShowCelebration(!payload.reviewRequired);
      showLoopyToast(
        payload.reviewRequired
          ? "Đã gửi quản lý duyệt nè"
          : action === "check_in"
          ? "Check-in xong rồi! Chúc bạn một ca thật vui. ☕"
          : "Check-out xong rồi! Nghỉ ngơi lấy lại sức nhé bạn ơi. 👋",
        {
          message: payload.reviewRequired
            ? "Ca sẽ được xác nhận sau khi quản lý đối chiếu bằng chứng nhé."
            : action === "check_in"
            ? "Loopy đã ghi nhận thời gian và ảnh của bạn rồi. Chúc bạn một ca làm việc rạng rỡ!"
            : "Loopy đã ghi nhận giờ tan ca của bạn. Về nhà an toàn và thư giãn nhé!",
          mood: payload.reviewRequired ? "worries" : "celebrate",
          type: payload.reviewRequired ? "info" : "success",
        }
      );
    } catch (caught) {
      stopStream();
      if (!errorCode && caught instanceof TypeError) setOutcomeUncertain(true);
      setError(caught instanceof Error ? caught.message : "Không thể hoàn tất chấm công.");
      setStep("error");
    }
  }

  async function submitException() {
    setStep("submitting");
    try {
      let currentSession = session;
      if (!currentSession || Date.parse(currentSession.expiresAt) < Date.now()) {
        const response = await fetch("/api/attendance/capture-sessions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action }),
        });
        currentSession = await readJson<CaptureSession>(response);
        setSession(currentSession);
      }
      const actionResponse = await fetch("/api/attendance/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          captureSessionId: currentSession.id,
          captureToken: currentSession.captureToken,
          idempotencyKey: idempotencyKeyRef.current || (idempotencyKeyRef.current = crypto.randomUUID()),
          action,
          cameraError: error || "camera_unavailable",
          locationError: location ? null : "location_unavailable",
          location,
          exceptionReason: explanation,
        }),
      });
      if (!actionResponse.ok) throw new Error("Không thể gửi yêu cầu duyệt.");
      const payload = (await actionResponse.json()) as AttendanceResult;
      setResult(payload);
      stopStream();
      setShowCelebration(false);
      setStep("success");
    } catch {
      setError("Kết nối chưa ổn định. Vui lòng thử lại hoặc báo trực tiếp cho quản lý.");
      setStep("error");
    }
  }

  function reset() {
    stopStream();
    const nextAction = result ? (action === "check_in" ? "check_out" : "check_in") : action;
    setAction(nextAction);
    setSession(null);
    setLocation(null);
    setResult(null);
    setPreview("");
    setError("");
    setErrorCode("");
    setOutcomeUncertain(false);
    setExplanation("");
    idempotencyKeyRef.current = "";
    setShowCelebration(false);
    void beginCapture(nextAction);
  }

  function selectAction(nextAction: AttendanceAction) {
    if (action === nextAction) return;
    setAction(nextAction);
    idempotencyKeyRef.current = "";
    if (streamRef.current && (step === "ready" || step === "review_photo")) {
      setPreview("");
      setStep("ready");
      void refreshSession(nextAction);
    } else {
      void beginCapture(nextAction);
    }
  }

  return (
    <section className="card capture-card relative max-w-xl mx-auto p-4 sm:p-6 shadow-md rounded-2xl bg-white border border-[#eee3df]">
      <CelebrationConfetti active={showCelebration && !shouldReduceMotion} />

      {/* Action Tabs: Vào ca / Ra ca */}
      <div className="flex items-center justify-between gap-2.5 flex-wrap mb-4">
        <div className="action-switch inline-flex p-1 bg-[#fff2f4] rounded-xl border border-[#f5d9df] shrink-0" role="group" aria-label="Chọn hành động chấm công">
          <button
            type="button"
            style={{ minHeight: 44 }}
            className={`min-h-[44px] px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center ${action === "check_in" ? "bg-[#d96d83] text-white shadow-sm" : "text-[#6f2939] hover:bg-[#ffe1e7]"}`}
            aria-pressed={action === "check_in"}
            disabled={step === "submitting"}
            onClick={() => selectAction("check_in")}
          >
            Vào ca
          </button>
          <button
            type="button"
            style={{ minHeight: 44 }}
            className={`min-h-[44px] px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center ${action === "check_out" ? "bg-[#d96d83] text-white shadow-sm" : "text-[#6f2939] hover:bg-[#ffe1e7]"}`}
            aria-pressed={action === "check_out"}
            disabled={step === "submitting"}
            onClick={() => selectAction("check_out")}
          >
            Ra ca
          </button>
        </div>

        {/* Live GPS badge indicator */}
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {locationReadiness === "ready" && location && (
            <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 flex items-center gap-1 whitespace-nowrap shrink-0">
              <MapPin size={12} className="shrink-0" /> Cách quán {formatDistance(location.distance)}
            </span>
          )}
          {locationReadiness === "error" && (
            <span className="text-[11px] font-medium text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200 flex items-center gap-1 whitespace-nowrap shrink-0">
              <MapPin size={12} className="shrink-0" /> Chưa có GPS
            </span>
          )}
          {isOnline ? (
            <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full border flex items-center gap-1 whitespace-nowrap shrink-0 ${session?.wifi?.matched && session.wifi.name ? "text-emerald-700 bg-emerald-50 border-emerald-200" : session?.wifi && !session.wifi.matched ? "text-amber-700 bg-amber-50 border-amber-200" : "text-emerald-700 bg-emerald-50 border-emerald-200"}`}>
              <Wifi size={12} className="shrink-0" /> {session?.wifi?.matched && session.wifi.name ? session.wifi.name : session?.wifi && !session.wifi.matched ? "Mạng ngoài quán" : "Online"}
            </span>
          ) : (
            <span className="text-[11px] font-medium text-rose-700 bg-rose-50 px-2.5 py-1 rounded-full border border-rose-200 flex items-center gap-1 whitespace-nowrap shrink-0">
              <Wifi size={12} className="shrink-0" /> Offline
            </span>
          )}
        </div>
      </div>

      {/* Camera Live Stage */}
      <div className="capture-stage relative overflow-hidden rounded-2xl aspect-[4/3] bg-black flex items-center justify-center">
        {step === "ready" && <div className="radar-scan-line" />}
        {preview && (step === "review_photo" || step === "submitting" || step === "success" || step === "error") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Ảnh chụp chấm công trực tiếp" className="capture-preview w-full h-full object-cover" />
        ) : (
          <video
            ref={videoRef}
            className="capture-video w-full h-full object-cover"
            playsInline
            muted
            style={{ display: step === "ready" ? "block" : "none" }}
          />
        )}

        {/* Loading / Placeholder */}
        {(step === "preparing" || (step === "error" && !preview)) && (
          <div className="capture-placeholder flex flex-col items-center justify-center p-6 text-center text-white" aria-live="polite">
            {step === "preparing" ? (
              <>
                <LoaderCircle size={42} className="spin text-[#d96d83] mb-3" />
                <h3 className="font-bold text-base">Đang kết nối camera & kiểm tra vị trí…</h3>
                <p className="text-xs text-white/70 mt-1 max-w-xs">Hệ thống đang tự động kiểm tra thiết bị, wifi và tọa độ GPS.</p>
              </>
            ) : (
              <>
                <ShieldAlert size={42} className="text-[#c75865] mb-3" />
                <h3 className="font-bold text-base">Không thể mở camera</h3>
                <p className="text-xs text-white/80 mt-1 max-w-xs">{error || "Vui lòng cho phép quyền truy cập camera trong trình duyệt."}</p>
                <button
                  type="button"
                  className="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-semibold flex items-center gap-1.5"
                  onClick={() => beginCapture()}
                >
                  <RefreshCw size={14} /> Thử lại
                </button>
              </>
            )}
          </div>
        )}

        {/* Framing Guide Overlay */}
        {step === "ready" && (
          <div className="capture-framing-overlay pointer-events-none">
            <div className="framing-guide" />
            <span className="framing-hint">Giữ khuôn mặt trong khung hình</span>
          </div>
        )}

        {/* 60s Session Timer Badge */}
        {(step === "ready" || step === "review_photo") && (
          <div
            className={`absolute top-3 right-3 z-20 px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors ${
              secondsRemaining <= 10
                ? "bg-red-600 text-white animate-pulse"
                : secondsRemaining <= 20
                ? "bg-amber-500 text-white"
                : "bg-black/60 text-white/90 backdrop-blur-sm"
            }`}
            role="status"
            aria-live="polite"
          >
            <Clock size={13} />
            <span>Phiên: {secondsRemaining}s</span>
          </div>
        )}

        {/* Session Expired Overlay */}
        {step === "ready" && secondsRemaining === 0 && (
          <div className="absolute inset-0 z-30 bg-black/80 flex flex-col items-center justify-center p-4 text-center text-white backdrop-blur-sm">
            <ShieldAlert size={38} className="text-amber-400 mb-2" />
            <h4 className="font-bold text-sm mb-1">Phiên chụp ảnh đã hết hạn (60s)</h4>
            <p className="text-xs text-white/80 max-w-xs mb-3">Vui lòng làm mới phiên để chụp ảnh với thời gian chính xác.</p>
            <button
              type="button"
              className="button button-compact bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-1.5"
              onClick={() => refreshSession()}
            >
              <RefreshCw size={14} /> Làm mới phiên
            </button>
          </div>
        )}

        {/* Success Placeholder */}
        {step === "success" && result && (
          <div className="capture-placeholder flex flex-col items-center justify-center p-6 text-center" aria-live="polite">
            {result.reviewRequired ? <ShieldAlert size={48} className="text-[#d97706] mb-2" /> : <CheckCircle2 size={48} className="text-[#4c9779] mb-2" />}
            <h3 className="font-bold text-base text-[#6f2939]">
              {result.reviewRequired ? "Đã gửi quản lý duyệt nè" : action === "check_in" ? "Check-in xong rồi! Chúc bạn một ca thật vui." : "Check-out xong rồi! Nghỉ ngơi nhé."}
            </h3>
            <p className="text-xs text-[#7b6f70] mt-1 max-w-xs">
              {result.reviewRequired
                ? `Gửi lúc ${result.localTime}. Quản lý sẽ đối chiếu lý do và bằng chứng ảnh nhé.`
                : `Giờ máy chủ: ${result.localTime}. ${result.evidenceStored ? "Bằng chứng đã lưu an toàn." : "Ghi nhận thành công rồi nè ✨"}`}
            </p>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} hidden />

      {/* Exception textarea if error */}
      {step === "error" && errorCode !== "handover_acknowledgment_required" && (
        <div className="field exception-field my-3" style={{ scrollMarginBottom: 140 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
            <label htmlFor="attendance-explanation" className="block font-semibold text-xs text-[#6f2939]" style={{ margin: 0 }}>
              Gửi giải thích để Quản lý duyệt thủ công
            </label>
            <span style={{ fontSize: "0.72rem", color: explanation.trim().length >= 5 ? "#15803d" : "var(--muted)", fontWeight: 600 }}>
              {explanation.trim().length >= 5 ? "✓ Đủ điều kiện gửi" : `Tối thiểu 5 ký tự (${explanation.trim().length}/5)`}
            </span>
          </div>
          <textarea
            id="attendance-explanation"
            value={explanation}
            onChange={(event) => setExplanation(event.target.value)}
            placeholder="Ví dụ: Thiết bị lệch GPS trong quầy pha chế, em đã có mặt đúng giờ..."
            rows={3}
            className="w-full text-xs p-2.5 rounded-xl border border-[#eee3df]"
          />
        </div>
      )}

      {/* Subtle GPS retry warning if GPS failed */}
      {step === "ready" && locationReadiness === "error" && (
        <div className="flex items-center justify-between gap-3 p-2.5 my-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
          <span>Chưa lấy được GPS. Bạn vẫn có thể chụp ảnh và gửi yêu cầu duyệt.</span>
          <button
            type="button"
            className="button-secondary button-compact shrink-0 text-xs py-1 px-2.5"
            style={{ minHeight: 44 }}
            disabled={isRetryingLocation}
            onClick={() => retryLocation()}
          >
            {isRetryingLocation ? <LoaderCircle size={12} className="spin inline mr-1" /> : <RefreshCw size={12} className="inline mr-1" />}
            Thử lại GPS
          </button>
        </div>
      )}

      {/* Action Buttons */}
      <div className="mt-4">
        {step === "ready" && (
          secondsRemaining > 0 ? (
            <button type="button" className="button button-large w-full py-3 text-sm font-bold flex items-center justify-center gap-2" style={{ minHeight: 48 }} onClick={snapPhoto}>
              <Camera size={19} /> Chụp ảnh chấm công ({secondsRemaining}s)
            </button>
          ) : (
            <button type="button" className="button button-large w-full py-3 text-sm font-bold flex items-center justify-center gap-2" style={{ minHeight: 48 }} onClick={() => refreshSession()}>
              <RefreshCw size={19} /> Làm mới phiên chấm công
            </button>
          )
        )}

        {step === "review_photo" && (
          <div className="flex gap-2.5 w-full">
            <button type="button" className="button-secondary button-compact flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5" style={{ minHeight: 46 }} onClick={() => setStep("ready")}>
              <RefreshCw size={15} /> Chụp lại
            </button>
            <button type="button" className="button button-large flex-[2] py-2.5 text-xs font-bold flex items-center justify-center gap-1.5" style={{ minHeight: 46 }} onClick={confirmSubmit}>
              <CheckCircle2 size={16} /> Xác nhận {action === "check_in" ? "vào ca" : "ra ca"}
            </button>
          </div>
        )}

        {(step === "preparing" || step === "submitting") && (
          <button type="button" className="button button-large w-full py-3 text-sm font-bold flex items-center justify-center gap-2" style={{ minHeight: 48 }} disabled>
            <LoaderCircle size={18} className="spin" /> {step === "preparing" ? "Đang chuẩn bị camera…" : "Đang gửi xác nhận…"}
          </button>
        )}

        {step === "error" && (
          <div className="flex gap-2.5 w-full flex-wrap">
            {errorCode === "handover_acknowledgment_required" ? (
              <Link className="button button-compact flex-1" style={{ minHeight: 46 }} href="/app/handovers">Đọc và nhận bàn giao</Link>
            ) : preview && session && location ? (
              <button type="button" className="button-secondary button-compact flex-1" style={{ minHeight: 46 }} onClick={confirmSubmit}>
                {outcomeUncertain ? "Đối chiếu / gửi lại" : "Gửi lại lần này"}
              </button>
            ) : null}
            {!outcomeUncertain && errorCode !== "handover_acknowledgment_required" && (
              <button type="button" className="button-secondary button-compact flex-1" style={{ minHeight: 46 }} onClick={reset}>
                <RefreshCw size={14} className="inline mr-1" /> Bắt đầu lại
              </button>
            )}
            {errorCode !== "handover_acknowledgment_required" && (
              <button
                type="button"
                className="button button-compact flex-1"
                style={{ minHeight: 46 }}
                onClick={submitException}
                disabled={explanation.trim().length < 5}
              >
                Gửi giải trình
              </button>
            )}
          </div>
        )}

        {step === "success" && (
          <button type="button" className="button-secondary button-compact w-full py-2.5 text-xs font-semibold" style={{ minHeight: 46 }} onClick={reset}>
            Hoàn tất & Tiếp tục
          </button>
        )}
      </div>
    </section>
  );
}

function getDeviceName(): string {
  if (typeof navigator === "undefined") return "Thiết bị không xác định";
  const ua = navigator.userAgent;
  let os = "Thiết bị di động";
  if (/iPhone/i.test(ua)) os = "Apple iPhone";
  else if (/iPad/i.test(ua)) os = "Apple iPad";
  else if (/Android/i.test(ua)) {
    const match = ua.match(/Android\s+([0-9.]+);?\s*([^;)]+)?/i);
    const model = match?.[2] ? match[2].trim() : "Android";
    os = `Android (${model})`;
  } else if (/Macintosh|Mac OS X/i.test(ua)) os = "macOS";
  else if (/Windows NT/i.test(ua)) os = "Windows PC";
  else if (/Linux/i.test(ua)) os = "Linux";

  let browser = "";
  if (/Chrome|CriOS/i.test(ua) && !/Edg|OPR/i.test(ua)) browser = "Chrome";
  else if (/Safari/i.test(ua) && !/Chrome|CriOS/i.test(ua)) browser = "Safari";
  else if (/Firefox|FxiOS/i.test(ua)) browser = "Firefox";
  else if (/Edg/i.test(ua)) browser = "Edge";

  return browser ? `${os} · ${browser}` : os;
}

function getNetworkStatus(session?: CaptureSession | null): string {
  if (typeof navigator === "undefined") return "Không rõ";
  if (!navigator.onLine) return "Ngoại tuyến (Offline)";
  const nav = navigator as Navigator & {
    connection?: { type?: string; effectiveType?: string };
  };
  const conn = nav.connection;
  if (conn?.type === "cellular") {
    return `Di động (${conn.effectiveType ? conn.effectiveType.toUpperCase() : "Cellular"})`;
  }
  if (session?.wifi?.matched && session.wifi.name) {
    return `Wifi: ${session.wifi.name}`;
  }
  if (session?.wifi && !session.wifi.matched) {
    return "Mạng ngoài quán";
  }
  if (session?.wifi?.name) {
    return `Wifi: ${session.wifi.name}`;
  }
  return "Wifi / Internet trực tuyến";
}

function getFreshPosition() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Trình duyệt không hỗ trợ vị trí."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 10000,
    });
  });
}

function distanceInMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radius = 6371000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function cameraErrorMessage(caught: unknown) {
  if (caught instanceof DOMException) {
    if (caught.name === "NotAllowedError" || caught.name === "PermissionDeniedError") {
      return "Quyền truy cập camera bị từ chối. Vui lòng cấp quyền trong cài đặt trình duyệt để tiếp tục.";
    }
    if (caught.name === "NotFoundError" || caught.name === "DevicesNotFoundError") {
      return "Không tìm thấy camera trên thiết bị của bạn.";
    }
    if (caught.name === "NotReadableError" || caught.name === "TrackStartError") {
      return "Camera đang được ứng dụng khác sử dụng hoặc bị lỗi phần cứng.";
    }
    if (caught.name === "OverconstrainedError" || caught.name === "ConstraintNotSatisfiedError") {
      return "Camera không hỗ trợ độ phân giải yêu cầu.";
    }
  }
  return caught instanceof Error ? caught.message : "Không thể khởi động camera.";
}

function locationErrorMessage(caught: unknown) {
  if (typeof caught === "object" && caught !== null && "code" in caught) {
    const code = (caught as { code?: number }).code;
    if (code === 1) {
      return "Quyền truy cập vị trí bị từ chối. Vui lòng bật định vị GPS trong trình duyệt/thiết bị.";
    }
    if (code === 2) {
      return "Không thể xác định vị trí hiện tại của thiết bị.";
    }
    if (code === 3) {
      return "Quá thời gian phản hồi vị trí (10 giây).";
    }
  }
  return caught instanceof Error ? caught.message : "Chưa lấy được vị trí GPS.";
}

function formatDistance(meters: number): string {
  const km = Math.round(meters / 1000);
  return `${km} km`;
}



