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

export async function POST(request: Request) {
  if (process.env.ENABLE_DEMO_SEED !== "true") {
    return NextResponse.json({ error: "Demo seeding is disabled" }, { status: 403 });
  }
  const seedSecret = process.env.SEED_SECRET;
  const accountPassword = process.env.TEST_ACCOUNT_PASSWORD;
  const authorization = request.headers.get("authorization");

  if (!seedSecret || authorization !== `Bearer ${seedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!accountPassword) {
    return NextResponse.json(
      { error: "TEST_ACCOUNT_PASSWORD is not configured" },
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
    return NextResponse.json({ error: listError.message }, { status: 502 });
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
          results.push({ email: acc.email, status: 'error', error: createErr.message });
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
        userId,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ email: acc.email, status: 'failed', error: msg });
    }
  }

  return NextResponse.json({
    message: 'Test accounts created and linked successfully!',
    accounts: results,
  });
}
