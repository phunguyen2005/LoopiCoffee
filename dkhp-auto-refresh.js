(() => {
  const INTERVAL_MS = 2_000;
  const DURATION_MS = 30 * 60 * 1_000;
  const STATE_KEY = "__dkhpAutoRefresh";

  // Stop an older copy if this script is pasted more than once.
  window[STATE_KEY]?.stop?.("Đã thay bằng phiên chạy mới.");

  const startedAt = Date.now();
  const endsAt = startedAt + DURATION_MS;
  let clickCount = 0;
  let intervalId;
  let stopTimeoutId;
  let stopped = false;

  const normalizeText = (value) =>
    value.replace(/\s+/g, " ").trim().toLocaleLowerCase("vi");

  const findRefreshButton = () =>
    [...document.querySelectorAll("button, [role='button']")].find(
      (element) => normalizeText(element.textContent ?? "") === "làm mới",
    );

  const stop = (reason = "Đã dừng theo yêu cầu.") => {
    if (stopped) return;

    stopped = true;
    clearInterval(intervalId);
    clearTimeout(stopTimeoutId);
    delete window[STATE_KEY];
    console.log(
      `[DKHP] ${reason} Tổng số lần đã bấm: ${clickCount}.`,
    );
  };

  const refresh = () => {
    if (Date.now() >= endsAt) {
      stop("Đã chạy đủ 30 phút.");
      return;
    }

    const button = findRefreshButton();

    if (!button) {
      console.warn('[DKHP] Không tìm thấy nút "Làm mới" trên trang.');
      return;
    }

    if (button.disabled || button.getAttribute("aria-disabled") === "true") {
      console.log("[DKHP] Nút đang bận, bỏ qua lượt này.");
      return;
    }

    button.click();
    clickCount += 1;
    console.log(
      `[DKHP] Lần ${clickCount}: ${new Date().toLocaleTimeString("vi-VN")}`,
    );
  };

  window[STATE_KEY] = { stop };
  refresh();
  intervalId = setInterval(refresh, INTERVAL_MS);
  stopTimeoutId = setTimeout(
    () => stop("Đã chạy đủ 30 phút."),
    DURATION_MS,
  );

  console.log(
    `[DKHP] Đã bắt đầu: làm mới mỗi 2 giây trong 30 phút. ` +
      `Muốn dừng sớm, chạy window.${STATE_KEY}.stop() trong Console.`,
  );
})();
