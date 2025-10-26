// Time utilities for analytics
// 🔄 重构：集成统一日期时间处理系统
import {
  startOfDay as unifiedStartOfDay,
  fmtISODate as unifiedFmtISODate,
  bucketDate as unifiedBucketDate
} from './unified-date-time';

export type TimeBucket = "day" | "week" | "month";

export function startOfDay(d: Date): Date {
  return unifiedStartOfDay(d);
}

export function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const day = x.getDay(); // 0-6, Sunday=0
  const diff = (day + 6) % 7; // Monday as start
  x.setDate(x.getDate() - diff); return x;
}

export function startOfMonth(d: Date): Date {
  const x = startOfDay(d); x.setDate(1); return x;
}

export function bucketDate(d: Date, bucket: TimeBucket): string {
  const x = new Date(d);
  if (bucket === "day") {
    const y = startOfDay(x);
    return fmtISODate(y);
  }
  if (bucket === "week") {
    const y = startOfWeek(x);
    return `W${y.getFullYear()}-${pad2(weekNumber(y))}`;
  }
  const y = startOfMonth(x);
  return `${y.getFullYear()}-${pad2(y.getMonth()+1)}`;
}

export function fmtISODate(d: Date): string {
  return unifiedFmtISODate(d);
}

export function pad2(n: number): string { return n < 10 ? `0${n}` : String(n); }

export function weekNumber(d: Date): number {
  // ISO week number
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
  const weekNo = Math.ceil((((date.getTime()-yearStart.getTime())/86400000)+1)/7);
  return weekNo;
}

export function rangeDays(end: Date, days: number): string[] {
  const res: string[] = [];
  const cur = startOfDay(end);
  for (let i=0;i<days;i++) {
    const d = new Date(cur); d.setDate(cur.getDate()-i);
    res.push(fmtISODate(d));
  }
  return res.reverse();
}

export function hoursMatrixInit(): number[][] {
  return Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
}

export function dayOfWeek(d: Date): number { return d.getDay(); } // 0..6
export function hourOfDay(d: Date): number { return d.getHours(); } // 0..23
