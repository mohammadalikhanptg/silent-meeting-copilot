// R2 S3-compatible client for smc-session-audio.
//
// R2_BUCKET env points at pacific-backups — do NOT use it here. This module
// always addresses smc-session-audio via R2_ENDPOINT + R2_ACCESS_KEY_ID.

import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';

const SMC_AUDIO_BUCKET = 'smc-session-audio';
const PRESIGN_TTL_SECONDS = 3600; // 1-hour presigned URLs

function getR2Client() {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) return null;
  return new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
}

// List all R2 keys under meetings/<meetingId>/<speaker>/
async function listMeetingAudioKeys(meetingId, speaker) {
  const client = getR2Client();
  if (!client) return [];
  const prefix = `meetings/${meetingId}/${speaker}/`;
  const keys = [];
  let continuationToken;
  do {
    const cmd = new ListObjectsV2Command({
      Bucket: SMC_AUDIO_BUCKET,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    });
    const res = await client.send(cmd);
    for (const obj of (res.Contents || [])) {
      if (obj.Key) keys.push({ key: obj.Key, size: obj.Size, lastModified: obj.LastModified });
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);
  return keys;
}

// Presign a single R2 object for download (GET), valid for PRESIGN_TTL_SECONDS.
async function presignKey(key) {
  const client = getR2Client();
  if (!client) return null;
  const cmd = new GetObjectCommand({ Bucket: SMC_AUDIO_BUCKET, Key: key });
  return getSignedUrl(client, cmd, { expiresIn: PRESIGN_TTL_SECONDS });
}

// Return { me: [...presigned], others: [...presigned] } for a meeting.
// Each entry is { key, url, size, lastModified }.
// Returns empty arrays (not an error) when no audio was retained.
export async function getMeetingAudioUrls(meetingId) {
  const [meKeys, othersKeys] = await Promise.all([
    listMeetingAudioKeys(meetingId, 'me'),
    listMeetingAudioKeys(meetingId, 'others'),
  ]);

  const [meUrls, othersUrls] = await Promise.all([
    Promise.all(meKeys.map(async (f) => ({ ...f, url: await presignKey(f.key) }))),
    Promise.all(othersKeys.map(async (f) => ({ ...f, url: await presignKey(f.key) }))),
  ]);

  return { me: meUrls, others: othersUrls };
}

// Delete all R2 audio objects for a meeting (called during session hard-delete).
// Silently succeeds if no objects exist or if R2 credentials are absent.
export async function deleteMeetingAudio(meetingId) {
  const client = getR2Client();
  if (!client) return;
  const [meKeys, othersKeys] = await Promise.all([
    listMeetingAudioKeys(meetingId, 'me'),
    listMeetingAudioKeys(meetingId, 'others'),
  ]);
  const allKeys = [...meKeys, ...othersKeys].map((f) => ({ Key: f.key }));
  if (!allKeys.length) return;
  // R2 DeleteObjects accepts up to 1000 keys per request.
  for (let i = 0; i < allKeys.length; i += 1000) {
    const batch = allKeys.slice(i, i + 1000);
    await client.send(new DeleteObjectsCommand({
      Bucket: SMC_AUDIO_BUCKET,
      Delete: { Objects: batch, Quiet: true },
    }));
  }
}
