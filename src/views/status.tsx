import type { NightDigest } from '../digest/types.js';
import type { Status } from '../status.js';

type BoardNight = {
  night: string;
  digest: NightDigest;
};

export function StatusBoard({ status, nights }: { status: Status; nights: BoardNight[] }) {
  return (
    <>
      <h1>status</h1>
      <table>
        <tbody>
          <tr><th>adapter</th><td>{status.adapter}</td></tr>
          <tr><th>installed</th><td>{status.installed}</td></tr>
          <tr>
            <th>last beat</th>
            <td>{status.lastBeat ? `${status.lastBeat.at} · pid ${status.lastBeat.pid}` : <span class="warn">none</span>}</td>
          </tr>
        </tbody>
      </table>
      <h2>nights on disk</h2>
      {nights.length === 0 ? (
        <p class="mute">nothing in runs/</p>
      ) : (
        <ul>
          {nights.map(({ night, digest }) => (
            <li>
              <a href={`/digest/${night}`}>{night}</a>
              {' · '}ok {digest.counts.ok} / retry {digest.counts.retry} / fail {digest.counts.fail}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
