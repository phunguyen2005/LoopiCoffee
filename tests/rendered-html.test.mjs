import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("renders the LoopiCafe Vietnamese landing page", async () => {
  const [page, layout, mascot] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/loopy-sticker.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /LoopiCafe/);
  assert.match(page, /Quán vẫn chạy trơn tru/);
  assert.match(page, /Không theo dõi nền/);
  assert.match(layout, /lang="vi"/);
  assert.match(mascot, /loopy-sticker/);
  assert.doesNotMatch(`${page}${layout}`, /Your site is taking shape|Building your site|vinext-starter/i);
});

test("keeps camera and geolocation collection explicit and fresh", async () => {
  const capture = await readFile(
    new URL("../components/attendance-capture.tsx", import.meta.url),
    "utf8",
  );
  const serverAction = await readFile(
    new URL("../app/api/attendance/actions/route.ts", import.meta.url),
    "utf8",
  );
  const headers = await readFile(
    new URL("../next.config.ts", import.meta.url),
    "utf8",
  );

  assert.match(capture, /getUserMedia/);
  assert.match(capture, /getCurrentPosition/);
  assert.match(capture, /enableHighAccuracy:\s*true/);
  assert.match(capture, /maximumAge:\s*0/);
  assert.match(capture, /timeout:\s*10000/);
  assert.match(capture, /"check_in"\s*\|\s*"check_out"/);
  assert.match(serverAction, /new Date\(\)\.toISOString\(\)/);
  assert.match(serverAction, /90 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(headers, /camera=\(self\), geolocation=\(self\)/);
});
