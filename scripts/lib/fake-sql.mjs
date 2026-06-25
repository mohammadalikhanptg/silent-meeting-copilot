// fake-sql.mjs — a tiny in-memory stand-in for the Neon tagged-template client,
// supporting exactly the statement shapes used by app/lib/retention.js.
//
// It exists so the retention + IDOR tests can exercise the REAL hardDeleteSession
// logic deterministically with no DATABASE_URL and no secrets (CI-safe). When a
// live DATABASE_URL is present the same tests run against Neon instead; the shim
// is the offline fallback, not a replacement for the schema.
//
// It is intentionally not a SQL engine: it dispatches on the normalised template
// text. If a query in retention.js changes shape, the matching test fails loudly
// — which is the point (the shim tracks the code under test).

function normalize(strings) {
  return strings.join('?').replace(/\s+/g, ' ').trim();
}

let counter = 0;
export function uid(prefix = 'id') {
  counter += 1;
  return `${prefix}-${counter}`;
}

// store: { meetings, transcript_segments, flagged_items, session_reference_docs,
//          profile_docs, user_profiles, magic_links, auth_attempts, sessions }
export function makeFakeSql(store) {
  const tables = [
    'meetings', 'transcript_segments', 'flagged_items', 'session_reference_docs',
    'profile_docs', 'user_profiles', 'magic_links', 'auth_attempts', 'sessions',
  ];
  for (const t of tables) if (!store[t]) store[t] = [];

  return async function sql(strings, ...values) {
    const q = normalize(strings);

    // ── COUNT(*) ───────────────────────────────────────────────────────────
    if (/^SELECT count\(\*\)/i.test(q)) {
      const table = q.match(/FROM (\w+)/i)[1];
      const col = q.includes('meeting_id = ?') ? 'meeting_id' : 'id';
      const val = values[0];
      const n = store[table].filter(r => r[col] === val).length;
      return [{ n }];
    }

    // ── meetings reads ─────────────────────────────────────────────────────
    if (/^SELECT user_email FROM meetings WHERE id = \?/i.test(q)) {
      return store.meetings.filter(r => r.id === values[0]).map(r => ({ user_email: r.user_email }));
    }
    if (/^SELECT id, user_email, title FROM meetings WHERE id = \? AND user_email = \?/i.test(q)) {
      return store.meetings
        .filter(r => r.id === values[0] && r.user_email === values[1])
        .map(r => ({ id: r.id, user_email: r.user_email, title: r.title }));
    }
    if (/^SELECT id FROM meetings WHERE user_email = \?/i.test(q)) {
      return store.meetings.filter(r => r.user_email === values[0]).map(r => ({ id: r.id }));
    }
    if (/^SELECT id, user_email, mode_type FROM meetings WHERE/i.test(q)) {
      // purgeExpiredSessions: values = [botCutoff, stdCutoff]
      const [botCutoff, stdCutoff] = values;
      return store.meetings
        .filter(r => {
          const eff = r.ended_at || r.started_at;
          if (r.mode_type === 'bot') return eff < botCutoff;
          return eff < stdCutoff;
        })
        .map(r => ({ id: r.id, user_email: r.user_email, mode_type: r.mode_type }));
    }

    // ── DELETE ... RETURNING id ────────────────────────────────────────────
    if (/^DELETE FROM/i.test(q)) {
      const table = q.match(/^DELETE FROM (\w+)/i)[1];
      let predicate;
      if (/WHERE meeting_id = \? RETURNING/i.test(q)) {
        predicate = r => r.meeting_id === values[0];
      } else if (/WHERE id = \? AND user_email = \? RETURNING/i.test(q)) {
        predicate = r => r.id === values[0] && r.user_email === values[1];
      } else if (/WHERE user_email = \? RETURNING/i.test(q)) {
        predicate = r => r.user_email === values[0];
      } else if (/WHERE created_at < \? RETURNING/i.test(q)) {
        predicate = r => r.created_at < values[0];
      } else if (/WHERE expires_at < \? OR \(revoked_at IS NOT NULL AND revoked_at < \?\)/i.test(q)) {
        predicate = r => r.expires_at < values[0] || (r.revoked_at && r.revoked_at < values[1]);
      } else {
        throw new Error('fake-sql: unhandled DELETE shape: ' + q);
      }
      const removed = store[table].filter(predicate);
      store[table] = store[table].filter(r => !predicate(r));
      return removed.map(r => ({ id: r.id }));
    }

    throw new Error('fake-sql: unhandled query shape: ' + q);
  };
}
