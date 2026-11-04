import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DigestRow, DigestStatus, ReadNight } from './types.js';

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}

type Instant = { seconds: number; fraction: string };

function parseInstant(value: string): Instant | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:?\d{2})$/.exec(value);
  if (!match || !isCalendarDate(match[1])) return null;
  const [, date, hour, minute, second = '00', fraction = '', zone] = match;
  if (Number(minute) > 59 || Number(second) > 59 || Number(hour) > 24) return null;
  if (Number(hour) === 24 && (Number(minute) !== 0 || Number(second) !== 0 || /[1-9]/.test(fraction))) return null;
  const offset = zone.replace(':', '');
  if (zone !== 'Z' && (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(3)) > 59)) return null;
  const seconds = Date.parse(`${date}T${hour}:${minute}:${second}${offset}`) / 1000;
  return Number.isFinite(seconds) ? { seconds, fraction: fraction.replace(/0+$/, '') } : null;
}

type LogRecord = {
  at: string;
  instant: Instant;
  job: string;
  status: DigestStatus;
  owner: string | null;
  error: string | null;
};

function parseRecord(line: string): LogRecord | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.job !== 'string' || record.job.length === 0 ||
      typeof record.at !== 'string' ||
      (record.status !== 'ok' && record.status !== 'retry' && record.status !== 'fail') ||
      (record.owner !== null && typeof record.owner !== 'string') ||
      ('error' in record && typeof record.error !== 'string')) return null;
  const instant = parseInstant(record.at);
  if (!instant) return null;
  return {
    at: record.at, instant, job: record.job, status: record.status,
    owner: record.owner, error: typeof record.error === 'string' ? record.error : null,
  };
}

function compareInstants(a: Instant, b: Instant): number {
  if (a.seconds !== b.seconds) return a.seconds - b.seconds;
  // Compare all fractional digits, not just Date's millisecond precision.
  const length = Math.max(a.fraction.length, b.fraction.length);
  const left = a.fraction.padEnd(length, '0');
  const right = b.fraction.padEnd(length, '0');
  return left < right ? -1 : left > right ? 1 : 0;
}

export const readNight: ReadNight = async (runsDir, night) => {
  if (!isCalendarDate(night)) throw new RangeError('night must be a real YYYY-MM-DD date');
  const counts = { ok: 0, retry: 0, fail: 0 };
  let text: string;
  try {
    text = await readFile(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return { found: false, rows: [], badLines: 0, counts };
    }
    throw error;
  }
  const records: LogRecord[] = [];
  let badLines = 0;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const record = parseRecord(line);
    if (!record) { badLines++; continue; }
    records.push(record);
    counts[record.status]++;
  }
  // Array.sort is stable: equal instants retain their original file order.
  records.sort((a, b) => compareInstants(a.instant, b.instant));
  const jobs = new Map<string, DigestRow>();
  for (const record of records) {
    const row = jobs.get(record.job) ?? {
      job: record.job, owner: null, runs: 0, retries: 0, failures: 0,
      lastStatus: record.status, lastError: null, firstAt: record.at, lastAt: record.at,
    };
    row.runs++;
    if (record.status === 'retry') row.retries++;
    if (record.status === 'fail') row.failures++;
    row.owner = record.owner;
    row.lastStatus = record.status;
    row.lastError = record.error;
    row.lastAt = record.at;
    jobs.set(record.job, row);
  }
  const rows = [...jobs.values()].sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0);
  return { found: true, rows, badLines, counts };
};
