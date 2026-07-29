"use client";

import { CheckCircle2, LoaderCircle, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

export function ConsentAction() {
  const [state, setState] = useState<"loading" | "anonymous" | "ready" | "saving" | "consented">("loading");

  useEffect(() => {
    fetch("/api/consent", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) return setState("anonymous");
        if (!response.ok) return setState("ready");
        const payload = (await response.json()) as { consented?: boolean };
        setState(payload.consented ? "consented" : "ready");
      })
      .catch(() => setState("ready"));
  }, []);

  async function consent() {
    setState("saving");
    const response = await fetch("/api/consent", { method: "POST" });
    setState(response.ok ? "consented" : response.status === 401 ? "anonymous" : "ready");
  }

  return (
    <section className="consent-card" aria-live="polite">
      {state === "consented" ? <CheckCircle2 size={25} /> : <ShieldCheck size={25} />}
      <div>
        <h2>{state === "consented" ? "Bạn đã đồng ý" : "Xác nhận trước khi chấm công"}</h2>
        <p>
          {state === "consented"
            ? "Sự đồng ý đã được ghi nhận theo phiên bản thông báo hiện tại."
            : state === "anonymous"
              ? "Hãy đăng nhập bằng tài khoản được cửa hàng mời để ghi nhận sự đồng ý."
              : "Tôi đã đọc, hiểu mục đích, người được xem và thời hạn lưu ảnh cùng vị trí chính xác."}
        </p>
      </div>
      {(state === "ready" || state === "saving") && (
        <button className="button button-compact" onClick={consent} disabled={state === "saving"}>
          {state === "saving" ? <LoaderCircle size={15} className="spin" /> : <ShieldCheck size={15} />}
          Tôi đồng ý
        </button>
      )}
    </section>
  );
}
