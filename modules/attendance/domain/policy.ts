export type AttendanceRule = {
  id: string;
  early_checkin_minutes: number;
  late_minutes: number;
  early_departure_minutes: number;
  absence_minutes: number;
  missing_checkout_minutes: number;
  evidence_retention_days: number;
};

export type AssignedShift = { id: string; starts_at: string; ends_at: string };

export function evaluateShiftWindow(action: "check_in" | "check_out", shift: AssignedShift | null, rule: AttendanceRule, recordedAt: string): string[] {
  if (!shift) return ["no_assigned_shift"];
  const now = Date.parse(recordedAt);
  const startsAt = Date.parse(shift.starts_at);
  const endsAt = Date.parse(shift.ends_at);
  if (action === "check_in") {
    if (now < startsAt - rule.early_checkin_minutes * 60_000 || now > startsAt + rule.absence_minutes * 60_000) return ["outside_shift_window"];
    if (now > startsAt + rule.late_minutes * 60_000) return ["late"];
  } else {
    if (now < startsAt - rule.early_checkin_minutes * 60_000 || now > endsAt + rule.missing_checkout_minutes * 60_000) return ["outside_shift_window"];
    if (now < endsAt - rule.early_departure_minutes * 60_000) return ["early_departure"];
  }
  return [];
}
