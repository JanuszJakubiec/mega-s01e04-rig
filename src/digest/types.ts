export type DigestStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  /** Owner from the last valid record, including an explicit null. */
  owner: string | null;
  /** All valid records for this job, including retries and failures. */
  runs: number;
  /** Records whose status is retry, not runs minus one. */
  retries: number;
  lastStatus: DigestStatus;
  /** Error on the last record, or null when absent; never a stale error. */
  lastError: string | null;
  /** Earliest/latest instants, retaining the original timestamp and offset. */
  firstAt: string;
  lastAt: string;
};

/** Counts of valid log records, not counts of jobs by their last status. */
export type DigestCounts = Record<DigestStatus, number>;

/** Shared reader output for the HTML page, JSON endpoint, and board. */
export type NightDigest = {
  /** False only for ENOENT; rows and counts are empty/zero in that case. */
  found: boolean;
  /** One row per job, ascending by case-sensitive JS string comparison. */
  rows: DigestRow[];
  /** Nonblank lines rejected as invalid JSON or invalid records. */
  badLines: number;
  counts: DigestCounts;
};

/**
 * Contract for readNight(runsDir, night); no implementation lives here.
 *
 * Read runsDir/<night>.jsonl. night must be YYYY-MM-DD with a real calendar
 * date; invalid input rejects with RangeError before any filesystem access.
 * Return found=false, rows=[], badLines=0, and all counts zero for ENOENT.
 * Other filesystem errors reject rather than masquerading as missing data.
 * An empty/blank-only file returns found=true with empty rows and zero counts.
 * An all-invalid file also returns found=true, with its badLines count.
 *
 * A valid record is an object with a nonempty string job, an ISO 8601 at
 * timestamp with explicit Z or numeric offset, a DigestStatus status, and
 * owner as string or null. Optional error must be a string when present.
 * Ignore extra fields. Skip blank lines; count each other invalid line once
 * and continue. A trailing newline is not a bad line.
 *
 * Aggregate valid records by job. Order records by timestamp instant; ties
 * follow file order. firstAt/lastAt preserve the original timestamp text;
 * lastStatus, lastError, and owner come from that same last record.
 * Return rows sorted by job (not locale-dependent), and counts across all
 * valid records. Consumers share this result rather than reinterpreting logs.
 */
export type ReadNight = (runsDir: string, night: string) => Promise<NightDigest>;
