#!/usr/bin/env node
/**
 * SMC audio accuracy benchmark — word-level delta vs Fireflies
 *
 * Usage:
 *   MEETING_ID=<id> node scripts/benchmark-audio-accuracy.mjs [--speaker me|others|both] [--json]
 *
 * Environment (all read from process.env, inherit from ~/.pacific/env):
 *   DATABASE_URL          — Neon connection string
 *   R2_ENDPOINT           — Cloudflare R2 S3 endpoint
 *   R2_ACCESS_KEY_ID      — R2 HMAC key id
 *   R2_SECRET_ACCESS_KEY  — R2 HMAC secret
 *   FIREFLIES_API_KEY     — Fireflies GraphQL API key (get from app.fireflies.ai)
 *
 * The script:
 *   1. Retrieves the SMC transcript for the meeting from Neon.
 *   2. Downloads the retained R2 audio (ME and/or OTHERS) to a temp file.
 *   3. Uploads the audio file URL to Fireflies and polls until processed.
 *   4. Compares the Fireflies transcript to the SMC transcript using WER.
 *   5. Prints a word-level accuracy delta report.
 *
 * Fireflies GraphQL API: https://developers.fireflies.ai
 *   - uploadAudio(input: {url, title}) -> transcriptId
 *   - transcript(id) -> sentences { text }
 */

import { createReadStream, createWriteStream, mkdtempSync, rmSync } from 'fs';
import { writeFile, readFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { pipeline } from 'stream/promises';

// ── deps ─────────────────────────────────────────────────────────────────────

import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { neon } from '@neondatabase/serverless';

const SMC_AUDIO_BUCKET = 'smc-session-audio';
const FIREFLIES_GQL = 'https://api.fireflies.ai/graphql';
const POLL_INTERVAL_MS = 15_000;
const POLL_MAX_ATTEMPTS = 40; // 10 minutes

// ── args ──────────────────────────────────────────────────────────────────────

const meetingId = process.env.MEETING_ID || process.argv[2];
const speakerArg = process.argv.includes('--speaker') ? process.argv[process.argv.indexOf('--speaker') + 1] : 'both';
const jsonMode = process.argv.includes('--json');

if (!meetingId) {
  console.error('Usage: MEETING_ID=<id> node scripts/benchmark-audio-accuracy.mjs [--speaker me|others|both] [--json]');
  process.exit(1);
}

const FIREFLIES_KEY = process.env.FIREFLIES_API_KEY;
const DB_URL = process.env.DATABASE_URL;
if (!FIREFLIES_KEY) { console.error('FIREFLIES_API_KEY not set'); process.exit(1); }
if (!DB_URL) { console.error('DATABASE_URL not set'); process.exit(1); }

// ── R2 helpers ────────────────────────────────────────────────────────────────

function getR2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

async function listKeys(client, speaker) {
  const prefix = `meetings/${meetingId}/${speaker}/`;
  const keys = [];
  let token;
  do {
    const res = await client.send(new ListObjectsV2Command({
      Bucket: SMC_AUDIO_BUCKET, Prefix: prefix, ContinuationToken: token,
    }));
    for (const obj of (res.Contents || [])) { if (obj.Key) keys.push(obj.Key); }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

async function presignKey(client, key) {
  return getSignedUrl(client, new GetObjectCommand({ Bucket: SMC_AUDIO_BUCKET, Key: key }), { expiresIn: 3600 });
}

// ── Fireflies helpers ─────────────────────────────────────────────────────────

async function ffGql(query, variables = {}) {
  const res = await fetch(FIREFLIES_GQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${FIREFLIES_KEY}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  if (body.errors) throw new Error('Fireflies GQL: ' + JSON.stringify(body.errors));
  return body.data;
}

// Upload an audio URL to Fireflies for transcription; returns transcriptId.
async function ffUpload(audioUrl, title) {
  const data = await ffGql(`
    mutation($input: AddToQueueInput!) {
      uploadAudio(input: $input) { success title id }
    }
  `, { input: { url: audioUrl, title } });
  const t = data?.uploadAudio;
  if (!t?.success) throw new Error('Fireflies uploadAudio failed: ' + JSON.stringify(t));
  return t.id;
}

// Poll Fireflies until the transcript is ready; returns array of sentence strings.
async function ffPollTranscript(transcriptId) {
  for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
    const data = await ffGql(`
      query($id: String!) {
        transcript(id: $id) {
          status
          sentences { text }
        }
      }
    `, { id: transcriptId });
    const t = data?.transcript;
    if (!t) throw new Error(`Transcript ${transcriptId} not found`);
    if (t.status === 'ready' || t.status === 'processed') {
      return (t.sentences || []).map(s => s.text).join(' ');
    }
    if (t.status === 'error') throw new Error(`Fireflies transcript ${transcriptId} errored`);
    if (!jsonMode) process.stdout.write(`  polling (${i + 1}/${POLL_MAX_ATTEMPTS}, status=${t.status})…\r`);
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`Timed out waiting for Fireflies transcript ${transcriptId}`);
}

// ── WER / accuracy ────────────────────────────────────────────────────────────

function normalise(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wer(ref, hyp) {
  const r = normalise(ref).split(' ').filter(Boolean);
  const h = normalise(hyp).split(' ').filter(Boolean);
  if (!r.length) return { wer: null, refWords: 0, hypWords: h.length };
  const n = r.length, m = h.length;
  // Dynamic programming edit distance
  const dp = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (r[i - 1] === h[j - 1]) dp[i][j] = dp[i - 1][j - 1];
      else dp[i][j] = 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const edits = dp[n][m];
  return { wer: edits / n, edits, refWords: n, hypWords: m };
}

// ── SMC transcript helper ─────────────────────────────────────────────────────

async function getSMCTranscript(speaker) {
  const sql = neon(DB_URL);
  const rows = await sql`
    SELECT COALESCE(corrected_text, cleaned, raw) AS text
    FROM transcript_segments
    WHERE meeting_id = ${meetingId}
      AND (${speaker} = 'both' OR speaker = ${speaker})
    ORDER BY ts
  `;
  return rows.map(r => r.text).join(' ');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  if (!jsonMode) console.log(`\nSMC audio accuracy benchmark — meeting ${meetingId}\n`);

  const r2 = getR2Client();
  const speakers = speakerArg === 'both' ? ['me', 'others'] : [speakerArg];
  const results = [];

  for (const speaker of speakers) {
    if (!jsonMode) console.log(`[${speaker.toUpperCase()}] Listing R2 audio…`);
    const keys = await listKeys(r2, speaker);
    if (!keys.length) {
      if (!jsonMode) console.log(`  No audio retained for speaker="${speaker}". Skipping.\n`);
      continue;
    }
    if (!jsonMode) console.log(`  Found ${keys.length} audio file(s). Presigning first for Fireflies…`);

    // Fireflies expects a single URL — upload the first file and note if more exist.
    // For a multi-file session the files are ordered chronologically by key name.
    // Uploading each file independently would create separate transcripts; for
    // accuracy benchmarking the concatenated SMC transcript is compared against
    // the Fireflies transcript of the first file. A full-session benchmark would
    // require stitching; flag it in the report.
    const firstKey = keys[0];
    const audioUrl = await presignKey(r2, firstKey);

    const title = `SMC-bench-${meetingId.slice(0, 8)}-${speaker}-${Date.now()}`;
    if (!jsonMode) console.log(`  Uploading to Fireflies as "${title}"…`);
    const transcriptId = await ffUpload(audioUrl, title);
    if (!jsonMode) console.log(`  Fireflies transcript id: ${transcriptId}. Polling…`);

    const ffText = await ffPollTranscript(transcriptId);
    if (!jsonMode) console.log(`  Fireflies transcript ready (${ffText.split(' ').length} words).`);

    const smcText = await getSMCTranscript(speaker === 'me' ? 'me' : 'others');
    if (!jsonMode) console.log(`  SMC transcript: ${smcText.split(' ').filter(Boolean).length} words.`);

    // WER: SMC is hypothesis, Fireflies is reference.
    const score = wer(ffText, smcText);
    const accuracy = score.wer !== null ? `${((1 - score.wer) * 100).toFixed(1)}%` : 'N/A (empty reference)';
    const delta = keys.length > 1
      ? `NOTE: ${keys.length} audio files found; only the first was sent to Fireflies. Full-session accuracy may differ.`
      : null;

    results.push({ speaker, transcriptId, smcWords: score.hypWords, ffWords: score.refWords, edits: score.edits, wer: score.wer, accuracy, delta });

    if (!jsonMode) {
      console.log(`\n  ── ${speaker.toUpperCase()} results ──`);
      console.log(`  SMC words   : ${score.hypWords}`);
      console.log(`  Fireflies w : ${score.refWords}`);
      console.log(`  Edit dist   : ${score.edits}`);
      console.log(`  WER         : ${score.wer !== null ? (score.wer * 100).toFixed(1) + '%' : 'N/A'}`);
      console.log(`  Accuracy    : ${accuracy}`);
      if (delta) console.log(`  ${delta}`);
      console.log();
    }
  }

  if (!results.length) {
    if (!jsonMode) console.log('No audio retained for this meeting. Nothing to benchmark.');
    else console.log(JSON.stringify({ ok: false, reason: 'no_audio_retained', meetingId }));
    return;
  }

  if (jsonMode) {
    console.log(JSON.stringify({ ok: true, meetingId, results }, null, 2));
  } else {
    const overall = results.map(r => `${r.speaker}: ${r.accuracy}`).join('  |  ');
    console.log(`Summary: ${overall}`);
  }
}

run().catch(err => {
  console.error('Benchmark failed:', err.message);
  process.exit(1);
});
