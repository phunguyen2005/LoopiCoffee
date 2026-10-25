export type ApprovedWorkInterval = {
  sessionId: string;
  startAt: string;
  endAt: string;
};

export type HourlyRateInterval = {
  id?: string;
  hourlyRate: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
};

export type PayRateSegment = {
  sessionId: string;
  startAt: string;
  endAt: string;
  minutes: number;
  hourlyRate: number | null;
  amount: number;
};

export function calculateHourlyPay(
  workIntervals: readonly ApprovedWorkInterval[],
  rateIntervals: readonly HourlyRateInterval[],
) {
  const rates = [...rateIntervals]
    .filter((rate) => Number.isFinite(rate.hourlyRate) && Number(rate.hourlyRate) > 0)
    .sort((a, b) => Date.parse(a.effectiveFrom) - Date.parse(b.effectiveFrom));
  const segments: PayRateSegment[] = [];
  let payableMinutes = 0;
  let missingRateMinutes = 0;
  let amountInMinuteVnd = 0;

  for (const work of workIntervals) {
    const startMs = Date.parse(work.startAt);
    const endMs = Date.parse(work.endAt);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue;

    const approvedMinutes = Math.floor((endMs - startMs) / 60_000 + 1e-7);
    const sessionPayableMinutes = Math.floor(approvedMinutes / 15) * 15;
    payableMinutes += sessionPayableMinutes;
    let cursorMs = startMs;
    let remainingMinutes = sessionPayableMinutes;

    while (remainingMinutes > 0) {
      const rate = rates.find((candidate) => {
        const fromMs = Date.parse(candidate.effectiveFrom);
        const toMs = candidate.effectiveTo ? Date.parse(candidate.effectiveTo) : Number.POSITIVE_INFINITY;
        return fromMs <= cursorMs && cursorMs < toMs;
      });
      const nextBoundaryMs = rate?.effectiveTo
        ? Date.parse(rate.effectiveTo)
        : rates.map((candidate) => Date.parse(candidate.effectiveFrom)).find((fromMs) => fromMs > cursorMs) ?? Number.POSITIVE_INFINITY;
      const maximumEndMs = Math.min(endMs, cursorMs + remainingMinutes * 60_000, nextBoundaryMs);
      let segmentMinutes = Math.floor((maximumEndMs - cursorMs) / 60_000 + 1e-7);

      if (segmentMinutes <= 0) {
        // A sub-minute rate boundary cannot consume a payable minute. Advance to it
        // so malformed legacy data cannot trap payroll calculation in an infinite loop.
        if (Number.isFinite(nextBoundaryMs) && nextBoundaryMs > cursorMs) {
          cursorMs = nextBoundaryMs;
          continue;
        }
        segmentMinutes = remainingMinutes;
      }

      const hourlyRate = rate?.hourlyRate ?? null;
      const amount = hourlyRate === null ? 0 : (segmentMinutes * hourlyRate) / 60;
      segments.push({
        sessionId: work.sessionId,
        startAt: new Date(cursorMs).toISOString(),
        endAt: new Date(cursorMs + segmentMinutes * 60_000).toISOString(),
        minutes: segmentMinutes,
        hourlyRate,
        amount,
      });
      if (hourlyRate === null) missingRateMinutes += segmentMinutes;
      else amountInMinuteVnd += segmentMinutes * hourlyRate;
      cursorMs += segmentMinutes * 60_000;
      remainingMinutes -= segmentMinutes;
    }
  }

  return {
    payableMinutes,
    missingRateMinutes,
    baseSalaryExact: amountInMinuteVnd / 60,
    segments,
  };
}
