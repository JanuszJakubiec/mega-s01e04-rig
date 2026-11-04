import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { NightDigest } from '../src/digest/types.js';

const configFor = (runsDir: string) => ({
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir,
});

const digestNight = '2026-02-01';
const expectedDigest = {
  found: true,
  rows: [
    {
      job: '<script>job</script>',
      owner: '<owner>',
      runs: 1,
      retries: 0,
      failures: 1,
      lastStatus: 'fail',
      lastError: '<error & text>',
      firstAt: '2026-02-01T08:00:00+01:00',
      lastAt: '2026-02-01T08:00:00+01:00',
    },
    {
      job: 'alpha',
      owner: 'ann',
      runs: 2,
      retries: 0,
      failures: 1,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-02-01T00:10:00+02:00',
      lastAt: '2026-02-01T00:20:00+02:00',
    },
    {
      job: 'null-owner',
      owner: null,
      runs: 1,
      retries: 0,
      failures: 0,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-02-01T09:00:00-05:00',
      lastAt: '2026-02-01T09:00:00-05:00',
    },
    {
      job: 'retry/job',
      owner: 'rook',
      runs: 4,
      retries: 3,
      failures: 0,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-02-01T01:00:00+01:00',
      lastAt: '2026-02-01T01:04:00+01:00',
    },
    {
      job: 'zeta',
      owner: 'zoe',
      runs: 1,
      retries: 0,
      failures: 0,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-02-01T23:00:00-05:00',
      lastAt: '2026-02-01T23:00:00-05:00',
    },
  ],
  badLines: 1,
  counts: { ok: 4, retry: 3, fail: 2 },
} satisfies NightDigest;

let runsDir: string;

beforeEach(async () => {
  runsDir = await mkdtemp(join(tmpdir(), 'rig-digest-routes-'));
});

afterEach(async () => {
  await rm(runsDir, { recursive: true, force: true });
});

async function writeNight(night: string, lines: string[]) {
  await writeFile(join(runsDir, `${night}.jsonl`), `${lines.join('\n')}\n`);
}

describe('digest routes', () => {
  it('renders the same complete digest in HTML and JSON', async () => {
    await writeNight(digestNight, [
      '{"at":"2026-02-01T23:00:00-05:00","job":"zeta","status":"ok","owner":"zoe"}',
      '{"at":"2026-02-01T00:10:00+02:00","job":"alpha","status":"fail","owner":"ann","error":"initial failure"}',
      '{"at":"2026-02-01T00:20:00+02:00","job":"alpha","status":"ok","owner":"ann"}',
      '{"at":"2026-02-01T01:00:00+01:00","job":"retry/job","status":"retry","owner":"rook","error":"first retry"}',
      '{"at":"2026-02-01T01:02:00+01:00","job":"retry/job","status":"retry","owner":"rook","error":"second retry"}',
      '{"at":"2026-02-01T01:03:00+01:00","job":"retry/job","status":"retry","owner":"rook","error":"third retry"}',
      '{"at":"2026-02-01T01:04:00+01:00","job":"retry/job","status":"ok","owner":"rook"}',
      '{"at":"2026-02-01T08:00:00+01:00","job":"<script>job</script>","status":"fail","owner":"<owner>","error":"<error & text>"}',
      '{"at":"2026-02-01T09:00:00-05:00","job":"null-owner","status":"ok","owner":null}',
      'not JSON',
    ]);

    const app = createApp(configFor(runsDir));
    const [htmlResponse, jsonResponse] = await Promise.all([
      app.request(`/digest/${digestNight}`),
      app.request(`/api/digest/${digestNight}`),
    ]);
    const html = await htmlResponse.text();
    const json = (await jsonResponse.json()) as NightDigest;

    expect(htmlResponse.status).toBe(200);
    expect(jsonResponse.status).toBe(200);
    expect(json).toEqual(expectedDigest);
    const tableBody = /<tbody>([\s\S]*?)<\/tbody>/.exec(html)?.[1] ?? '';
    const renderedRows = [...tableBody.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map(([, row]) =>
      [...row.matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/g)].map(([, cell], column) => {
        const text = cell.replace(/<[^>]*>/g, '')
          .replaceAll('&lt;', '<').replaceAll('&gt;', '>')
          .replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&');
        return column === 0 ? text.replace(/ · needs attention$/, '') : text;
      }),
    );
    expect(renderedRows).toEqual(json.rows.map((row) => [
      row.job, row.owner ?? '—', String(row.runs), String(row.retries), String(row.failures),
      row.lastStatus, row.lastError ?? '—', row.firstAt, row.lastAt,
    ]));
    expect(html).toContain('&lt;script&gt;job&lt;/script&gt;');
    expect(html).not.toContain('<script>job</script>');
    expect(html).toContain('&lt;owner&gt;');
    expect(html).toContain('&lt;error &amp; text&gt;');
    expect(html).toContain('—');
    expect(html).toContain('2026-02-01T00:10:00+02:00');
    expect(html).toContain('2026-02-01T00:20:00+02:00');
    expect(html).toMatch(/<tr class="warn-row"><th scope="row">retry\/job<span class="warning-label"> · needs attention<\/span>/);
    expect(html).toMatch(/<tr class="warn-row"><th scope="row">alpha<span class="warning-label"> · needs attention<\/span>/);

    const orderedJobs = expectedDigest.rows.map(({ job }) => html.indexOf(job === '<script>job</script>' ? '&lt;script&gt;job&lt;/script&gt;' : job));
    expect(orderedJobs.every((position, index) => index === 0 || position > orderedJobs[index - 1]!)).toBe(true);
  });

  it('returns 404 for a night with no file', async () => {
    const app = createApp(configFor(runsDir));

    await expect(app.request('/digest/2026-02-02')).resolves.toMatchObject({ status: 404 });
    await expect(app.request('/api/digest/2026-02-02')).resolves.toMatchObject({ status: 404 });
  });

  it('renders an existing empty night as an empty digest', async () => {
    await writeNight('2026-02-03', []);
    const app = createApp(configFor(runsDir));
    const [htmlResponse, jsonResponse] = await Promise.all([
      app.request('/digest/2026-02-03'),
      app.request('/api/digest/2026-02-03'),
    ]);

    expect(htmlResponse.status).toBe(200);
    expect(await htmlResponse.text()).toContain('nothing ran');
    expect(jsonResponse.status).toBe(200);
    expect((await jsonResponse.json()) as NightDigest).toEqual({
      found: true,
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it.each(['/digest/2026-02-30', '/api/digest/2026-02-30', '/digest/%2E%2E%2Foutside', '/api/digest/%2E%2E%2Foutside'])(
    'rejects invalid or path-traversal night %s',
    async (path) => {
      const response = await createApp(configFor(runsDir)).request(path);

      expect(response.status).toBe(404);
    },
  );
});
