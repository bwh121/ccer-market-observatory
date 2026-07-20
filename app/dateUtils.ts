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
