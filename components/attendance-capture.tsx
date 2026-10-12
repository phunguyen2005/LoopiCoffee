"use client";
import { readJson } from "@/platform/http/client";

import { Camera, Check, CheckCircle2, LoaderCircle, MapPin, RefreshCw, ShieldAlert, Smartphone, Wifi, X, Eye } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useReducedMotion } from "framer-motion";
import { useLoopyToast } from "./loopy-toast";
import { CelebrationConfetti } from "./confetti-sparkles";

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
  const privacyDialogRef = useRef<HTMLDivElement>(null);
  const privacyCloseRef = useRef<HTMLButtonElement>(null);
  const [action, setAction] = useState<AttendanceAction>("check_in");
  const [step, setStep] = useState<"idle" | "preparing" | "ready" | "review_photo" | "submitting" | "success" | "error">("idle");
  const [location, setLocation] = useState<LocationEvidence | null>(null);
  const [session, setSession] = useState<CaptureSession | null>(null);
  const [result, setResult] = useState<AttendanceResult | null>(null);
  const [error, setError] = useState("");
  const [explanation, setExplanation] = useState("");
  const [preview, setPreview] = useState("");
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [cameraReadiness, setCameraReadiness] = useState<EvidenceReadiness>("unchecked");
  const [locationReadiness, setLocationReadiness] = useState<EvidenceReadiness>("unchecked");
  const isOnline = useSyncExternalStore(
    subscribeToOnlineStatus,
    getOnlineStatus,
    getServerOnlineStatus,
  );

  useEffect(() => {
    return () => {
      stopStream();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/today", { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? readJson<{ attendance: { opened_at?: string; closed_at?: string } | null }>(response) : null)
      .then((payload) => {
        if (payload?.attendance?.opened_at && !payload.attendance.closed_at) setAction("check_out");
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!showPrivacyModal) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    privacyCloseRef.current?.focus();
    return () => previouslyFocused?.focus();
  }, [showPrivacyModal]);

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function beginCapture() {
    setStep("preparing");
    setError("");
    setPreview("");
    setResult(null);
    setShowCelebration(false);
    setCameraReadiness("unchecked");
    setLocationReadiness("unchecked");

    try {
      const sessionResponse = await fetch("/api/attendance/capture-sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!sessionResponse.ok) throw new Error("Không thể bắt đầu phiên chấm công.");
      const captureSession = (await sessionResponse.json()) as CaptureSession;
      setSession(captureSession);
      idempotencyKeyRef.current = crypto.randomUUID();
      setCameraReadiness("checking");
      setLocationReadiness("checking");

      const [streamResult, positionResult] = await Promise.allSettled([
        navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        }),
        getFreshPosition(),
      ]);
      setCameraReadiness(streamResult.status === "fulfilled" ? "ready" : "error");
      setLocationReadiness(positionResult.status === "fulfilled" ? "ready" : "error");
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
      }
      if (streamResult.status === "fulfilled") {
        const stream = streamResult.value;
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      }
      if (streamResult.status === "fulfilled" && positionResult.status === "fulfilled") {
        setStep("ready");
      } else {
        stopStream();
        const failures = [
          streamResult.status === "rejected" ? permissionMessage(streamResult.reason) : "",
          positionResult.status === "rejected" ? permissionMessage(positionResult.reason) : "",
        ].filter(Boolean);
        setError(failures.join(" "));
        setStep("error");
      }
    } catch (caught) {
      stopStream();
      setError(permissionMessage(caught));
      setStep("error");
    }
  }

  // Snap photo to preview step
  function snapPhoto() {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const width = Math.min(video.videoWidth || 960, 1280);
    const height = Math.round(width * ((video.videoHeight || 720) / (video.videoWidth || 960)));
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      setError("Thiết bị không thể xử lý ảnh.");
      setStep("error");
      return;
    }
    context.drawImage(video, 0, 0, width, height);
    const rawPhoto = canvas.toDataURL("image/jpeg", 0.84);
    setPreview(rawPhoto);
    setStep("review_photo");
  }

  // Submit confirmed photo
  async function confirmSubmit() {
    if (!session || !preview || !location) return;
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
          location,
          photo: preview,
        }),
      });
      const payload = (await actionResponse.json()) as AttendanceResult & { error?: string };
      if (!actionResponse.ok) throw new Error(payload.error || "Không thể ghi nhận chấm công.");

      setResult(payload);
      stopStream();
      setStep("success");
      setShowCelebration(!payload.reviewRequired);
      showLoopyToast(
        payload.reviewRequired
          ? "Đã gửi quản lý duyệt"
          : action === "check_in"
          ? "Check-in thành công! ☕"
          : "Check-out thành công! 👋",
        {
          message: payload.reviewRequired
            ? "Ca sẽ được xác nhận sau khi quản lý đối chiếu bằng chứng."
            : "Loopy đã ghi nhận thời gian và vị trí của bạn thành công!",
          mood: payload.reviewRequired ? "worries" : "success",
          type: payload.reviewRequired ? "info" : "success",
        }
      );
    } catch (caught) {
      stopStream();
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
    if (result) setAction(action === "check_in" ? "check_out" : "check_in");
    setSession(null);
    setLocation(null);
    setResult(null);
    setPreview("");
    setError("");
    setExplanation("");
    idempotencyKeyRef.current = "";
    setCameraReadiness("unchecked");
    setLocationReadiness("unchecked");
    setShowCelebration(false);
    setStep("idle");
  }

  function selectAction(nextAction: AttendanceAction) {
    setAction(nextAction);
    idempotencyKeyRef.current = "";
  }

  function handlePrivacyKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      setShowPrivacyModal(false);
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = privacyDialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const activeStep = step === "success"
    ? 4
    : step === "review_photo" || step === "submitting"
    ? 3
    : step === "ready"
    ? 2
    : 1;
  const cameraCopy = cameraReadiness === "ready"
    ? "Đã cấp quyền camera"
    : cameraReadiness === "checking"
    ? "Đang kiểm tra camera…"
    : cameraReadiness === "error"
    ? "Camera chưa được cấp quyền"
    : "Sẽ kiểm tra khi bắt đầu";
  const locationCopy = location
    ? `Đã ghi nhận · cách quán ${Math.round(location.distance)} m`
    : locationReadiness === "checking"
    ? "Đang lấy vị trí…"
    : locationReadiness === "error"
    ? "Không thể lấy vị trí"
    : "Sẽ kiểm tra khi bắt đầu";
  const evidenceReady = cameraReadiness === "ready" && locationReadiness === "ready" && isOnline;
  const evidenceHasError = cameraReadiness === "error" || locationReadiness === "error" || !isOnline || step === "error";

  return (
    <section className="card capture-card relative">
      <CelebrationConfetti active={showCelebration && !shouldReduceMotion} />
      <div className="capture-stage relative overflow-hidden">
        <span className={`capture-stage-state ${step === "ready" ? "ready" : step === "review_photo" ? "review" : step === "success" ? "success" : step === "error" ? "error" : ""}`}>
          {step === "preparing" ? "Đang kiểm tra" : step === "ready" ? "Sẵn sàng chụp" : step === "review_photo" ? "Ảnh đã chụp" : step === "success" ? "Đã hoàn tất" : step === "error" ? "Cần xử lý" : "Chưa bắt đầu"}
        </span>
        {step === "ready" && <div className="radar-scan-line" />}
        {preview && (step === "review_photo" || step === "submitting" || step === "success" || step === "error") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Ảnh chụp chấm công trực tiếp" className="capture-preview" />
        ) : (
          <video
            ref={videoRef}
            className="capture-video"
            playsInline
            muted
            style={{ display: step === "ready" ? "block" : "none" }}
          />
        )}

        {(step === "idle" || step === "preparing" || step === "error") && !preview && (
          <div className="capture-placeholder" aria-live="polite">
            {step === "preparing" ? (
              <LoaderCircle size={42} className="spin text-[#d96d83]" />
            ) : step === "error" ? (
              <ShieldAlert size={42} className="text-[#c75865]" />
            ) : (
              <Camera size={42} className="text-[#6f2939]" />
            )}
            <h3>
              {step === "preparing"
                ? "Đang kết nối camera & kiểm tra vị trí…"
                : step === "error"
                ? "Chưa xác minh tự động"
                : action === "check_in"
                ? "Chấm vào ca bằng ảnh trực tiếp"
                : "Chấm ra ca bằng ảnh trực tiếp"}
            </h3>
            <p>
              {step === "error"
                ? error
                : "Camera chỉ mở sau khi bạn bấm bắt đầu. LoopiCafe không theo dõi vị trí liên tục."}
            </p>
          </div>
        )}

        {step === "ready" && (
          <div className="capture-framing-overlay">
            <div className="framing-guide" />
            <span className="framing-hint">Giữ khuôn mặt trong khung hình</span>
          </div>
        )}

        {step === "success" && result && (
          <div className="capture-placeholder" aria-live="polite">
            {result.reviewRequired ? <ShieldAlert size={48} className="text-[#d97706]" /> : <CheckCircle2 size={48} className="text-[#4c9779]" />}
            <h3>{result.reviewRequired ? "Đã gửi quản lý duyệt" : action === "check_in" ? "Đã xác nhận vào ca" : "Đã xác nhận ra ca"}</h3>
            <p>
              {result.reviewRequired
                ? `Gửi lúc ${result.localTime}. Quản lý sẽ đối chiếu lý do và bằng chứng trước khi xác nhận.`
                : `Giờ máy chủ: ${result.localTime}. ${result.evidenceStored ? "Bằng chứng đã được lưu an toàn." : "Kết quả đã được ghi nhận."}`}
            </p>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} hidden />

      <div className="capture-controls">
        <div className="action-switch" role="group" aria-label="Chọn hành động chấm công">
          <button
            type="button"
            className={action === "check_in" ? "active" : ""}
            aria-pressed={action === "check_in"}
            disabled={step !== "idle"}
            onClick={() => selectAction("check_in")}
          >
            Vào ca
          </button>
          <button
            type="button"
            className={action === "check_out" ? "active" : ""}
            aria-pressed={action === "check_out"}
            disabled={step !== "idle"}
            onClick={() => selectAction("check_out")}
          >
            Ra ca
          </button>
        </div>

        <ol className="attendance-stepper" aria-label={`Bước ${activeStep} trên 4`}>
          {["Bắt đầu", "Chụp ảnh", "Xác nhận", "Hoàn tất"].map((label, index) => {
            const number = index + 1;
            const isComplete = activeStep > number || step === "success";
            const isActive = activeStep === number && step !== "success";
            return (
              <li key={label} aria-current={isActive ? "step" : undefined} className={`${isComplete ? "complete" : ""} ${isActive ? "active" : ""}`}>
                <span>{isComplete ? <Check size={14} /> : number}</span>
                <small>{label}</small>
              </li>
            );
          })}
        </ol>

        {step === "error" && (
          <div className="field exception-field" style={{ marginTop: 10 }}>
            <label htmlFor="attendance-explanation" style={{ fontWeight: 600, fontSize: 13, color: "#6f2939" }}>
              Gửi giải thích để Quản lý duyệt thủ công
            </label>
            <textarea
              id="attendance-explanation"
              value={explanation}
              onChange={(event) => setExplanation(event.target.value)}
              placeholder="Ví dụ: Camera điện thoại bị hỏng, tôi đã xin phép quản lý vào ca đúng giờ."
              rows={3}
            />
          </div>
        )}

        <section className={`attendance-readiness ${evidenceHasError ? "has-error" : ""}`} aria-live="polite">
          <div className="attendance-readiness-heading">
            <div>
              <span className={`mini-icon ${evidenceHasError ? "pink" : "mint"}`}>{evidenceHasError ? <ShieldAlert size={17} /> : <CheckCircle2 size={17} />}</span>
              <span><small>Kiểm tra nhanh</small><strong>{evidenceHasError ? "Cần xử lý trước khi tiếp tục" : evidenceReady ? "Sẵn sàng chấm công" : "Sẽ kiểm tra khi bắt đầu"}</strong></span>
            </div>
            <span className={`badge ${evidenceHasError ? "danger" : evidenceReady ? "success" : step === "preparing" ? "info" : "neutral"}`}>
              {evidenceHasError ? "Cần xử lý" : evidenceReady ? "Đã kiểm tra" : step === "preparing" ? "Đang kiểm tra" : "Tự động"}
            </span>
          </div>
          <div className="attendance-readiness-list">
            <div><Smartphone size={16} /><span><small>Thiết bị</small><strong>{cameraCopy}</strong></span><em className={cameraReadiness === "ready" ? "ok" : cameraReadiness === "error" ? "error" : "pending"}>{cameraReadiness === "ready" ? "✓" : cameraReadiness === "error" ? "!" : "•"}</em></div>
            <div><MapPin size={16} /><span><small>Vị trí</small><strong>{locationCopy}</strong></span><em className={locationReadiness === "ready" ? "ok" : locationReadiness === "error" ? "error" : "pending"}>{locationReadiness === "ready" ? "✓" : locationReadiness === "error" ? "!" : "•"}</em></div>
            <div><Wifi size={16} /><span><small>Kết nối</small><strong>{result ? `Đã ghi lúc ${result.localTime}` : isOnline ? "Đang trực tuyến" : "Thiết bị đang ngoại tuyến"}</strong></span><em className={isOnline ? "ok" : "error"}>{isOnline ? "✓" : "!"}</em></div>
          </div>
        </section>

        {/* Action Controls */}
        <div className="capture-actions mobile-attendance-cta">
          {step === "idle" && (
            <button className="button button-large" onClick={beginCapture}>
              <Camera size={18} /> {action === "check_in" ? "Bắt đầu chấm công" : "Chấm công ra ca"}
            </button>
          )}

          {step === "ready" && (
            <button className="button button-large" onClick={snapPhoto}>
              <Camera size={18} /> Chụp ảnh chấm công
            </button>
          )}

          {step === "review_photo" && (
            <div style={{ display: "flex", gap: 10, width: "100%" }}>
              <button className="button-secondary button-compact" onClick={() => setStep("ready")}>
                <RefreshCw size={15} /> Chụp lại
              </button>
              <button className="button button-large" style={{ flex: 1 }} onClick={confirmSubmit}>
                <CheckCircle2 size={18} /> Xác nhận {action === "check_in" ? "vào ca" : "ra ca"}
              </button>
            </div>
          )}

          {(step === "preparing" || step === "submitting") && (
            <button className="button button-large" disabled>
              <LoaderCircle size={18} className="spin" /> Đang xử lý…
            </button>
          )}

          {step === "error" && (
            <div style={{ display: "flex", gap: 10, width: "100%", marginTop: 8 }}>
              {preview && session && location && <button className="button-secondary button-compact" onClick={confirmSubmit}>Gửi lại lần chấm này</button>}
              <button className="button-secondary button-compact" onClick={reset}>
                <RefreshCw size={15} /> Thử lại
              </button>
              <button
                className="button button-compact"
                onClick={submitException}
                disabled={explanation.trim().length < 5}
              >
                Gửi yêu cầu duyệt
              </button>
            </div>
          )}

          {step === "success" && (
            <button className="button-secondary button-compact" onClick={reset}>
              Hoàn tất & Đóng
            </button>
          )}
        </div>

        <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p className="capture-note" style={{ margin: 0, flex: 1 }}>
            Vị trí được ghi nhận tại thời điểm bấm nút để hỗ trợ xác minh chấm công.
          </p>
          <button
            type="button"
            className="text-link"
            onClick={() => setShowPrivacyModal(true)}
            style={{ fontSize: 12, textDecoration: "underline", marginLeft: 8 }}
          >
            <Eye size={12} style={{ display: "inline", marginRight: 3 }} /> Quyền riêng tư
          </button>
        </div>
      </div>

      {/* Privacy Drawer / Modal */}
      {showPrivacyModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" role="presentation">
          <div
            ref={privacyDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="attendance-privacy-title"
            onKeyDown={handlePrivacyKeyDown}
            className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-[#eee3df]"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#eee3df]">
              <h3 id="attendance-privacy-title" className="font-bold text-[#6f2939] text-base flex items-center gap-2">
                <ShieldAlert size={18} className="text-[#d96d83]" /> Nguyên tắc bảo vệ dữ liệu
              </h3>
              <button
                ref={privacyCloseRef}
                onClick={() => setShowPrivacyModal(false)}
                aria-label="Đóng thông tin quyền riêng tư"
                className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-[#fff2f4] text-[#7b6f70]"
              >
                <X size={18} />
              </button>
            </div>
            <div className="py-4 space-y-3 text-xs text-[#332a2b] leading-relaxed">
              <p>• <strong>Không theo dõi liên tục:</strong> LoopiCafe chỉ lấy tọa độ duy nhất 1 lần tại thời điểm bạn bấm nút chấm công.</p>
              <p>• <strong>Ảnh bảo mật riêng tư:</strong> Ảnh chỉ hiển thị cho Quản lý cửa hàng & Owner xem xét tính hợp lệ.</p>
              <p>• <strong>Bảo vệ dữ liệu:</strong> Dữ liệu chấm công tự động được lưu trữ an toàn và xử lý theo chính sách cửa hàng.</p>
            </div>
            <button
              onClick={() => setShowPrivacyModal(false)}
              className="w-full min-h-11 py-2.5 bg-[#fff2f4] hover:bg-[#ffe1e7] text-[#6f2939] font-bold rounded-2xl text-xs"
            >
              Tôi đã hiểu
            </button>
          </div>
        </div>
      )}
    </section>
  );
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

function permissionMessage(caught: unknown) {
  if (caught instanceof DOMException && caught.name === "NotAllowedError") {
    return "Bạn chưa bật quyền camera hoặc vị trí trên trình duyệt. Vui lòng cho phép để tiếp tục.";
  }
  if (typeof caught === "object" && caught !== null && "code" in caught) {
    return (caught as { code?: number }).code === 3
      ? "Không thể phản hồi vị trí trong 10 giây."
      : "Thiết bị chưa cung cấp được vị trí hiện tại.";
  }
  return caught instanceof Error ? caught.message : "Thiết bị chưa sẵn sàng.";
}
