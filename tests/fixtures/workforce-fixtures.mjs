import crypto from "node:crypto";
import {
  seedStore,
  seedAttendanceRules,
  seedEmployee,
  seedShift,
  seedAttendanceSession,
  seedAttendanceEvent,
  seedRequest,
  seedHandover,
} from "../helpers/database.mjs";

export const ROLES = Object.freeze({
  SYSTEM_ADMIN: "system_admin",
  OWNER: "owner",
  MANAGER: "manager",
  TEAM_LEAD: "team_lead",
  EMPLOYEE: "employee",
});

export const STATUSES = Object.freeze({
  ACTIVE: "active",
  SUSPENDED: "suspended",
  OFFBOARDED: "offboarded",
  INVITED: "invited",
  INACTIVE: "inactive",
});

/**
 * Creates a complete workforce fixture with multi-role actors
 * @param {object} db - Database instance from createDatabase()
 * @param {object} options
 * @param {string} [options.storeId='store-alpha'] - Store ID
 * @param {'sole_owner'|'multi_owner'|'all'} [options.mode='sole_owner'] - Owner topology
 * @param {boolean} [options.includeLifecycleActors=true] - Include suspended/offboarded/invited staff
 * @param {boolean} [options.includeRules=true] - Seed attendance rules
 * @returns {object} Workforce fixture
 */
export function createWorkforceFixture(db, {
  storeId = "store-alpha",
  mode = "sole_owner",
  includeLifecycleActors = true,
  includeRules = true,
} = {}) {
  seedStore(db, {
    id: storeId,
    name: `Store ${storeId}`,
    address: "LoopyCafe Nguyễn Trãi",
    latitude: 10.754128,
    longitude: 106.66754,
    timezone: "Asia/Ho_Chi_Minh",
    geofenceRadiusMeters: 100,
    attendanceEnabled: true,
  });

  if (includeRules) {
    seedAttendanceRules(db, storeId);
  }

  const actors = {};

  if (mode === "sole_owner") {
    actors.soleOwner = seedEmployee(db, {
      id: `owner-sole-${storeId}`,
      storeId,
      role: ROLES.OWNER,
      status: STATUSES.ACTIVE,
      displayName: "Chủ Quán Duy Nhất",
      hourlyRate: 0,
      compensationType: "none",
      participatesAttendance: 0,
      payrollEligible: 0,
    });
    actors.owner1 = actors.soleOwner;
    actors.owner2 = null;
  } else if (mode === "multi_owner") {
    actors.owner1 = seedEmployee(db, {
      id: `owner-1-${storeId}`,
      storeId,
      role: ROLES.OWNER,
      status: STATUSES.ACTIVE,
      displayName: "Chủ Quán 1",
      hourlyRate: 0,
      compensationType: "none",
      participatesAttendance: 0,
      payrollEligible: 0,
    });
    actors.owner2 = seedEmployee(db, {
      id: `owner-2-${storeId}`,
      storeId,
      role: ROLES.OWNER,
      status: STATUSES.ACTIVE,
      displayName: "Chủ Quán 2",
      hourlyRate: 0,
      compensationType: "none",
      participatesAttendance: 0,
      payrollEligible: 0,
    });
    actors.soleOwner = null;
  } else {
    // mode === "all"
    actors.soleOwner = seedEmployee(db, {
      id: `owner-sole-${storeId}`,
      storeId,
      role: ROLES.OWNER,
      status: STATUSES.ACTIVE,
      displayName: "Chủ Quán Duy Nhất",
      hourlyRate: 0,
      compensationType: "none",
      participatesAttendance: 0,
      payrollEligible: 0,
    });
    actors.owner1 = actors.soleOwner;
    actors.owner2 = seedEmployee(db, {
      id: `owner-2-${storeId}`,
      storeId,
      role: ROLES.OWNER,
      status: STATUSES.ACTIVE,
      displayName: "Chủ Quán 2",
      hourlyRate: 0,
      compensationType: "none",
      participatesAttendance: 0,
      payrollEligible: 0,
    });
  }

  actors.ownerA = actors.owner1;
  actors.ownerB = actors.owner2;

  actors.manager = seedEmployee(db, {
    id: `mgr-${storeId}`,
    storeId,
    role: ROLES.MANAGER,
    status: STATUSES.ACTIVE,
    displayName: "Quản Lý Cửa Hàng",
    hourlyRate: 35000,
    compensationType: "hourly",
  });

  actors.teamLead = seedEmployee(db, {
    id: `lead-${storeId}`,
    storeId,
    role: ROLES.TEAM_LEAD,
    status: STATUSES.ACTIVE,
    displayName: "Trưởng Ca Vận Hành",
    hourlyRate: 30000,
    compensationType: "hourly",
  });

  actors.employeeA = seedEmployee(db, {
    id: `emp-a-${storeId}`,
    storeId,
    role: ROLES.EMPLOYEE,
    status: STATUSES.ACTIVE,
    displayName: "Nhân Viên Pha Chế A",
    hourlyRate: 25000,
    compensationType: "hourly",
  });

  actors.employeeB = seedEmployee(db, {
    id: `emp-b-${storeId}`,
    storeId,
    role: ROLES.EMPLOYEE,
    status: STATUSES.ACTIVE,
    displayName: "Nhân Viên Thu Ngân B",
    hourlyRate: 28000,
    compensationType: "hourly",
  });

  actors.systemAdmin = seedEmployee(db, {
    id: `admin-sys-${storeId}`,
    storeId,
    role: ROLES.SYSTEM_ADMIN,
    status: STATUSES.ACTIVE,
    displayName: "Quản Trị Viên Kỹ Thuật",
    hourlyRate: 0,
    compensationType: "none",
    participatesAttendance: 0,
    payrollEligible: 0,
  });

  if (includeLifecycleActors) {
    actors.suspendedStaff = seedEmployee(db, {
      id: `emp-suspended-${storeId}`,
      storeId,
      role: ROLES.EMPLOYEE,
      status: STATUSES.SUSPENDED,
      displayName: "Nhân Viên Bị Đình Chỉ",
      hourlyRate: 25000,
      compensationType: "hourly",
    });

    actors.offboardedStaff = seedEmployee(db, {
      id: `emp-offboarded-${storeId}`,
      storeId,
      role: ROLES.EMPLOYEE,
      status: STATUSES.OFFBOARDED,
      displayName: "Nhân Viên Đã Thôi Việc",
      hourlyRate: 25000,
      compensationType: "hourly",
    });

    actors.invitedStaff = seedEmployee(db, {
      id: `emp-invited-${storeId}`,
      storeId,
      role: ROLES.EMPLOYEE,
      status: STATUSES.INVITED,
      displayName: "Nhân Viên Mới Được Mời",
      hourlyRate: 25000,
      compensationType: "hourly",
    });

    actors.inactiveStaff = seedEmployee(db, {
      id: `emp-inactive-${storeId}`,
      storeId,
      role: ROLES.EMPLOYEE,
      status: STATUSES.INACTIVE,
      displayName: "Nhân Viên Không Hoạt Động",
      hourlyRate: 25000,
      compensationType: "hourly",
    });
  }

  return {
    storeId,
    mode,
    actors,
    mockAuth: (actor) => ({
      requireApiUser: async (roles) => {
        if (!actor) return { response: Response.json({ error: "unauthorized" }, { status: 401 }) };
        if (actor.status !== "active") return { response: Response.json({ error: "account_not_active" }, { status: 403 }) };
        if (actor.role === "system_admin" && !roles?.includes("system_admin")) {
          return { response: Response.json({ error: "Tài khoản quản trị kỹ thuật không có quyền truy cập nghiệp vụ cửa hàng.", code: "system_admin_blocked" }, { status: 403 }) };
        }
        if (roles && !roles.includes(actor.role)) return { response: Response.json({ error: "forbidden" }, { status: 403 }) };
        return { actor };
      },
    }),
  };
}

/**
 * Creates two completely isolated stores for tenant boundary verification
 * @param {object} db - Database instance
 */
export function createMultiStoreFixture(db) {
  return {
    storeA: createWorkforceFixture(db, { storeId: "store-alpha", mode: "sole_owner" }),
    storeB: createWorkforceFixture(db, { storeId: "store-beta", mode: "multi_owner" }),
  };
}

/**
 * Scenario builder: Swap requests & approval matrix (for C01 & C06)
 */
export function buildSwapScenario(db, fixture) {
  const shiftA = seedShift(db, {
    id: `shift-swap-a-${crypto.randomUUID()}`,
    storeId: fixture.storeId,
    employeeEmail: fixture.actors.employeeA.email,
    startsAt: "2026-07-03T01:00:00.000Z",
    endsAt: "2026-07-03T05:00:00.000Z",
    status: "published",
  });

  const shiftB = seedShift(db, {
    id: `shift-swap-b-${crypto.randomUUID()}`,
    storeId: fixture.storeId,
    employeeEmail: fixture.actors.employeeB.email,
    startsAt: "2026-07-03T06:00:00.000Z",
    endsAt: "2026-07-03T10:00:00.000Z",
    status: "published",
  });

  const request = seedRequest(db, {
    id: `req-swap-${crypto.randomUUID()}`,
    storeId: fixture.storeId,
    employeeEmail: fixture.actors.employeeA.email,
    type: "swap",
    title: "Đổi ca với B",
    reason: "Bận việc cá nhân",
    status: "pending",
    shiftId: shiftA.id,
    startsAt: shiftA.startsAt,
    endsAt: shiftA.endsAt,
    clientRequestKey: `swap-key-${crypto.randomUUID()}`,
  });

  return {
    shiftA,
    shiftB,
    request,
    beneficiaries: [fixture.actors.employeeA, fixture.actors.employeeB],
    actorPerms: {
      employeeA: false,
      employeeB: false,
      teamLead: true,
      manager: true,
      soleOwner: Boolean(fixture.actors.soleOwner),
    },
  };
}

/**
 * Scenario builder: Draft holding slot in SQLite overlap trigger (for C02)
 */
export function buildDraftOverlapScenario(db, fixture) {
  const draftShift = seedShift(db, {
    id: `shift-draft-base-${crypto.randomUUID()}`,
    storeId: fixture.storeId,
    employeeEmail: fixture.actors.employeeA.email,
    startsAt: "2026-07-03T01:00:00.000Z",
    endsAt: "2026-07-03T05:00:00.000Z",
    status: "draft",
  });

  return {
    draftShift,
    overlappingDraft: {
      id: `shift-draft-over-${crypto.randomUUID()}`,
      storeId: fixture.storeId,
      employeeEmail: fixture.actors.employeeA.email,
      startsAt: "2026-07-03T03:00:00.000Z",
      endsAt: "2026-07-03T07:00:00.000Z",
      roleLabel: "Barista",
      status: "draft",
    },
    overlappingPublished: {
      id: `shift-pub-over-${crypto.randomUUID()}`,
      storeId: fixture.storeId,
      employeeEmail: fixture.actors.employeeA.email,
      startsAt: "2026-07-03T02:00:00.000Z",
      endsAt: "2026-07-03T04:00:00.000Z",
      roleLabel: "Barista",
      status: "published",
    },
    adjacentShift: {
      id: `shift-adjacent-${crypto.randomUUID()}`,
      storeId: fixture.storeId,
      employeeEmail: fixture.actors.employeeA.email,
      startsAt: "2026-07-03T05:00:00.000Z",
      endsAt: "2026-07-03T09:00:00.000Z",
      roleLabel: "Barista",
      status: "draft",
    },
  };
}

/**
 * Scenario builder: 15m clipping vs payable minutes & unscheduled sessions (for C03)
 */
export function buildAttendanceClippingScenario(db, fixture) {
  const shift = seedShift(db, {
    id: `shift-clip-${crypto.randomUUID()}`,
    storeId: fixture.storeId,
    employeeEmail: fixture.actors.employeeA.email,
    startsAt: "2026-07-03T01:00:00.000Z",
    endsAt: "2026-07-03T05:00:00.000Z",
    status: "published",
  });

  return {
    shift,
    caseA: {
      checkIn: "2026-07-03T00:50:00.000Z",
      checkOut: "2026-07-03T05:10:00.000Z",
      recordedMinutes: 260,
      expectedPayableMinutes: 240,
    },
    caseB: {
      checkIn: "2026-07-03T00:40:00.000Z",
      checkOut: "2026-07-03T05:20:00.000Z",
      recordedMinutes: 280,
      expectedPayableMinutes: 240,
    },
    caseC: {
      checkIn: "2026-07-03T00:50:00.000Z",
      checkOut: "2026-07-03T05:30:00.000Z",
      approvedOvertimeMinutes: 20,
      recordedMinutes: 280,
      expectedPayableMinutes: 260,
    },
    caseD: {
      isUnscheduled: true,
      checkIn: "2026-07-03T02:00:00.000Z",
      checkOut: "2026-07-03T06:00:00.000Z",
      recordedMinutes: 240,
      expectedPayableMinutes: 0,
    },
    caseE: {
      isForgottenCheckout: true,
      checkIn: "2026-07-03T01:00:00.000Z",
      checkOut: null,
      autoClosedAt: "2026-07-03T09:00:00.000Z",
      expectedPayableMinutes: 0,
    },
    calculatePayableMinutes: ({
      plannedMinutes = 240,
      approvedOvertimeMinutes = 0,
      isUnscheduled = false,
      isForgottenCheckout = false,
    } = {}) => {
      if (isUnscheduled || isForgottenCheckout) return 0;
      return plannedMinutes + approvedOvertimeMinutes;
    },
  };
}

/**
 * Scenario builder: Rate history splitting & rounding steps (for C04)
 */
export function buildRateHistoryScenario() {
  return {
    floor15: (minutes) => Math.floor(minutes / 15) * 15,
    round1000: (amount) => Math.round(amount / 1000) * 1000,
    floorVectors: [
      { in: 14, out: 0 },
      { in: 15, out: 15 },
      { in: 29, out: 15 },
      { in: 30, out: 30 },
      { in: 58, out: 45 },
    ],
    roundVectors: [
      { in: 1450499, out: 1450000 },
      { in: 1450500, out: 1451000 },
      { in: 1450501, out: 1451000 },
    ],
    splitRateScenario: {
      ratePeriod1: { rate: 20000, hours: 10, amount: 200000 },
      ratePeriod2: { rate: 25000, hours: 10, amount: 250000 },
      expectedTotal: 450000,
    },
    crossMonthScenario: {
      openedAt: "2026-07-31T16:00:00.000Z", // 23:00 VN
      closedAt: "2026-07-31T18:00:00.000Z", // 01:00 VN
      totalMinutes: 120,
      julyMinutes: 60,
      augustMinutes: 60,
    },
  };
}

/**
 * Scenario builder: Handover acknowledgment gate & first-shift bypass (for C05)
 */
export function buildHandoverScenario(db, fixture) {
  const morningShift = seedShift(db, {
    id: `shift-ho-morning-${crypto.randomUUID()}`,
    storeId: fixture.storeId,
    employeeEmail: fixture.actors.employeeA.email,
    startsAt: "2026-07-03T00:00:00.000Z",
    endsAt: "2026-07-03T05:00:00.000Z",
    status: "published",
  });

  const afternoonShift = seedShift(db, {
    id: `shift-ho-afternoon-${crypto.randomUUID()}`,
    storeId: fixture.storeId,
    employeeEmail: fixture.actors.employeeB.email,
    startsAt: "2026-07-03T05:00:00.000Z",
    endsAt: "2026-07-03T10:00:00.000Z",
    status: "published",
  });

  const handover = seedHandover(db, {
    id: `ho-test-${crypto.randomUUID()}`,
    storeId: fixture.storeId,
    authorEmail: fixture.actors.employeeA.email,
    summary: "Bàn giao ca sáng kiểm thử",
    shiftId: morningShift.id,
    receiverEmployeeId: fixture.actors.employeeB.id,
    nextShiftId: afternoonShift.id,
    acknowledgedAt: null,
  });

  return {
    morningShift,
    afternoonShift,
    handover,
    unacknowledged: true,
    acknowledge: (handoverId, acknowledgedAt = new Date().toISOString()) => {
      db.sqlite.prepare("UPDATE handovers SET acknowledged_at = ? WHERE id = ?").run(acknowledgedAt, handoverId);
      return { handoverId, acknowledgedAt };
    },
  };
}

/**
 * Scenario builder: Retention lifecycles (90d evidence vs 180d PII vs 3y operational) (for C07)
 */
export function buildRetentionScenario(db, fixture) {
  const expiredSession = seedAttendanceSession(db, {
    id: `sess-exp-${crypto.randomUUID()}`,
    storeId: fixture.storeId,
    employeeEmail: fixture.actors.employeeA.email,
    openedAt: "2026-04-01T01:00:00.000Z",
    closedAt: "2026-04-01T09:00:00.000Z",
  });

  const expiredEvent = seedAttendanceEvent(db, {
    id: `ev-exp-${crypto.randomUUID()}`,
    sessionId: expiredSession.id,
    employeeEmail: fixture.actors.employeeA.email,
    recordedAt: "2026-04-01T01:00:00.000Z",
  });

  db.sqlite.prepare(`
    INSERT INTO attendance_photos (event_id, object_key, mime_type, size_bytes, sha256, overlay_version, expires_at)
    VALUES (?, 'evidence/expired-photo.jpg', 'image/jpeg', 1024, 'abc', 'v1', '2026-07-01T00:00:00.000Z')
  `).run(expiredEvent.id);

  db.sqlite.prepare(`
    INSERT INTO attendance_locations (event_id, latitude, longitude, accuracy_meters, server_received_at, distance_from_store_meters, expires_at)
    VALUES (?, 10.754128, 106.66754, 5.0, '2026-04-01T01:00:00.000Z', 10.0, '2026-07-01T00:00:00.000Z')
  `).run(expiredEvent.id);

  const activeSession = seedAttendanceSession(db, {
    id: `sess-act-${crypto.randomUUID()}`,
    storeId: fixture.storeId,
    employeeEmail: fixture.actors.employeeA.email,
    openedAt: "2026-07-01T01:00:00.000Z",
    closedAt: "2026-07-01T09:00:00.000Z",
  });

  const activeEvent = seedAttendanceEvent(db, {
    id: `ev-act-${crypto.randomUUID()}`,
    sessionId: activeSession.id,
    employeeEmail: fixture.actors.employeeA.email,
    recordedAt: "2026-07-01T01:00:00.000Z",
  });

  db.sqlite.prepare(`
    INSERT INTO attendance_photos (event_id, object_key, mime_type, size_bytes, sha256, overlay_version, expires_at)
    VALUES (?, 'evidence/active-photo.jpg', 'image/jpeg', 1024, 'def', 'v1', '2026-10-01T00:00:00.000Z')
  `).run(activeEvent.id);

  db.sqlite.prepare(`
    INSERT INTO attendance_locations (event_id, latitude, longitude, accuracy_meters, server_received_at, distance_from_store_meters, expires_at)
    VALUES (?, 10.754128, 106.66754, 5.0, '2026-07-01T01:00:00.000Z', 10.0, '2026-10-01T00:00:00.000Z')
  `).run(activeEvent.id);

  const oldOrderId = `order-old-${crypto.randomUUID()}`;
  const oldOrderCode = `ORD-OLD-${fixture.storeId}-${crypto.randomUUID().slice(0, 8)}`;
  db.sqlite.prepare(`
    INSERT INTO customer_orders (id, order_code, store_id, customer_name, customer_phone, customer_note, total_amount, item_count, status, created_at, updated_at)
    VALUES (?, ?, ?, 'Nguyễn Văn A', '0901234567', 'Giao gấp', 150000, 2, 'completed', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
  `).run(oldOrderId, oldOrderCode, fixture.storeId);

  const freshOrderId = `order-fresh-${crypto.randomUUID()}`;
  const freshOrderCode = `ORD-FRESH-${fixture.storeId}-${crypto.randomUUID().slice(0, 8)}`;
  db.sqlite.prepare(`
    INSERT INTO customer_orders (id, order_code, store_id, customer_name, customer_phone, customer_note, total_amount, item_count, status, created_at, updated_at)
    VALUES (?, ?, ?, 'Trần Thị B', '0912345678', 'Ít đá', 65000, 1, 'completed', '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z')
  `).run(freshOrderId, freshOrderCode, fixture.storeId);

  const historicSession = seedAttendanceSession(db, {
    id: `sess-hist-${crypto.randomUUID()}`,
    storeId: fixture.storeId,
    employeeEmail: fixture.actors.employeeA.email,
    openedAt: "2024-07-01T01:00:00.000Z",
    closedAt: "2024-07-01T09:00:00.000Z",
  });

  const historicEvent = seedAttendanceEvent(db, {
    id: `ev-hist-${crypto.randomUUID()}`,
    sessionId: historicSession.id,
    employeeEmail: fixture.actors.employeeA.email,
    recordedAt: "2024-07-01T01:00:00.000Z",
  });

  return {
    expiredEventId: expiredEvent.id,
    activeEventId: activeEvent.id,
    oldOrderId,
    oldOrderCode,
    freshOrderId,
    freshOrderCode,
    historicEventId: historicEvent.id,
    historicSessionId: historicSession.id,
  };
}
