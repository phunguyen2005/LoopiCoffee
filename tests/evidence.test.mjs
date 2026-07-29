import assert from "node:assert/strict";
import test from "node:test";
import {
  createServerStampedSvg,
  evidenceObjectKey,
  validateJpegDataUrl,
} from "../lib/evidence.ts";
import { distanceInMeters } from "../lib/attendance.ts";

function structuredJpegDataUrl(width = 640, height = 480) {
  const bytes = Uint8Array.from([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03,
    0x01, 0x11, 0x00,
    0x02, 0x11, 0x00,
    0x03, 0x11, 0x00,
    0xff, 0xd9,
  ]);
  return `data:image/jpeg;base64,${Buffer.from(bytes).toString("base64")}`;
}

test("rejects JPEG-shaped payloads that cannot be decoded", () => {
  assert.throws(
    () => validateJpegDataUrl(structuredJpegDataUrl()),
    /giải mã nội dung JPEG/i,
  );
  assert.throws(
    () => validateJpegDataUrl("data:image/jpeg;base64,SGVsbG8="),
    /không phải ảnh JPEG|không hợp lệ/i,
  );
});

test("creates a server-owned stamped image with authoritative evidence", () => {
  const photo = {
    bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
    base64: "/9j/2Q==",
    width: 640,
    height: 480,
  };
  const stamped = createServerStampedSvg({
    photo,
    action: "check_in",
    localTime: "29/07/2026 08:05:21",
    latitude: 10.754128,
    longitude: 106.66754,
    accuracy: 18,
    distance: 24,
    eventId: "7f3a91c2-aaaa-bbbb-cccc-111111111111",
  });
  const svg = new TextDecoder().decode(stamped);
  assert.match(svg, /LoopiCafe · VÀO CA/);
  assert.match(svg, /Giờ máy chủ/);
  assert.match(svg, /10\.754128, 106\.667540/);
  assert.match(svg, /Mã sự kiện: 7F3A91C2/);
  assert.match(svg, /data:image\/jpeg;base64/);
});

test("keeps PII out of private evidence object keys", () => {
  const key = evidenceObjectKey(
    "store-loopi",
    "employee-uuid",
    "event-uuid",
    "2026-07-29T01:00:00.000Z",
  );
  assert.equal(key, "store-loopi/attendance/employee-uuid/2026/07/event-uuid.svg");
  assert.doesNotMatch(key, /@|latitude|longitude/i);
});

test("calculates evidence distance without geofence conclusions", () => {
  const distance = distanceInMeters(10.754128, 106.66754, 10.754228, 106.66754);
  assert.ok(distance > 10 && distance < 12);
});
