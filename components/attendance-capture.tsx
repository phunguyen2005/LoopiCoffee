"use client";

import { Camera, CheckCircle2, Clock3, LoaderCircle, MapPin, RefreshCw, ShieldAlert } from "lucide-react";
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
  const [step, setStep] = useState<"idle" | "preparing" | "ready" | "submitting" | "success" | "error">("idle");
  const [location, setLocation] = useState<LocationEvidence | null>(null);
  const [session, setSession] = useState<CaptureSession | null>(null);
  const [result, setResult] = useState<AttendanceResult | null>(null);
  const [error, setError] = useState("");
  const [explanation, setExplanation] = useState("");
  const [preview, setPreview] = useState("");

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

  async function capture() {
    if (!session || !videoRef.current || !canvasRef.current || !location) return;
    setStep("submitting");
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
          photo: rawPhoto,
        }),
      });
      const payload = (await actionResponse.json()) as AttendanceResult & { error?: string };
      if (!actionResponse.ok) throw new Error(payload.error || "Không thể ghi nhận chấm công.");

      setPreview(rawPhoto);
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
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Ảnh chấm công có thời gian và vị trí" className="capture-preview" />
        ) : (
          <video
            ref={videoRef}
            className="capture-video"
            playsInline
            muted
            style={{ display: step === "ready" || step === "submitting" ? "block" : "none" }}
          />
        )}
        {(step === "idle" || step === "preparing" || step === "error") && !preview && (
          <div className="capture-placeholder">
            {step === "preparing" ? <LoaderCircle size={42} className="spin" /> : step === "error" ? <ShieldAlert size={42} /> : <Camera size={42} />}
            <h3>{step === "preparing" ? "Đang chuẩn bị camera & vị trí…" : step === "error" ? "Chưa lấy được bằng chứng" : action === "check_in" ? "Chấm vào ca bằng ảnh trực tiếp" : "Chấm ra ca bằng ảnh trực tiếp"}</h3>
            <p>{step === "error" ? error : "Camera và vị trí chỉ bắt đầu sau khi bạn bấm nút bên dưới. LoopiCafe không theo dõi vị trí nền."}</p>
          </div>
        )}
        {step === "success" && result && !preview && (
          <div className="capture-placeholder">
            <CheckCircle2 size={46} />
            <h3>{action === "check_in" ? "Đã ghi nhận vào ca" : "Đã ghi nhận ra ca"}</h3>
            <p>Giờ máy chủ: {result.localTime}. Ảnh hoặc vị trí chưa đầy đủ nên phiên này không được tự động xác nhận.</p>
          </div>
        )}
        {step === "ready" && location && (
          <div className="capture-overlay">
            <strong>Vị trí vừa ghi nhận</strong><br />
            {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)} · ±{Math.round(location.accuracy)} m · cách quán {Math.round(location.distance)} m
          </div>
        )}
        {step === "success" && result && preview && (
          <div className="capture-overlay">
            <strong>{result.evidenceStored ? "Máy chủ đã đóng dấu & lưu riêng tư" : "Đã ghi nhận ngoại lệ để xem xét"}</strong><br />
            {result.localTime} · {result.reviewRequired ? "Cần quản lý duyệt" : "Bằng chứng đầy đủ"}
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
        {action === "check_out" && step === "idle" && (
          <p className="checkout-warning">
            Việc mở/đóng ca chưa hoàn tất vẫn không chặn ra ca. Bạn sẽ được yêu cầu giải thích và quản lý sẽ xem lại.
          </p>
        )}
        {step === "error" && (
          <div className="field exception-field">
            <label htmlFor="attendance-explanation">Giải thích cho quản lý</label>
            <textarea
              id="attendance-explanation"
              value={explanation}
              onChange={(event) => setExplanation(event.target.value)}
              placeholder="Ví dụ: Camera điện thoại đang bị lỗi, tôi đã báo trực tiếp cho trưởng ca."
            />
          </div>
        )}
        <div className="capture-evidence">
          <Evidence label="Thời gian" value={result ? result.localTime : "Máy chủ xác nhận"} icon={Clock3} />
          <Evidence label="Vị trí" value={location ? `±${Math.round(location.accuracy)} m` : "Chờ quyền truy cập"} icon={MapPin} />
          <Evidence label="Khoảng cách" value={location ? `${Math.round(location.distance)} m` : "Chỉ để tham khảo"} icon={ShieldAlert} />
        </div>
        <div className="capture-actions">
          {step === "idle" && <button className="button button-large" onClick={beginCapture}><Camera size={18} /> {action === "check_in" ? "Bắt đầu vào ca" : "Bắt đầu ra ca"}</button>}
          {step === "ready" && <button className="button button-large" onClick={capture}><Camera size={18} /> Chụp & ghi nhận {action === "check_in" ? "vào ca" : "ra ca"}</button>}
          {step === "preparing" || step === "submitting" ? <button className="button button-large" disabled><LoaderCircle size={18} className="spin" /> Đang xử lý…</button> : null}
          {step === "error" && (
            <>
              <button className="button-secondary button-compact" onClick={reset}><RefreshCw size={15} /> Thử lại</button>
              <button className="button button-compact" onClick={submitException} disabled={explanation.trim().length < 5}>Gửi để duyệt thủ công</button>
            </>
          )}
          {step === "success" && <button className="button-secondary button-compact" onClick={reset}>Hoàn tất</button>}
        </div>
        <p className="capture-note">
          Vị trí và khoảng cách là bằng chứng tham khảo, không phải kết luận bạn đang có mặt tại quán.
        </p>
      </div>
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
    return "Bạn chưa cho phép camera hoặc vị trí. Có thể thử lại sau khi bật quyền trong trình duyệt.";
  }
  if (typeof caught === "object" && caught !== null && "code" in caught) {
    return (caught as { code?: number }).code === 3
      ? "Không lấy được vị trí trong 10 giây."
      : "Thiết bị chưa cung cấp được vị trí hiện tại.";
  }
  return caught instanceof Error ? caught.message : "Thiết bị chưa sẵn sàng.";
}
