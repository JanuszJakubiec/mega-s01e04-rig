import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { isCalendarDate } from './digest/night.js';
import { readNight } from './digest/reader.js';
import { lane } from './lane.js';
import { readStatus } from './status.js';
import { Layout } from './views/layout.js';
import { Digest } from './views/digest.js';
import { StatusBoard } from './views/status.js';

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/api/digest/:night', async (c) => {
    try {
      const digest = await readNight(config.runsDir, c.req.param('night'));
      return c.json(digest, digest.found ? 200 : 404);
    } catch (error) {
      if (error instanceof RangeError) {
        return c.notFound();
      }
      throw error;
    }
  });

  app.get('/', async (c) => {
    const status = readStatus(config);
    const nights = await Promise.all(
      status.nights.map(async (night) => ({
        night,
        digest: await readNight(config.runsDir, night),
      })),
    );

    return c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={status} nights={nights} />
      </Layout>,
    );
  });

  app.get('/digest/:night', async (c) => {
    const night = c.req.param('night');
    if (!isCalendarDate(night)) return c.notFound();

    const digest = await readNight(config.runsDir, night);
    if (!digest.found) return c.notFound();

    return c.html(
      <Layout title={`digest · ${night}`} lane={lane()}>
        <p><a href="/">status</a></p>
        <Digest night={night} digest={digest} />
      </Layout>,
    );
  });

  return app;
}
