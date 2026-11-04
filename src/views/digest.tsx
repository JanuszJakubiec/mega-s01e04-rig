import type { NightDigest } from '../digest/types.js';

function missing(value: string | null) {
  return value ?? '—';
}

function rowWarning(row: NightDigest['rows'][number]) {
  return row.retries >= 3 || row.failures > 0;
}

export function Digest({ night, digest }: { night: string; digest: NightDigest }) {
  const rows = [...digest.rows].sort((left, right) => (left.job < right.job ? -1 : left.job > right.job ? 1 : 0));

  if (rows.length === 0) {
    return (
      <>
        <h1>digest · {night}</h1>
        <p>nothing ran</p>
        {digest.badLines > 0 && (
          <p class="warn" role="status">
            {digest.badLines} malformed {digest.badLines === 1 ? 'line was' : 'lines were'} skipped
          </p>
        )}
      </>
    );
  }

  return (
    <>
      <h1>digest · {night}</h1>
      {digest.badLines > 0 && (
        <p class="warn" role="status">
          {digest.badLines} malformed {digest.badLines === 1 ? 'line was' : 'lines were'} skipped
        </p>
      )}
      <div class="table-region" tabindex={0} aria-label="Digest table; scroll horizontally to view all columns">
        <table>
          <thead>
            <tr>
              <th scope="col">job</th>
              <th scope="col">owner</th>
              <th scope="col">runs</th>
              <th scope="col">retries</th>
              <th scope="col">failures</th>
              <th scope="col">last status</th>
              <th scope="col">last error</th>
              <th scope="col">first time</th>
              <th scope="col">last time</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const warning = rowWarning(row);
              return (
                <tr class={warning ? 'warn-row' : undefined}>
                  <th scope="row">
                    {row.job}
                    {warning && <span class="warning-label"> · needs attention</span>}
                  </th>
                  <td>{missing(row.owner)}</td>
                  <td>{row.runs}</td>
                  <td>{row.retries}</td>
                  <td>{row.failures}</td>
                  <td>{row.lastStatus}</td>
                  <td>{missing(row.lastError)}</td>
                  <td>{row.firstAt}</td>
                  <td>{row.lastAt}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
