import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { readNight } from './digest/reader.js';
import { lane } from './lane.js';
import { readNight } from './digest/reader.js';
import { readStatus } from './status.js';
import { Layout } from './views/layout.js';
import { Digest } from './views/digest.js';
import { StatusBoard } from './views/status.js';

function isValidNight(night: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return false;
  const date = new Date(`${night}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === night;
}

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

  app.get('/', (c) =>
    c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={readStatus(config)} />
      </Layout>,
    ),
  );

  app.get('/digest/:night', async (c) => {
    const night = c.req.param('night');
    if (!isValidNight(night)) return c.notFound();

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
