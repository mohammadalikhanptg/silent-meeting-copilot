// Recall.ai integration 1/N — fully offline test suite (no network).
//
// Proves, without ever touching the Recall API:
//   1. The control-plane client is dormant: every method throws
//      RecallDisabledError while RECALL_ENABLED is not exactly "true", and the
//      injected fetch is never called (no network is attempted).
//   2. When (hypothetically) enabled, the client targets the region-aware base
//      URL and sends the Token auth header — verified against an injected fake
//      fetch, with NO real network.
//   3. The webhook verifier rejects a missing/!whsec_ secret, rejects a tampered
//      body, and accepts a correctly Svix-signed fixture.
//   4. recall-map produces the exact bot_frame shape from sample transcript.data
//      and participant_events fixtures.
//
// Run: node scripts/test-recall.mjs   (wired as `npm run test:recall`)

import {
  createRecallClient,
  RecallDisabledError,
  recallBaseUrl,
  recallEnabled,
  DEFAULT_RECALL_REGION,
} from '../worker/src/recall-client.js';
import { verifyAndParse } from '../worker/src/recall-webhook.js';
import { mapTranscriptData, mapParticipantEvent } from '../worker/src/recall-map.js';

let pass = 0,
  fail = 0;
function ok(cond, label) {
  if (cond) {
    pass++;
    console.log('  ✅ ' + label);
  } else {
    fail++;
    console.log('  ❌ ' + label);
  }
}
function section(t) {
  console.log('\n' + t);
}

// A fetch that explodes if it is ever called — proves the gate blocks network.
function explodingFetch() {
  throw new Error('NETWORK ATTEMPTED — gate failed to block the call');
}

// Sign a body exactly the way Recall/Svix does, for the accept-path fixture.
async function svixSign(secret, id, timestamp, body) {
  const keyB64 = secret.slice('whsec_'.length);
  const keyBytes = Uint8Array.from(Buffer.from(keyB64, 'base64'));
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${id}.${timestamp}.${body}`)
  );
  return Buffer.from(new Uint8Array(sig)).toString('base64');
}

await (async function main() {
  // ── 1. Master gate: every client method throws while disabled ────────────
  section('Test 1: client methods throw RecallDisabledError while flag OFF');

  for (const flagEnv of [
    { label: 'unset', env: {} },
    { label: '"false"', env: { RECALL_ENABLED: 'false' } },
    { label: '"1" (not the exact string true)', env: { RECALL_ENABLED: '1' } },
    { label: 'boolean true (not the string)', env: { RECALL_ENABLED: true } },
  ]) {
    const env = { RECALL_API_KEY: 'should-never-be-used', ...flagEnv.env };
    const client = createRecallClient(env, explodingFetch);
    const methods = [
      ['createBot', () => client.createBot('https://zoom.us/j/123', {})],
      ['retrieveBot', () => client.retrieveBot('bot_1')],
      ['deleteBot', () => client.deleteBot('bot_1')],
      ['listBots', () => client.listBots()],
    ];
    for (const [name, call] of methods) {
      let threw = null;
      try {
        call();
      } catch (e) {
        threw = e;
      }
      ok(
        threw instanceof RecallDisabledError,
        `${name}() throws RecallDisabledError synchronously when RECALL_ENABLED=${flagEnv.label}`
      );
    }
  }

  ok(recallEnabled({ RECALL_ENABLED: 'true' }) === true, 'recallEnabled true only for exact "true"');
  ok(recallEnabled({ RECALL_ENABLED: 'TRUE' }) === false, 'recallEnabled false for "TRUE"');

  // ── 2. When enabled: region-aware URL + Token header, via injected fetch ──
  section('Test 2: enabled client targets region base URL + Token header (no real network)');

  ok(
    recallBaseUrl({}) === `https://${DEFAULT_RECALL_REGION}.recall.ai/api/v1`,
    'default region base URL is eu-central-1'
  );
  ok(
    recallBaseUrl({ RECALL_REGION: 'us-east-1' }) === 'https://us-east-1.recall.ai/api/v1',
    'region base URL honours RECALL_REGION'
  );

  let captured = null;
  const fakeFetch = async (url, init) => {
    captured = { url, init };
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: 'bot_abc', status_changes: [] }),
    };
  };
  const enabled = createRecallClient(
    { RECALL_ENABLED: 'true', RECALL_REGION: 'eu-central-1', RECALL_API_KEY: 'k_secret' },
    fakeFetch
  );
  const created = await enabled.createBot('https://meet.google.com/abc', { bot_name: 'SMC' });
  ok(captured.url === 'https://eu-central-1.recall.ai/api/v1/bot', 'createBot hits /bot on region base');
  ok(captured.init.method === 'POST', 'createBot uses POST');
  ok(
    captured.init.headers.Authorization === 'Token k_secret',
    'Authorization header is exactly "Token <key>"'
  );
  ok(
    JSON.parse(captured.init.body).meeting_url === 'https://meet.google.com/abc',
    'createBot body carries meeting_url'
  );
  ok(JSON.parse(captured.init.body).bot_name === 'SMC', 'createBot passes opts through');
  ok(created && created.id === 'bot_abc', 'createBot parses the JSON response');

  await enabled.retrieveBot('bot 7/with?chars');
  ok(
    captured.url === 'https://eu-central-1.recall.ai/api/v1/bot/bot%207%2Fwith%3Fchars',
    'retrieveBot URL-encodes the bot id'
  );

  // ── 3. Webhook Svix verification ─────────────────────────────────────────
  section('Test 3: webhook verify rejects bad input, accepts a signed fixture');

  const secret = 'whsec_' + Buffer.from('super-secret-signing-key-bytes!!').toString('base64');
  const id = 'msg_2abc';
  const timestamp = '1700000000';
  const body = JSON.stringify({ event: 'transcript.data', data: { foo: 'bar' } });
  const goodSig = await svixSign(secret, id, timestamp, body);
  const headers = {
    'webhook-id': id,
    'webhook-timestamp': timestamp,
    'webhook-signature': `v1,${goodSig}`,
  };

  const missingSecret = await verifyAndParse(headers, body, undefined);
  ok(missingSecret.ok === false && missingSecret.reason === 'missing_or_invalid_secret', 'rejects missing secret');

  const badSecretShape = await verifyAndParse(headers, body, 'not-a-whsec-secret');
  ok(badSecretShape.ok === false && badSecretShape.reason === 'missing_or_invalid_secret', 'rejects non-whsec_ secret');

  const missingHeaders = await verifyAndParse(
    { 'webhook-id': id },
    body,
    secret
  );
  ok(missingHeaders.ok === false && missingHeaders.reason === 'missing_signature_headers', 'rejects missing signature headers');

  const tampered = await verifyAndParse(headers, body + ' tampered', secret);
  ok(tampered.ok === false && tampered.reason === 'signature_mismatch', 'rejects a tampered body (signature mismatch)');

  const wrongSecret = 'whsec_' + Buffer.from('a-totally-different-key-of-len!!').toString('base64');
  const wrongSigOk = await verifyAndParse(headers, body, wrongSecret);
  ok(wrongSigOk.ok === false && wrongSigOk.reason === 'signature_mismatch', 'rejects when signed with a different secret');

  const accepted = await verifyAndParse(headers, body, secret);
  ok(accepted.ok === true, 'accepts a correctly-signed fixture');
  ok(accepted.event === 'transcript.data', 'returns the parsed event type');
  ok(accepted.payload && accepted.payload.data.foo === 'bar', 'returns the parsed payload');

  // Multiple space-separated signatures: one valid v1 entry is enough.
  const multi = await verifyAndParse(
    { ...headers, 'webhook-signature': `v1,deadbeef v1,${goodSig} v2,ignored` },
    body,
    secret
  );
  ok(multi.ok === true, 'accepts when one of several v1 signatures matches');

  // Case-insensitive header lookup + Headers-like get().
  const headersObj = new Map(Object.entries(headers));
  const viaGet = await verifyAndParse({ get: (k) => headersObj.get(k) ?? null }, body, secret);
  ok(viaGet.ok === true, 'reads headers via a Headers-like get()');

  // ── 4. recall-map: realtime payload -> bot_frame ─────────────────────────
  section('Test 4: recall-map maps realtime payloads to the bot_frame shape');

  // Recall webhook envelope: useful data nested under data.data.
  const transcriptEvt = {
    event: 'transcript.data',
    data: {
      data: {
        participant: { id: 100, name: 'Alice Smith', is_host: true },
        words: [
          { text: 'I', start_timestamp: { relative: 1.0 }, end_timestamp: { relative: 1.2 } },
          { text: 'led', start_timestamp: { relative: 1.2 }, end_timestamp: { relative: 1.5 } },
          { text: 'billing.', start_timestamp: { relative: 1.5 }, end_timestamp: { relative: 2.0 } },
        ],
      },
      bot: { id: 'bot_abc' },
    },
  };
  const frame = mapTranscriptData(transcriptEvt);
  const expectedFrame = {
    participantId: '100',
    participantName: 'Alice Smith',
    text: 'I led billing.',
    tsStart: 1.0,
    tsEnd: 2.0,
    isFinal: true,
  };
  ok(
    JSON.stringify(frame) === JSON.stringify(expectedFrame),
    'transcript.data maps to the exact bot_frame { participantId, participantName, text, tsStart, tsEnd, isFinal }'
  );

  // Partial event -> isFinal false; un-nested (realtime socket) shape.
  const partialEvt = {
    event: 'transcript.partial_data',
    data: {
      participant: { id: 7, name: 'Bob' },
      words: [{ text: 'hello', start_timestamp: { relative: 5.0 }, end_timestamp: { relative: 5.3 } }],
    },
  };
  const partial = mapTranscriptData(partialEvt);
  ok(partial.isFinal === false, 'partial_data event maps to isFinal=false');
  ok(partial.participantId === '7' && partial.text === 'hello', 'un-nested realtime shape is also handled');
  ok(partial.tsStart === 5.0 && partial.tsEnd === 5.3, 'single-word timestamps map correctly');

  // Empty / malformed transcript degrades safely (no throw).
  const empty = mapTranscriptData({ event: 'transcript.data', data: { data: {} } });
  ok(empty.text === '' && empty.tsStart === null && empty.participantId === '', 'missing fields degrade to safe defaults');

  // Participant event.
  const joinEvt = {
    event: 'participant_events.join',
    data: {
      data: {
        participant: { id: 100, name: 'Alice Smith' },
        action: 'join',
        timestamp: { relative: 0.5 },
      },
    },
  };
  const pj = mapParticipantEvent(joinEvt);
  ok(
    pj.participantId === '100' && pj.participantName === 'Alice Smith' && pj.action === 'join' && pj.ts === 0.5,
    'participant_events.join maps to { participantId, participantName, action, ts }'
  );

  // Action inferred from the event name when not in the body.
  const leaveEvt = {
    event: 'participant_events.leave',
    data: { data: { participant: { id: 7, name: 'Bob' } } },
  };
  const pl = mapParticipantEvent(leaveEvt);
  ok(pl.action === 'leave' && pl.participantId === '7', 'participant action is inferred from the event name');

  // ── summary ──
  console.log('\n' + '─'.repeat(60));
  console.log(`Results: ${pass} passed, ${fail} failed`);
  if (fail > 0) {
    console.log('SOME TESTS FAILED ❌');
    process.exit(1);
  }
  console.log('All tests passed ✅');
})();
