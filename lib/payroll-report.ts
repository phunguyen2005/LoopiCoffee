// Compatibility exports; payroll contracts and behavior belong to their module.
export type { PayrollPeriod, PayrollException, PayrollReportRow } from "../modules/payroll/contracts/report";
export { resolvePayrollPeriod } from "../modules/payroll/domain/period";
export { loadPayrollReport } from "../modules/payroll/application/load-report";
