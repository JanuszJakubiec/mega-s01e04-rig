import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('status board', () => {
  it('shows the lane banner and the nights on disk', async () => {
    const marker = process.env.LANE_MARKER;
    process.env.LANE_MARKER = 'TEST-MARKER';
    try {
      const res = await createApp(config).request('/');
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(html).toContain('TEST-MARKER');
      expect(html).toContain('<a href="/digest/2026-10-28">2026-10-28</a>');
      expect(html).toContain('ok 10 / retry 4 / fail 1');
      expect(html).toContain('<a href="/digest/2026-10-27">2026-10-27</a>');
      expect(html).toContain('ok 7 / retry 0 / fail 0');
    } finally {
      if (marker === undefined) delete process.env.LANE_MARKER;
      else process.env.LANE_MARKER = marker;
    }
  });

  it('lists only valid regular night files', async () => {
    const runsDir = await mkdtemp(join(tmpdir(), 'rig-status-'));
    try {
      await writeFile(join(runsDir, '2026-02-01.jsonl'), [
        '{"at":"2026-02-01T01:00:00Z","job":"alpha","status":"ok","owner":"ann"}',
        '{"at":"2026-02-01T02:00:00Z","job":"alpha","status":"retry","owner":"ann"}',
        '{"at":"2026-02-01T03:00:00Z","job":"alpha","status":"fail","owner":"ann"}',
      ].join('\n'));
      await writeFile(join(runsDir, '2026-02-30.jsonl'), 'invalid calendar date');
      await mkdir(join(runsDir, '2026-02-02.jsonl'));
      await symlink('2026-02-01.jsonl', join(runsDir, '2026-02-03.jsonl'));

      const res = await createApp({ ...config, runsDir }).request('/');
      const html = await res.text();

      expect(res.status).toBe(200);
      expect(html.match(/<a href="\/digest\/[^\"]+">[^<]+<\/a>/g)).toEqual([
        '<a href="/digest/2026-02-01">2026-02-01</a>',
      ]);
      expect(html).toContain('ok 1 / retry 1 / fail 1');
    } finally {
      await rm(runsDir, { recursive: true, force: true });
    }
  });

  it('health answers with the lane id', async () => {
    const res = await createApp(config).request('/health');
    expect(await res.json()).toEqual({ ok: true, lane: 'lane-07' });
  });
});
