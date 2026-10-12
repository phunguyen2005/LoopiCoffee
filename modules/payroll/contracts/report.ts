export type PayrollPeriod = {
  key: string;
  startIso: string;
  endExclusiveIso: string;
  startDate: string;
  endDate: string;
  label: string;
};

export type PayrollException = {
  id: string;
  employeeEmail: string;
  occurredAt: string;
  kind: "attendance" | "duration" | "missing_checkout" | "absence";
  title: string;
  status: "pending" | "approved" | "rejected" | "informational";
  reviewerEmail: string | null;
  reviewerNote: string | null;
  employeeReason: string | null;
  canReview: boolean;
  sessionId?: string;
  revision?: number;
  correctionAction?: "check_in" | "check_out";
};

export type PayrollReportRow = {
  displayName: string;
  email: string;
  role: string;
  jobTitle: string;
  compensationType: "hourly" | "monthly" | "shift" | "none";
  includeInPayroll: boolean;
  hasPayrollData: boolean;
  hourlyRate: number;
  monthlySalary: number;
  scheduledMinutes: number;
  recordedMinutes: number;
  approvedMinutes: number;
  overtimeMinutes: number;
  shiftCount: number;
  lateCount: number;
  earlyLeaveCount: number;
  exceptionCount: number;
  pendingExceptionCount: number;
  allowanceAmount: number;
  bonusAmount: number;
  deductionAmount: number;
  baseSalary: number;
  overtimePay: number;
  totalSalary: number;
  status: "unchecked" | "exception" | "attendance_approved" | "payroll_finalized" | "paid";
  exceptions: PayrollException[];
  snapshotComplete?: boolean;
  adjustments?: Array<{ id: string; amount: number; reason: string; actorEmail: string; createdAt: string }>;
};
