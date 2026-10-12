"use client";

import dynamic from "next/dynamic";

export { AdminAccountsView } from "./admin-accounts-view";

export const OperationsDashboardView = dynamic(
  () => import("./operational/dashboard-view").then((m) => m.OperationsDashboardView)
);

export const EmployeeTodayView = dynamic(
  () => import("./operational/today-view").then((m) => m.EmployeeTodayView)
);

export const PersistentChecklistsView = dynamic(
  () => import("./operational/checklists-view").then((m) => m.PersistentChecklistsView)
);

export const PersistentIssuesView = dynamic(
  () => import("./operational/issues-view").then((m) => m.PersistentIssuesView)
);

export const PersistentHandoversView = dynamic(
  () => import("./operational/handovers-view").then((m) => m.PersistentHandoversView)
);

export const PersistentRequestsView = dynamic(
  () => import("./operational/requests-view").then((m) => m.PersistentRequestsView)
);

export const PersistentTeamView = dynamic(
  () => import("./operational/team-view").then((m) => m.PersistentTeamView)
);

export const PersistentStoreSettingsView = dynamic(
  () => import("./operational/settings-view").then((m) => m.PersistentStoreSettingsView)
);

export const ScheduleManagerView = dynamic(
  () => import("./operational/schedule-view").then((m) => m.ScheduleManagerView)
);

export const AttendanceReviewView = dynamic(
  () => import("./operational/attendance-view").then((m) => m.AttendanceReviewView)
);

export const PersistedReportsView = dynamic(
  () => import("./operational/reports-view").then((m) => m.PersistedReportsView)
);

export const PersistedProfileView = dynamic(
  () => import("./operational/profile-view").then((m) => m.PersistedProfileView)
);

export const OwnerOrdersView = dynamic(
  () => import("./operational/owner-orders-view").then((m) => m.OwnerOrdersView)
);

