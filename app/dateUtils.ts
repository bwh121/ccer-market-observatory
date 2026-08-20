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
  const previousDay = shiftDate(snapshotDate, -1);
  if (period === "yesterday") return { start: previousDay, end: previousDay, empty: false };
  const value = new Date(`${snapshotDate}T00:00:00Z`);
  const weekday = value.getUTCDay() || 7;
  const start = shiftDate(snapshotDate, -(weekday - 1));
  return { start, end: previousDay, empty: previousDay < start };
};

export const bulletinPeriodLabel = (snapshotDate: string, period: BulletinPeriod) => {
  const range = bulletinPeriodRange(snapshotDate, period);
  if (range.empty) return period === "week" ? "本周数据暂未更新" : "本月数据暂未更新";
  if (period === "yesterday") return `统计区间：${range.end}日`;
  return `统计区间：${range.start}日至${range.end}日`;
};
