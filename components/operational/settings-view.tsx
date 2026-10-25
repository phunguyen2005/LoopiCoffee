"use client";

import type { Map as LeafletMap, Marker, Circle, LeafletMouseEvent } from "leaflet";
import "leaflet/dist/leaflet.css";
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, Check, CheckCircle2, MapPin, Building, Sliders, Shield, FileClock, ExternalLink, Wifi } from "lucide-react";
import { InputField, ViewHeader, readJson } from "./shared";
const localOnly = process.env.NEXT_PUBLIC_LOCAL_ONLY === "true";

export function PersistentStoreSettingsView() {
  const [activeTab, setActiveTab] = useState<"store" | "rules" | "system">("store");
  const [detectedIp, setDetectedIp] = useState("");
  const [form, setForm] = useState({
    name: "",
    address: "",
    latitude: 10.754128,
    longitude: 106.66754,
    geofenceRadiusMeters: 100,
    wifiSsid: "",
    wifiPublicIp: "",
    timezone: "Asia/Ho_Chi_Minh",
    earlyCheckinMinutes: "15",
    lateMinutes: "5",
    earlyDepartureMinutes: "5",
    absenceMinutes: "60",
    missingCheckoutMinutes: "240",
  });

  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [message, setMessage] = useState<string | null>("Đang tải thiết lập…");
  const [isSuccess, setIsSuccess] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<LeafletMap | null>(null);
  const leafletMarkerRef = useRef<Marker | null>(null);
  const leafletCircleRef = useRef<Circle | null>(null);
  const [leaflet, setLeaflet] = useState<typeof import("leaflet") | null>(null);

  useEffect(() => {
    fetch("/api/store", { cache: "no-store" })
      .then(readJson<{ store?: { name?: string; address?: string; latitude?: number; longitude?: number; geofence_radius_meters?: number; timezone?: string; wifi_ssid?: string; wifi_public_ip?: string }; rules?: Record<string, number>; detectedClientIp?: string }>)
      .then((payload) => {
        const store = payload.store ?? {};
        const rules = payload.rules ?? {};
        const lat = Number(store.latitude) || 10.754128;
        const lng = Number(store.longitude) || 106.66754;
        const radius = Number(store.geofence_radius_meters) || 100;
        if (payload.detectedClientIp) setDetectedIp(payload.detectedClientIp);

        setForm({
          name: store.name ?? "LoopyCafe Main Store",
          address: store.address ?? "Nguyễn Trãi, Quận 5, TP. Hồ Chí Minh",
          latitude: lat,
          longitude: lng,
          geofenceRadiusMeters: radius,
          wifiSsid: store.wifi_ssid ?? "",
          wifiPublicIp: store.wifi_public_ip ?? "",
          timezone: store.timezone ?? "Asia/Ho_Chi_Minh",
          earlyCheckinMinutes: String(rules.early_checkin_minutes ?? 15),
          lateMinutes: String(rules.late_minutes ?? 5),
          earlyDepartureMinutes: String(rules.early_departure_minutes ?? 5),
          absenceMinutes: String(rules.absence_minutes ?? 60),
          missingCheckoutMinutes: String(rules.missing_checkout_minutes ?? 240),
        });
        setMessage(null);
      })
      .catch(() => setMessage("Không tải được thiết lập. Hãy tải lại trang trước khi lưu để tránh ghi đè cấu hình hiện tại."))
      .finally(() => setLoadingSettings(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (localOnly) return;
    import("leaflet").then((library) => {
      if (!cancelled) setLeaflet(library);
    }).catch(() => { if (!cancelled) setMessage("Không tải được bản đồ. Bạn vẫn có thể nhập tọa độ."); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => () => {
    leafletMapRef.current?.remove();
    leafletMapRef.current = null;
    leafletMarkerRef.current = null;
    leafletCircleRef.current = null;
  }, []);

  useEffect(() => {
    if (!leaflet || !mapRef.current) return;
    const L = leaflet;
    if (!L) return;

    const lat = form.latitude;
    const lng = form.longitude;
    const radius = form.geofenceRadiusMeters;

    if (!leafletMapRef.current) {
      const map = L.map(mapRef.current, { zoomControl: true }).setView([lat, lng], 17);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      const marker = L.marker([lat, lng], { draggable: true, icon: L.divIcon({
        className: "store-map-pin", html: '<span style="display:block;width:20px;height:20px;border:3px solid white;border-radius:50%;background:#6f2939;box-shadow:0 1px 6px #333"></span>',
        iconSize: [20, 20], iconAnchor: [10, 10],
      }) }).addTo(map);
      const circle = L.circle([lat, lng], {
        radius,
        color: "#6f2939",
        fillColor: "#d96d83",
        fillOpacity: 0.25,
        weight: 2,
      }).addTo(map);

      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        circle.setLatLng(pos);
        setForm((prev) => ({ ...prev, latitude: pos.lat, longitude: pos.lng }));
        reverseGeocode(pos.lat, pos.lng);
      });

      map.on("click", (e: LeafletMouseEvent) => {
        marker.setLatLng(e.latlng);
        circle.setLatLng(e.latlng);
        setForm((prev) => ({ ...prev, latitude: e.latlng.lat, longitude: e.latlng.lng }));
        reverseGeocode(e.latlng.lat, e.latlng.lng);
      });

      leafletMapRef.current = map;
      leafletMarkerRef.current = marker;
      leafletCircleRef.current = circle;
    } else {
      leafletMapRef.current.setView([lat, lng], leafletMapRef.current.getZoom());
      leafletMarkerRef.current?.setLatLng([lat, lng]);
      leafletCircleRef.current?.setLatLng([lat, lng]);
      leafletCircleRef.current?.setRadius(radius);
    }
  }, [leaflet, form.latitude, form.longitude, form.geofenceRadiusMeters]);

  async function reverseGeocode(lat: number, lng: number) {
    if (localOnly) return;
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=vi`
      );
      const data = await readJson<{ display_name?: string }>(res);
      if (data && data.display_name) {
        setForm((prev) => ({ ...prev, address: data.display_name ?? prev.address }));
      }
    } catch {
      // Fallback silent
    }
  }

  async function handleAddressSearch(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (localOnly) { setMessage("Nhập tọa độ trực tiếp khi đang chạy cục bộ."); return; }
    if (!form.address.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          form.address
        )}&limit=1&accept-language=vi`
      );
      const data = await readJson<Array<{ lat: string; lon: string; display_name?: string }>>(res);
      if (data && data[0]) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        setForm((prev) => ({
          ...prev,
          latitude: lat,
          longitude: lng,
          address: data[0].display_name || prev.address,
        }));
      } else {
        setMessage("Không tìm thấy tọa độ cho địa chỉ này trên bản đồ.");
      }
    } catch {
      setMessage("Không thể tra cứu địa chỉ lúc này.");
    } finally {
      setSearching(false);
    }
  }

  function handleUseCurrentLocation() {
    if (!navigator.geolocation) {
      setMessage("Trình duyệt không hỗ trợ truy cập GPS.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setForm((prev) => ({ ...prev, latitude: lat, longitude: lng }));
        reverseGeocode(lat, lng);
        setLocating(false);
      },
      () => {
        setMessage("Không thể lấy vị trí hiện tại. Vui lòng cho phép quyền truy cập vị trí.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    let finalValue = value;
    if (
      key === "earlyCheckinMinutes" ||
      key === "lateMinutes" ||
      key === "earlyDepartureMinutes" ||
      key === "absenceMinutes" ||
      key === "missingCheckoutMinutes"
    ) {
      if (typeof value === "string") {
        finalValue = value.replace(/\D/g, "") as (typeof form)[K];
      }
    }
    setForm((current) => ({ ...current, [key]: finalValue }));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    setIsSuccess(false);

    const earlyCheckin = Number.parseInt(form.earlyCheckinMinutes, 10);
    const late = Number.parseInt(form.lateMinutes, 10);
    const earlyDeparture = Number.parseInt(form.earlyDepartureMinutes, 10);
    const absence = Number.parseInt(form.absenceMinutes, 10);
    const missingCheckout = Number.parseInt(form.missingCheckoutMinutes, 10);

    if (
      Number.isNaN(earlyCheckin) || earlyCheckin < 0 || earlyCheckin > 180 ||
      Number.isNaN(late) || late < 0 || late > 180 ||
      Number.isNaN(earlyDeparture) || earlyDeparture < 0 || earlyDeparture > 240 ||
      Number.isNaN(absence) || absence < 1 || absence > 720 ||
      Number.isNaN(missingCheckout) || missingCheckout < 1 || missingCheckout > 720
    ) {
      setSubmitting(false);
      setMessage("Vui lòng nhập các giá trị thời gian quy tắc chấm công là số hợp lệ.");
      return;
    }

    const payload = {
      ...form,
      earlyCheckinMinutes: earlyCheckin,
      lateMinutes: late,
      earlyDepartureMinutes: earlyDeparture,
      absenceMinutes: absence,
      missingCheckoutMinutes: missingCheckout,
    };

    try {
      const response = await fetch("/api/store", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await readJson<{ error?: string; ruleVersion: number }>(response);
      if (!response.ok) {
        throw new Error(data.error ?? "Không thể lưu thiết lập.");
      }
      setIsSuccess(true);
      setMessage(`Đã lưu thiết lập cửa hàng thành công! (Quy tắc v${data.ruleVersion})`);
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Đã có lỗi xảy ra.");
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (activeTab === "store" && leafletMapRef.current) {
      const timer = setTimeout(() => {
        leafletMapRef.current?.invalidateSize();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [activeTab]);

  return (
    <div className="stack" style={{ gap: 20 }}>
      {/* Navigation Tab Bar */}
      <section className="card" style={{ padding: "12px 18px" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            { key: "store", label: "Cửa hàng & Vị trí Geofence", icon: Building },
            { key: "rules", label: "Quy tắc Chấm công & Ca làm", icon: Sliders },
            { key: "system", label: "Quản trị Nâng cao & Kiểm toán", icon: Shield },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                className={`filter-chip ${isActive ? "active" : ""}`}
                onClick={() => setActiveTab(tab.key as typeof activeTab)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 16px",
                  borderRadius: 12,
                  fontSize: "0.85rem",
                  fontWeight: isActive ? 700 : 500,
                  border: isActive ? "1px solid var(--primary, #6f2939)" : "1px solid var(--border-subtle, #e2e8f0)",
                  background: isActive ? "var(--primary, #6f2939)" : "transparent",
                  color: isActive ? "#fff" : "inherit",
                  cursor: "pointer",
                }}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {message && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: 16,
            background: isSuccess ? "#dff3ea" : "#fff2f4",
            border: `1px solid ${isSuccess ? "#b8e6d3" : "#ffe1e7"}`,
            color: isSuccess ? "#4c9779" : "#c75865",
            fontSize: 13,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {isSuccess ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{message}</span>
        </div>
      )}

      {/* Main Settings Form */}
      <form onSubmit={save} className="space-y-6">
        {/* TAB 1: Store Info & Geofence Map */}
        <div style={{ display: activeTab === "store" ? "block" : "none" }}>
          <section className="card">
            <ViewHeader
              title="1. Thông tin & Vị trí cửa hàng"
              subtitle="Địa điểm chính thức và bán kính tham khảo khi đối soát chấm công"
            />

            <div className="page-grid" style={{ marginTop: 16 }}>
              <div className="space-y-4">
                <div className="field full">
                  <label htmlFor="store-name">Tên cửa hàng</label>
                  <input
                    id="store-name"
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                    placeholder="Ví dụ: LoopyCafe Nguyễn Trãi"
                  />
                </div>

                <div className="field full">
                  <label htmlFor="store-address">Địa chỉ cửa hàng</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      id="store-address"
                      type="text"
                      required
                      value={form.address}
                      onChange={(e) => update("address", e.target.value)}
                      placeholder="Nhập địa chỉ (VD: 123 Lê Lợi, Quận 1, TP.HCM)…"
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      onClick={handleAddressSearch}
                      disabled={searching || localOnly}
                      className="button button-compact secondary"
                      style={{ whiteSpace: "nowrap" }}
                    >
                      {searching ? "Đang tìm…" : "Tìm vị trí"}
                    </button>
                  </div>
                  <small style={{ fontSize: 11, color: "var(--muted)", marginTop: 4, display: "block" }}>
                    {localOnly ? "Nhập tọa độ bên dưới. Bản đồ trực tuyến được tắt trong môi trường cục bộ." : "Hoặc kéo thả ghim màu đỏ trên bản đồ để tinh chỉnh vị trí cửa hàng chính xác."}
                  </small>
                </div>

                <div className="field full">
                  <label>Bán kính tham khảo của cửa hàng</label>
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    {[50, 100, 150, 200].map((radius) => (
                      <button
                        key={radius}
                        type="button"
                        onClick={() => update("geofenceRadiusMeters", radius)}
                        aria-pressed={form.geofenceRadiusMeters === radius}
                        className={form.geofenceRadiusMeters === radius ? "button button-compact" : "button-secondary button-compact"}
                        style={{
                          flex: 1,
                          fontWeight: form.geofenceRadiusMeters === radius ? 700 : 500,
                        }}
                      >
                        {form.geofenceRadiusMeters === radius && <Check size={14} aria-hidden="true" />} {radius}m
                      </button>
                    ))}
                  </div>
                  <small style={{ fontSize: 11, color: "var(--muted)", marginTop: 6, display: "block" }}>
                    Khoảng cách chỉ dùng để tham khảo, không tự chặn chấm công hoặc tạo ngoại lệ.
                  </small>
                </div>

                <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
                  <button
                    type="button"
                    onClick={handleUseCurrentLocation}
                    disabled={locating}
                    className="button button-compact secondary"
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <MapPin size={15} /> {locating ? "Đang định vị…" : "Dùng vị trí hiện tại của tôi"}
                  </button>
                </div>

                <div className="field full" style={{ borderTop: "1px dashed #e2e8f0", paddingTop: 14 }}>
                  <label htmlFor="store-wifi-ssid" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Wifi size={14} className="text-[#6f2939]" /> Tên mạng Wi-Fi của quán (SSID)
                  </label>
                  <input
                    id="store-wifi-ssid"
                    type="text"
                    value={form.wifiSsid}
                    onChange={(e) => update("wifiSsid", e.target.value)}
                    placeholder="Ví dụ: LoopyCafe_WiFi (sẽ hiện trên ảnh chấm công)"
                  />
                  <small style={{ fontSize: 11, color: "var(--muted)", marginTop: 4, display: "block" }}>
                    Tên Wi-Fi này sẽ được in trực tiếp lên ảnh chấm công khi nhân viên kết nối đúng mạng của quán.
                  </small>
                </div>

                <div className="field full">
                  <label htmlFor="store-wifi-ip">Địa chỉ IP mạng của quán (Định danh thiết bị)</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      id="store-wifi-ip"
                      type="text"
                      value={form.wifiPublicIp}
                      onChange={(e) => update("wifiPublicIp", e.target.value)}
                      placeholder="IP công cộng (VD: 14.161.x.x hoặc 127.0.0.1)"
                      style={{ flex: 1 }}
                    />
                    {detectedIp && (
                      <button
                        type="button"
                        onClick={() => update("wifiPublicIp", detectedIp)}
                        className="button button-compact secondary"
                        style={{ whiteSpace: "nowrap" }}
                      >
                        Dùng IP hiện tại ({detectedIp})
                      </button>
                    )}
                  </div>
                  <small style={{ fontSize: 11, color: "var(--muted)", marginTop: 4, display: "block" }}>
                    Hệ thống đối soát IP của nhân viên khi vào ca để xác thực đang ở quán mà không phụ thuộc tên Wi-Fi ảo.
                  </small>
                </div>
              </div>

              <div
                style={{
                  borderRadius: 20,
                  overflow: "hidden",
                  border: "1px solid #eee3df",
                  minHeight: 280,
                  position: "relative",
                  background: "#fffaf4",
                }}
              >
                <div ref={mapRef} style={{ width: "100%", height: "100%", minHeight: 280 }} />
                {(localOnly || !leaflet) && (
                  <div className="store-map-fallback" role="status">
                    <MapPin size={24} aria-hidden="true" />
                    <strong>{localOnly ? "Bản đồ trực tuyến đang tắt ở môi trường local" : "Đang tải bản đồ…"}</strong>
                    <span>Bạn vẫn có thể nhập và lưu tọa độ cửa hàng bằng biểu mẫu.</span>
                  </div>
                )}
                <div
                  style={{
                    position: "absolute",
                    bottom: 8,
                    left: 8,
                    right: 8,
                    background: "rgba(255, 255, 255, 0.92)",
                    backdropFilter: "blur(4px)",
                    padding: "8px 12px",
                    borderRadius: 12,
                    fontSize: 11,
                    color: "#332a2b",
                    fontWeight: 600,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                    zIndex: 1000,
                  }}
                >
                  <span>
                    📍 Tọa độ: {form.latitude.toFixed(6)}, {form.longitude.toFixed(6)}
                  </span>
                  <span className="badge burgundy">Bán kính: {form.geofenceRadiusMeters}m</span>
                </div>
              </div>
            </div>

            <div className="form-actions" style={{ marginTop: 24 }}>
              <button className="button button-compact" type="submit" disabled={submitting || loadingSettings}>
                {submitting ? "Đang lưu thiết lập…" : "Lưu vị trí cửa hàng"}
              </button>
            </div>
          </section>
        </div>

        {/* TAB 2: Attendance Rules */}
        <div style={{ display: activeTab === "rules" ? "block" : "none" }}>
          <section className="card">
            <ViewHeader
              title="2. Quy tắc chấm công"
              subtitle="Cấu hình thời gian chấp nhận check-in, đi trễ, về sớm và vắng mặt"
            />
            <div className="form-grid" style={{ marginTop: 16 }}>
              <InputField
                id="early-checkin"
                label="Cho phép check-in trước ca tối đa (phút)"
                value={form.earlyCheckinMinutes}
                onChange={(value) => update("earlyCheckinMinutes", value)}
                placeholder="15"
                type="number"
                min={0}
                max={180}
                step={1}
                onlyNumbers
              />
              <InputField
                id="late"
                label="Tính đi trễ sau (phút)"
                value={form.lateMinutes}
                onChange={(value) => update("lateMinutes", value)}
                placeholder="5"
                type="number"
                min={0}
                max={180}
                step={1}
                onlyNumbers
              />
              <InputField
                id="early-departure"
                label="Tính về sớm trước (phút)"
                value={form.earlyDepartureMinutes}
                onChange={(value) => update("earlyDepartureMinutes", value)}
                placeholder="5"
                type="number"
                min={0}
                max={240}
                step={1}
                onlyNumbers
              />
              <InputField
                id="absence"
                label="Tự động đánh dấu vắng mặt sau (phút)"
                value={form.absenceMinutes}
                onChange={(value) => update("absenceMinutes", value)}
                placeholder="60"
                type="number"
                min={1}
                max={720}
                step={1}
                onlyNumbers
              />
            </div>
          </section>

          <section className="card" style={{ marginTop: 20 }}>
            <ViewHeader
              title="3. Quy tắc ca làm & Cảnh báo"
              subtitle="Tự động nhắc nhở nhân viên khi quên check-out ra ca"
            />
            <div className="form-grid" style={{ marginTop: 16 }}>
              <InputField
                id="missing-checkout"
                label="Cảnh báo chưa check-out sau (phút)"
                value={form.missingCheckoutMinutes}
                onChange={(value) => update("missingCheckoutMinutes", value)}
                placeholder="240"
                type="number"
                min={1}
                max={720}
                step={1}
                onlyNumbers
              />
            </div>

            <div className="form-actions" style={{ marginTop: 24 }}>
              <button className="button button-compact" type="submit" disabled={submitting || loadingSettings}>
                {submitting ? "Đang lưu thiết lập…" : "Lưu quy tắc chấm công"}
              </button>
            </div>
          </section>
        </div>
      </form>

      {/* TAB 3: Administrative Links (Level 3 Progressive Disclosure) */}
      {activeTab === "system" && (
        <div className="stack" style={{ gap: 16 }}>
          <section className="card" style={{ padding: "20px 24px" }}>
            <ViewHeader
              title="Hệ thống Quản trị & Tuân thủ Nâng cao"
              subtitle="Các thiết lập chuyên sâu dành cho Chủ cửa hàng (Owner) và Quản trị viên"
            />

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginTop: 18 }}>
              {/* Card 1: Accounts & Roles */}
              <div style={{ padding: 18, borderRadius: 14, border: "1px solid var(--border-subtle, #e2e8f0)", background: "var(--surface-subtle, #f8fafc)", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="mini-icon mint"><Shield size={16} /></span>
                  <strong style={{ fontSize: "1rem" }}>Quản trị Tài khoản & Phân quyền</strong>
                </div>
                <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--muted)" }}>
                  Cấp tài khoản mới, tạo mật khẩu tạm thời, phân quyền Quản lý/Trưởng ca và cài đặt mức lương theo giờ.
                </p>
                <Link
                  href="/app/admin/accounts"
                  className="button-secondary"
                  style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: "0.85rem", padding: "8px 12px" }}
                >
                  Mở Quản trị Tài khoản <ExternalLink size={14} />
                </Link>
              </div>

              {/* Card 2: Audit Trail */}
              <div style={{ padding: 18, borderRadius: 14, border: "1px solid var(--border-subtle, #e2e8f0)", background: "var(--surface-subtle, #f8fafc)", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="mini-icon pink"><FileClock size={16} /></span>
                  <strong style={{ fontSize: "1rem" }}>Lịch sử hoạt động</strong>
                </div>
                <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--muted)" }}>
                  Theo dõi minh bạch toàn bộ các hành động sửa giờ công, khóa bảng lương và cập nhật phân quyền nhân sự.
                </p>
                <Link
                  href="/app/audit"
                  className="button-secondary"
                  style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: "0.85rem", padding: "8px 12px" }}
                >
                  Mở Lịch sử hoạt động <ExternalLink size={14} />
                </Link>
              </div>
            </div>
          </section>

          {/* Privacy & Retention Information */}
          <section className="card" style={{ padding: "18px 22px" }}>
            <h4 style={{ margin: "0 0 6px", fontSize: "0.92rem", fontWeight: 700 }}>Chính sách lưu trữ & Bảo vệ dữ liệu nhân viên</h4>
            <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--muted)", lineHeight: 1.6 }}>
              Hệ thống tự động chạy tác vụ dọn dẹp định kỳ (cron retention): ảnh và tọa độ GPS chi tiết của nhân viên được xóa sau 90 ngày, trong khi sự kiện chấm công gốc vẫn được giữ để đối soát. Bằng chứng chỉ có thể truy xuất bởi tài khoản có quyền phù hợp.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
