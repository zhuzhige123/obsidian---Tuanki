export const IR_CALENDAR_WEEKDAY_KEYS = [
  'weekdayMon',
  'weekdayTue',
  'weekdayWed',
  'weekdayThu',
  'weekdayFri',
  'weekdaySat',
  'weekdaySun'
] as const;

export type IRCalendarWeekdayKey = (typeof IR_CALENDAR_WEEKDAY_KEYS)[number];

export interface IRCalendarMonthDay {
  date: Date;
  otherMonth: boolean;
}

export function getMondayFirstWeekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

export function buildMonthCalendarDays(year: number, month: number): IRCalendarMonthDay[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days: IRCalendarMonthDay[] = [];

  const startDay = getMondayFirstWeekdayIndex(firstDay);
  for (let i = startDay - 1; i >= 0; i -= 1) {
    days.push({ date: new Date(year, month, -i), otherMonth: true });
  }

  for (let i = 1; i <= lastDay.getDate(); i += 1) {
    days.push({ date: new Date(year, month, i), otherMonth: false });
  }

  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i += 1) {
    days.push({ date: new Date(year, month + 1, i), otherMonth: true });
  }

  return days;
}
