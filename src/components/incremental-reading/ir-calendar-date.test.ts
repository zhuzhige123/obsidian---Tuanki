
import {
  buildMonthCalendarDays,
  getMondayFirstWeekdayIndex,
  IR_CALENDAR_WEEKDAY_KEYS
} from './ir-calendar-date';

describe('ir-calendar-date', () => {
  it('uses Monday as the first weekday column', () => {
    expect(IR_CALENDAR_WEEKDAY_KEYS).toEqual([
      'weekdayMon',
      'weekdayTue',
      'weekdayWed',
      'weekdayThu',
      'weekdayFri',
      'weekdaySat',
      'weekdaySun'
    ]);
    expect(getMondayFirstWeekdayIndex(new Date(2026, 3, 1))).toBe(2);
    expect(getMondayFirstWeekdayIndex(new Date(2026, 5, 28))).toBe(6);
  });

  it('builds April 2026 month grid aligned to Monday-first headers', () => {
    const days = buildMonthCalendarDays(2026, 3);

    expect(days).toHaveLength(42);
    expect(days[0].date.getFullYear()).toBe(2026);
    expect(days[0].date.getMonth()).toBe(2);
    expect(days[0].date.getDate()).toBe(30);

    expect(days[2].date.getFullYear()).toBe(2026);
    expect(days[2].date.getMonth()).toBe(3);
    expect(days[2].date.getDate()).toBe(1);
    expect(days[2].otherMonth).toBe(false);

    const june28 = days.findIndex((entry) => entry.date.getFullYear() === 2026 && entry.date.getMonth() === 5 && entry.date.getDate() === 28);
    expect(june28).toBe(-1);
  });

  it('places 2026-06-28 on the Sunday column in a Monday-first grid', () => {
    const days = buildMonthCalendarDays(2026, 5);
    const june28Index = days.findIndex(
      (entry) => entry.date.getFullYear() === 2026 && entry.date.getMonth() === 5 && entry.date.getDate() === 28 && !entry.otherMonth
    );

    expect(june28Index).toBeGreaterThanOrEqual(0);
    expect(june28Index % 7).toBe(6);
  });
});
