"use client";

import { Camera, CheckCircle2, Clock3, LoaderCircle, MapPin, RefreshCw, ShieldAlert, X, Eye } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [action, setAction] = useState<AttendanceAction>("check_in");
  const [step, setStep] = useState<"idle" | "preparing" | "ready" | "review_photo" | "submitting" | "success" | "error">("idle");
  const [location, setLocation] = useState<LocationEvidence | null>(null);
  const [session, setSession] = useState<CaptureSession | null>(null);
  const [result, setResult] = useState<AttendanceResult | null>(null);
  const [error, setError] = useState("");
  const [explanation, setExplanation] = useState("");
  const [preview, setPreview] = useState("");
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  useEffect(() => () => stopStream(), []);

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function beginCapture() {
    setStep("preparing");
    setError("");
    setPreview("");
    setResult(null);

    try {
      const sessionResponse = await fetch("/api/attendance/capture-sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!sessionResponse.ok) throw new Error("Không thể bắt đầu phiên chấm công.");
      const captureSession = (await sessionResponse.json()) as CaptureSession;
      setSession(captureSession);

      const [streamResult, positionResult] = await Promise.allSettled([
        navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        }),
        getFreshPosition(),
      ]);
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
          idempotencyKey: crypto.randomUUID(),
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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể hoàn tất chấm công.");
      setStep("error");
    }
  }

  async function submitException() {
    setStep("submitting");
    try {
      let currentSession = session;
      if (!currentSession) {
        const response = await fetch("/api/attendance/capture-sessions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action }),
        });
        currentSession = (await response.json()) as CaptureSession;
      }
      const actionResponse = await fetch("/api/attendance/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          captureSessionId: currentSession.id,
          captureToken: currentSession.captureToken,
          idempotencyKey: crypto.randomUUID(),
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
      setStep("success");
    } catch {
      setError("Kết nối chưa ổn định. Vui lòng thử lại hoặc báo trực tiếp cho quản lý.");
      setStep("error");
    }
  }

  function reset() {
    stopStream();
    setSession(null);
    setLocation(null);
    setResult(null);
    setPreview("");
    setError("");
    setExplanation("");
    setStep("idle");
  }

  return (
    <section className="card capture-card">
      <div className="capture-stage">
        {preview && (step === "review_photo" || step === "submitting" || step === "success") ? (
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
          <div className="capture-placeholder">
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
          <div className="capture-placeholder">
            <CheckCircle2 size={48} className="text-[#4c9779]" />
            <h3>{action === "check_in" ? "Đã xác nhận vào ca" : "Đã xác nhận ra ca"}</h3>
            <p>Giờ máy chủ: {result.localTime}. Bằng chứng đã được lưu an toàn.</p>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} hidden />

      <div className="capture-controls">
        <div className="action-switch" aria-label="Chọn hành động chấm công">
          <button
            type="button"
            className={action === "check_in" ? "active" : ""}
            disabled={step !== "idle"}
            onClick={() => setAction("check_in")}
          >
            Vào ca
          </button>
          <button
            type="button"
            className={action === "check_out" ? "active" : ""}
            disabled={step !== "idle"}
            onClick={() => setAction("check_out")}
          >
            Ra ca
          </button>
        </div>

        {/* Dynamic Step Progress Indicator */}
        <div className="step-tracker" style={{ display: "flex", justifyContent: "center", gap: 16, margin: "10px 0 14px", fontSize: 12, color: "#7b6f70" }}>
          <span style={{ fontWeight: step === "idle" || step === "preparing" ? 700 : 400, color: step === "idle" || step === "preparing" ? "#6f2939" : undefined }}>1. Bắt đầu</span>
          <span>➔</span>
          <span style={{ fontWeight: step === "ready" ? 700 : 400, color: step === "ready" ? "#6f2939" : undefined }}>2. Chụp ảnh</span>
          <span>➔</span>
          <span style={{ fontWeight: step === "review_photo" ? 700 : 400, color: step === "review_photo" ? "#6f2939" : undefined }}>3. Xem lại</span>
          <span>➔</span>
          <span style={{ fontWeight: step === "success" ? 700 : 400, color: step === "success" ? "#4c9779" : undefined }}>4. Hoàn tất</span>
        </div>

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

        {/* Verification Evidence Summary Chips */}
        <div className="capture-evidence">
          <Evidence label="Thời gian" value={result ? result.localTime : "Máy chủ xác nhận"} icon={Clock3} />
          <Evidence label="Tín hiệu vị trí" value={location ? `Đã lấy (±${Math.round(location.accuracy)} m)` : "Chờ quyền"} icon={MapPin} />
          <Evidence label="Mạng cửa hàng" value={location ? `Tham khảo (${Math.round(location.distance)} m)` : "Chưa xác minh"} icon={ShieldAlert} />
        </div>

        {/* Action Controls */}
        <div className="capture-actions">
          {step === "idle" && (
            <button className="button button-large" onClick={beginCapture}>
              <Camera size={18} /> {action === "check_in" ? "Bước 1: Bắt đầu vào ca" : "Bước 1: Bắt đầu ra ca"}
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

        <div style={{ marginTop: 12, display: "flex", justifyContent: "between", alignItems: "center" }}>
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
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-[#eee3df]">
            <div className="flex items-center justify-between pb-3 border-b border-[#eee3df]">
              <h3 className="font-bold text-[#6f2939] text-base flex items-center gap-2">
                <ShieldAlert size={18} className="text-[#d96d83]" /> Nguyên tắc bảo vệ dữ liệu
              </h3>
              <button
                onClick={() => setShowPrivacyModal(false)}
                className="p-1 rounded-full hover:bg-[#fff2f4] text-[#7b6f70]"
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
              className="w-full py-2.5 bg-[#fff2f4] hover:bg-[#ffe1e7] text-[#6f2939] font-bold rounded-2xl text-xs"
            >
              Tôi đã hiểu
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function Evidence({ label, value, icon: Icon }: { label: string; value: string; icon: React.ComponentType<{ size?: number }> }) {
  return (
    <div className="evidence-chip">
      <small><Icon size={11} style={{ display: "inline", marginRight: 4 }} />{label}</small>
      <strong>{value}</strong>
    </div>
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
