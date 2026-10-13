const JPEG_PREFIX = "data:image/jpeg;base64,";
const MAX_RAW_PHOTO_BYTES = 2 * 1024 * 1024;

export type ValidatedJpeg = {
  bytes: Uint8Array;
  base64: string;
  width: number;
  height: number;
};

export type StampInput = {
  photo: ValidatedJpeg;
  action: "check_in" | "check_out";
  localTime: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  distance: number;
  eventId: string;
};

export function validateJpegDataUrl(value: unknown): ValidatedJpeg {
  if (typeof value !== "string" || !value.startsWith(JPEG_PREFIX)) {
    throw new Error("Ảnh phải là dữ liệu JPEG hợp lệ.");
  }
  const base64 = value.slice(JPEG_PREFIX.length);
  if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new Error("Dữ liệu ảnh không hợp lệ.");
  }
  let bytes: Uint8Array;
  try {
    if (typeof Buffer !== "undefined") {
      bytes = new Uint8Array(Buffer.from(base64, "base64"));
    } else {
      const binaryString = atob(base64);
      bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
    }
  } catch {
    throw new Error("Không thể giải mã ảnh.");
  }
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_RAW_PHOTO_BYTES) {
    throw new Error("Ảnh phải nhỏ hơn 2 MB.");
  }
  if (
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes[bytes.length - 2] !== 0xff ||
    bytes[bytes.length - 1] !== 0xd9
  ) {
    throw new Error("Nội dung tải lên không phải ảnh JPEG.");
  }
  const dimensions = parseJpegDimensions(bytes);
  if (dimensions.width < 240 || dimensions.height < 240) {
    throw new Error("Ảnh quá nhỏ hoặc không đọc được kích thước.");
  }
  if (dimensions.width > 2048 || dimensions.height > 2048) {
    throw new Error("Kích thước ảnh vượt quá giới hạn.");
  }
  return { bytes, base64, ...dimensions };
}

export function createServerStampedSvg(input: StampInput) {
  const { photo } = input;
  const footerHeight = Math.max(150, Math.round(photo.height * 0.22));
  const canvasHeight = photo.height + footerHeight;
  const headlineSize = Math.max(24, Math.round(photo.width / 36));
  const bodySize = Math.max(18, Math.round(photo.width / 52));
  const actionLabel = input.action === "check_in" ? "VÀO CA" : "RA CA";
  const coordinateLine =
    `${input.latitude.toFixed(6)}, ${input.longitude.toFixed(6)} · ` +
    `Độ chính xác ±${Math.round(input.accuracy)} m · Cách quán ${Math.round(input.distance)} m`;
  const eventLabel = `Mã sự kiện: ${input.eventId.slice(0, 8).toUpperCase()}`;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${photo.width}" height="${canvasHeight}" viewBox="0 0 ${photo.width} ${canvasHeight}">`,
    `<rect width="100%" height="100%" fill="#231418"/>`,
    `<image href="data:image/jpeg;base64,${photo.base64}" x="0" y="0" width="${photo.width}" height="${photo.height}" preserveAspectRatio="xMidYMid slice"/>`,
    `<rect x="0" y="${photo.height}" width="${photo.width}" height="${footerHeight}" fill="#231418"/>`,
    `<text x="26" y="${photo.height + headlineSize + 22}" fill="#ffffff" font-family="Arial, sans-serif" font-size="${headlineSize}" font-weight="700">LoopiCafe · ${actionLabel}</text>`,
    `<text x="26" y="${photo.height + headlineSize + bodySize + 42}" fill="#ffe1e7" font-family="Arial, sans-serif" font-size="${bodySize}" font-weight="600">${escapeXml(input.localTime)} GMT+7 · Giờ máy chủ</text>`,
    `<text x="26" y="${photo.height + headlineSize + bodySize * 2 + 60}" fill="#ffffff" font-family="Arial, sans-serif" font-size="${bodySize}">${escapeXml(coordinateLine)}</text>`,
    `<text x="26" y="${canvasHeight - 18}" fill="#d8c9cc" font-family="Arial, sans-serif" font-size="${Math.max(14, bodySize - 3)}">${escapeXml(eventLabel)} · Vị trí là bằng chứng tham khảo</text>`,
    "</svg>",
  ].join("");
  return new TextEncoder().encode(svg);
}

export async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function evidenceObjectKey(storeId: string, employeeId: string, eventId: string, recordedAt: string) {
  const date = new Date(recordedAt);
  return `${storeId}/attendance/${employeeId}/${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${eventId}.svg`;
}

export function parseJpegDimensions(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error("Nội dung tải lên không phải ảnh JPEG.");
  }
  let offset = 2;
  let dimensions: { width: number; height: number } | null = null;
  let hasSos = false;

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      throw new Error("Không thể giải mã nội dung JPEG.");
    }
    while (offset < bytes.length && bytes[offset] === 0xff) {
      offset += 1;
    }
    if (offset >= bytes.length) {
      throw new Error("Không thể giải mã nội dung JPEG.");
    }
    const marker = bytes[offset];
    offset += 1;

    // Standalone markers without length payload
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      continue;
    }
    // EOI (End of image)
    if (marker === 0xd9) {
      break;
    }

    // Segment with length payload
    if (offset + 2 > bytes.length) {
      throw new Error("Không thể giải mã nội dung JPEG.");
    }
    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > bytes.length) {
      throw new Error("Không thể giải mã nội dung JPEG.");
    }

    // SOF markers:
    // SOF0 (0xC0), SOF1 (0xC1), SOF2 (0xC2), SOF3 (0xC3),
    // SOF5..SOF7 (0xC5..0xC7), SOF9..SOF11 (0xC9..0xCB), SOF13..SOF15 (0xCD..0xCF)
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);

    if (isSof) {
      if (segmentLength < 8) {
        throw new Error("Không thể giải mã nội dung JPEG.");
      }
      const precision = bytes[offset + 2];
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      const components = bytes[offset + 7];

      if (precision !== 8 && precision !== 12) {
        throw new Error("Không thể giải mã nội dung JPEG.");
      }
      if (components !== 1 && components !== 3 && components !== 4) {
        throw new Error("Không thể giải mã nội dung JPEG.");
      }
      if (width <= 0 || height <= 0) {
        throw new Error("Ảnh quá nhỏ hoặc không đọc được kích thước.");
      }
      dimensions = { width, height };
    } else if (marker === 0xda) {
      // SOS (Start of Scan)
      hasSos = true;
      offset += segmentLength;
      if (offset >= bytes.length - 2) {
        // Missing scan data between SOS and EOI
        throw new Error("Không thể giải mã nội dung JPEG.");
      }
      break;
    }

    offset += segmentLength;
  }

  if (!dimensions || !hasSos) {
    throw new Error("Không thể giải mã nội dung JPEG.");
  }

  return dimensions;
}

export const readJpegDimensions = parseJpegDimensions;

function escapeXml(value: string) {
  return value.replace(/[<>&"']/g, (character) => {
    if (character === "<") return "&lt;";
    if (character === ">") return "&gt;";
    if (character === "&") return "&amp;";
    if (character === '"') return "&quot;";
    return "&apos;";
  });
}
