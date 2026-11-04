import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

const night = '2026-10-28';
const base = { at: '2026-10-28T23:00:00+01:00', job: 'job', status: 'ok', owner: 'rook' };
const empty = { rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } };
let dir: string;

beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'rig-reader-')); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

async function writeRecords(records: unknown[]) {
  await writeFile(join(dir, `${night}.jsonl`), records.map(record => JSON.stringify(record)).join('\n') + '\n');
}

describe('readNight', () => {
  it('reads the real fixture without changing runs: five sorted jobs and one bad line', async () => {
    const digest = await readNight(new URL('../runs/', import.meta.url).pathname, night);
    expect(digest.found).toBe(true);
    expect(digest.badLines).toBe(1);
    expect(digest.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
    expect(digest.rows).toEqual([
      { job: 'digest/render', owner: null, runs: 1, retries: 0, failures: 0, lastStatus: 'ok', lastError: null, firstAt: '2026-10-29T05:41:09+01:00', lastAt: '2026-10-29T05:41:09+01:00' },
      { job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3, failures: 0, lastStatus: 'ok', lastError: null, firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00' },
      { job: 'lane/sync', owner: 'rook', runs: 8, retries: 1, failures: 0, lastStatus: 'ok', lastError: null, firstAt: '2026-10-28T23:00:06+01:00', lastAt: '2026-10-29T05:00:04+01:00' },
      { job: 'notes/backup', owner: 'lane-07', runs: 1, retries: 0, failures: 1, lastStatus: 'fail', lastError: 'quota exceeded', firstAt: '2026-10-29T04:00:01+01:00', lastAt: '2026-10-29T04:00:01+01:00' },
      { job: 'rig/rotate-logs', owner: 'lane-07', runs: 1, retries: 0, failures: 0, lastStatus: 'ok', lastError: null, firstAt: '2026-10-28T23:00:02+01:00', lastAt: '2026-10-28T23:00:02+01:00' },
    ]);
  });

  it.each(['', '../2026-10-28', '2026-10-28/../x', '2026-10-28\0', '2026-1-01', '2026-10-28\n', '2026-00-10', '2026-13-01', '2026-01-00', '2026-01-32', '2026-04-31', '2026-02-29', '1900-02-29', '2026-10-28.jsonl'])('rejects invalid night %j before filesystem access', async invalid => {
    // A non-directory path would throw ENOTDIR if the filesystem were reached first.
    const file = join(dir, 'not-a-directory');
    await writeFile(file, '');
    await expect(readNight(file, invalid)).rejects.toBeInstanceOf(RangeError);
  });

  it.each(['2024-02-29', '2000-02-29', '0000-02-29', '0099-01-01', '2026-04-30'])('accepts real calendar night %s', async valid => {
    await expect(readNight(dir, valid)).resolves.toEqual({ found: false, ...empty });
  });

  it('distinguishes missing, empty, blank-only, and all-invalid files', async () => {
    await expect(readNight(dir, night)).resolves.toEqual({ found: false, ...empty });
    for (const contents of ['', ' \n\t\r\n']) {
      await writeFile(join(dir, `${night}.jsonl`), contents);
      await expect(readNight(dir, night)).resolves.toEqual({ found: true, ...empty });
    }
    await writeFile(join(dir, `${night}.jsonl`), '{broken\nnull\n\n');
    await expect(readNight(dir, night)).resolves.toEqual({ found: true, ...empty, badLines: 2 });
  });

  it('propagates filesystem errors other than ENOENT', async () => {
    await mkdir(join(dir, `${night}.jsonl`));
    await expect(readNight(dir, night)).rejects.toMatchObject({ code: 'EISDIR' });
    const file = join(dir, 'file');
    await writeFile(file, '');
    await expect(readNight(file, night)).rejects.toMatchObject({ code: 'ENOTDIR' });
  });

  it('counts each malformed nonblank line once and continues after it', async () => {
    const invalid: unknown[] = [null, [], 1, 'text', true, {},
      { ...base, job: '' }, { ...base, job: 1 }, { ...base, job: null },
      { ...base, at: undefined }, { ...base, at: 1 },
      { ...base, status: 'OK' }, { ...base, status: null }, { ...base, status: undefined },
      { ...base, owner: undefined }, { ...base, owner: 4 },
      { ...base, error: null }, { ...base, error: false },
    ];
    const lines = [JSON.stringify(base), '{broken', ...invalid.map(value => JSON.stringify(value)), ' \t\r', JSON.stringify({ ...base, owner: null, extra: true })];
    await writeFile(join(dir, `${night}.jsonl`), lines.join('\r\n') + '\r\n');
    const digest = await readNight(dir, night);
    expect(digest.badLines).toBe(invalid.length + 1);
    expect(digest.counts).toEqual({ ok: 2, retry: 0, fail: 0 });
    expect(digest.rows[0]).toMatchObject({ runs: 2, owner: null });
  });

  it.each([
    'not-a-time', '2026-10-28', '2026-10-28T23:00:00',
    '2026-02-30T00:00:00Z', '1900-02-29T00:00:00Z', '2026-13-01T00:00:00Z',
    '2026-10-28T25:00:00Z', '2026-10-28T24:01:00Z', '2026-10-28T24:00:00.1Z',
    '2026-10-28T00:60:00Z', '2026-10-28T00:00:60Z',
    '2026-10-28T00:00:00+24:00', '2026-10-28T00:00:00+01:60',
    '2026-10-28T00:00:00Zjunk',
  ])('rejects invalid timestamp %s', async at => {
    await writeRecords([{ ...base, at }]);
    await expect(readNight(dir, night)).resolves.toEqual({ found: true, ...empty, badLines: 1 });
  });

  it.each(['2000-02-29T00:00:00Z', '0099-01-01T00:00:00Z', '2026-10-28T23:00:00.123456+0130', '2026-10-28T23:00-04:00', '2026-10-28T24:00:00Z'])('retains valid timestamp text %s exactly', async at => {
    await writeRecords([{ ...base, at }]);
    const digest = await readNight(dir, night);
    expect(digest.badLines).toBe(0);
    expect(digest.rows[0]).toMatchObject({ firstAt: at, lastAt: at });
  });

  it('aggregates chronologically by instant, keeps stable ties and latest nullable fields', async () => {
    const firstAt = '2026-10-28T23:00:00+02:00';
    const lastAt = '2026-10-28T17:00:00-05:00';
    await writeRecords([
      { ...base, at: '2026-10-28T22:00:00Z', status: 'fail', error: 'latest failure', owner: 'later' },
      { ...base, at: firstAt, status: 'fail', error: 'earliest failure' },
      { ...base, at: '2026-10-28T21:30:00Z', status: 'retry', error: 'retry' },
      { ...base, at: lastAt, owner: null },
      { ...base, at: '2026-10-28T21:45:00Z', status: 'retry' },
    ]);
    const digest = await readNight(dir, night);
    expect(digest.counts).toEqual({ ok: 1, retry: 2, fail: 2 });
    expect(digest.rows).toEqual([{ job: 'job', owner: null, runs: 5, retries: 2, failures: 2, lastStatus: 'ok', lastError: null, firstAt, lastAt }]);
  });

  it('does not lose chronological precision below milliseconds', async () => {
    const firstAt = '2026-10-28T22:00:00.00001Z';
    const lastAt = '2026-10-28T22:00:00.00002Z';
    await writeRecords([
      { ...base, at: lastAt, status: 'fail', error: 'final', owner: 'final owner' },
      { ...base, at: firstAt },
    ]);
    const digest = await readNight(dir, night);
    expect(digest.rows[0]).toMatchObject({ firstAt, lastAt, lastStatus: 'fail', lastError: 'final', owner: 'final owner', failures: 1 });
  });

  it('sorts job names by case-sensitive JS comparison, including prototype-like names', async () => {
    const jobs = ['é', 'z', '__proto__', 'a', 'Z', 'constructor', 'A', ' '];
    await writeRecords(jobs.map(job => ({ ...base, job, owner: '', error: '' })));
    const digest = await readNight(dir, night);
    expect(digest.rows.map(row => row.job)).toEqual([' ', 'A', 'Z', '__proto__', 'a', 'constructor', 'z', 'é']);
    expect(digest.rows.every(row => row.owner === '' && row.lastError === '')).toBe(true);
  });
});
