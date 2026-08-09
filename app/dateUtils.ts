export const shiftDate = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

export const previousCalendarWeek = (date: string) => {
  const value = new Date(`${date}T00:00:00Z`);
  const weekday = value.getUTCDay() || 7;
  const end = shiftDate(date, -weekday);
  return { start: shiftDate(end, -6), end };
};

export type BulletinPeriod = "yesterday" | "week" | "month";

export const bulletinPeriodRange = (snapshotDate: string, period: BulletinPeriod) => {
  const end = shiftDate(snapshotDate, -1);
  if (period === "yesterday") return { start: end, end, empty: false };
  if (period === "month") {
    const start = `${snapshotDate.slice(0, 7)}-01`;
    return { start, end, empty: start > end };
  }
  const value = new Date(`${snapshotDate}T00:00:00Z`);
  const weekday = value.getUTCDay() || 7;
  const start = shiftDate(snapshotDate, -(weekday - 1));
  return { start, end, empty: start > end };
};
