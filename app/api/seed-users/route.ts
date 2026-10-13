import { createAdmin } from '@/lib/supabase/server';
import { STORE_ID } from '@/db/runtime';
import { seedDemoDatabase } from '@/db/seed';
import { NextResponse } from 'next/server';

const TEST_ACCOUNTS = [
  {
    email: 'owner@loopicafe.com',
    displayName: 'Nguyễn Minh Linh (Owner)',
    role: 'owner',
  },
  {
    email: 'manager@loopicafe.com',
    displayName: 'Trần Văn Minh (Manager)',
    role: 'manager',
  },
  {
    email: 'barista@loopicafe.com',
    displayName: 'Lê Phước An (Barista)',
    role: 'employee',
  },
];

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export async function POST(request: Request) {
  // 1. Strict environment check: Never execute in production mode, require local runtime profile, and require ENABLE_DEMO_SEED === "true"
  const isProduction = process.env.NODE_ENV === "production";
  const isLocalProfile = process.env.LOOPI_RUNTIME_PROFILE === "local" || process.env.LOOPI_LOCAL_ONLY === "true";
  const isDemoSeedEnabled = process.env.ENABLE_DEMO_SEED === "true";

  if (isProduction || !isLocalProfile || !isDemoSeedEnabled) {
    return NextResponse.json(
      { error: "Endpoint không tồn tại hoặc đã bị vô hiệu hóa trên môi trường này.", code: "not_found" },
      { status: 404 }
    );
  }

  // 2. Strict loopback check: Reject remote host and proxy headers
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return NextResponse.json(
      { error: "URL yêu cầu không hợp lệ.", code: "bad_request" },
      { status: 400 }
    );
  }

  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    return NextResponse.json(
      { error: "Thao tác chỉ được phép thực hiện từ giao diện mạng loopback cục bộ.", code: "forbidden" },
      { status: 403 }
    );
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost) {
    const hostPart = forwardedHost.split(":")[0].toLowerCase();
    if (!LOOPBACK_HOSTS.has(hostPart)) {
      return NextResponse.json(
        { error: "Thao tác chỉ được phép thực hiện từ giao diện mạng loopback cục bộ.", code: "forbidden" },
        { status: 403 }
      );
    }
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const clientIp = forwardedFor.split(",")[0].trim().toLowerCase();
    if (!LOOPBACK_HOSTS.has(clientIp)) {
      return NextResponse.json(
        { error: "Thao tác chỉ được phép thực hiện từ giao diện mạng loopback cục bộ.", code: "forbidden" },
        { status: 403 }
      );
    }
  }

  const seedSecret = process.env.SEED_SECRET;
  const accountPassword = process.env.TEST_ACCOUNT_PASSWORD;
  const authorization = request.headers.get("authorization");

  if (!seedSecret || authorization !== `Bearer ${seedSecret}`) {
    return NextResponse.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });
  }
  if (!accountPassword) {
    return NextResponse.json(
      { error: "Dịch vụ chưa được cấu hình hoàn chỉnh để khởi tạo.", code: "service_unavailable" },
      { status: 503 },
    );
  }

  const admin = createAdmin();
  const db = await seedDemoDatabase();
  const results = [];
  const now = new Date().toISOString();
  const { data: existingUsers, error: listError } =
    await admin.auth.admin.listUsers({ page: 1, perPage: 100 });

  if (listError) {
    return NextResponse.json(
      { error: "Không thể truy vấn dịch vụ xác thực cục bộ.", code: "auth_service_error" },
      { status: 502 }
    );
  }

  // Ensure Store exists
  await db.prepare(
    `INSERT OR IGNORE INTO stores (id, name, address, timezone, latitude, longitude, attendance_enabled, created_at, updated_at)
     VALUES (?, 'LoopiCafe - Main Store', '123 Le Loi Street, District 1, Ho Chi Minh City', 'Asia/Ho_Chi_Minh', 10.776889, 106.700806, 1, ?, ?)`
  ).bind(STORE_ID, now, now).run();

  for (const acc of TEST_ACCOUNTS) {
    try {
      const existingUser = existingUsers?.users?.find(
        (u) => u.email?.toLowerCase() === acc.email.toLowerCase()
      );

      let userId = existingUser?.id;

      if (!existingUser) {
        const { data: newUser, error: createErr } =
          await admin.auth.admin.createUser({
            email: acc.email,
            password: accountPassword,
            email_confirm: true,
            user_metadata: { full_name: acc.displayName },
          });

        if (createErr) {
          results.push({ email: acc.email, status: 'error' });
          continue;
        }
        userId = newUser.user.id;
      } else {
        await admin.auth.admin.updateUserById(existingUser.id, {
          password: accountPassword,
          email_confirm: true,
        });
      }

      // Link to D1/SQLite employees table
      const existingEmp = await db.prepare(
        "SELECT id FROM employees WHERE lower(email) = lower(?)"
      ).bind(acc.email).first();

      if (!existingEmp) {
        await db.prepare(
          `INSERT INTO employees (id, store_id, email, display_name, role, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`
        ).bind(userId || crypto.randomUUID(), STORE_ID, acc.email, acc.displayName, acc.role, now, now).run();
      } else {
        await db.prepare(
          `UPDATE employees SET role = ?, status = 'active', display_name = ?, updated_at = ? WHERE lower(email) = lower(?)`
        ).bind(acc.role, acc.displayName, now, acc.email).run();
      }

      results.push({
        email: acc.email,
        role: acc.role,
        status: 'ready',
      });
    } catch {
      results.push({ email: acc.email, status: 'failed' });
    }
  }

  return NextResponse.json({
    message: 'Test accounts created and linked successfully!',
    accounts: results,
  });
}
