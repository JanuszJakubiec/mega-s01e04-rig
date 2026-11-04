import { renderToString } from 'hono/jsx/dom/server';
import { describe, expect, it } from 'vitest';
import type { NightDigest } from '../src/digest/types.js';
import { Digest } from '../src/views/digest.js';

const digest: NightDigest = {
  found: true,
  badLines: 1,
  counts: { ok: 1, retry: 3, fail: 1 },
  rows: [
    {
      job: 'zeta', owner: null, runs: 4, retries: 3, failures: 1, lastStatus: 'ok', lastError: null,
      firstAt: '2026-10-28T00:00:00+01:00', lastAt: '2026-10-28T03:00:00+01:00',
    },
    {
      job: 'alpha', owner: 'rig', runs: 1, retries: 0, failures: 0, lastStatus: 'ok', lastError: null,
      firstAt: '2026-10-28T04:00:00-04:00', lastAt: '2026-10-28T04:00:00-04:00',
    },
  ],
};

describe('digest view', () => {
  it('sorts and renders every row field, warnings, and malformed lines', () => {
    const html = renderToString(<Digest night="2026-10-28" digest={digest} />);

    expect(html.indexOf('alpha')).toBeLessThan(html.indexOf('zeta'));
    expect(html).toContain('owner');
    expect(html).toContain('retries');
    expect(html).toContain('failures');
    expect(html).toContain('last error');
    expect(html).toContain('—');
    expect(html).toContain('needs attention');
    expect(html).toContain('1 malformed line was skipped');
    expect(html).toContain('2026-10-28T04:00:00-04:00');
  });

  it('explains an empty night', () => {
    const html = renderToString(<Digest night="2026-10-29" digest={{ ...digest, badLines: 0, rows: [] }} />);

    expect(html).toContain('nothing ran');
  });
});
