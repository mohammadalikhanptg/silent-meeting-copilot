import { NextResponse } from 'next/server';
import { getSessionPayload } from '../../../../lib/auth';
import { getSql } from '../../../../lib/db';

export const dynamic = 'force-dynamic';

const MAX_FILE_BYTES = 256 * 1024; // 256 KB per file
const MAX_FILES_PER_SESSION = 10;
const MAX_TOTAL_BYTES = 1024 * 1024; // 1 MB total per session

// Strip control characters except tab, newline, carriage return
function sanitizeText(text) {
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

// Check whether the content looks like plain text (not binary)
function isPlainText(content) {
  // Allow printable ASCII, tabs, newlines, and common extended chars
  const nullBytes = (content.match(/\x00/g) || []).length;
  return nullBytes === 0;
}

export async function GET(request, { params }) {
  const session = await getSessionPayload();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const sql = getSql();

  // Verify meeting ownership
  const [meeting] = await sql`SELECT id FROM meetings WHERE id = ${id} AND user_email = ${session.email}`;
  if (!meeting) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const docs = await sql`
    SELECT id, filename, added_at, length(content_text) AS size_bytes
    FROM session_reference_docs
    WHERE meeting_id = ${id}
    ORDER BY added_at
  `;

  return NextResponse.json({ ok: true, docs });
}

export async function POST(request, { params }) {
  const session = await getSessionPayload();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const sql = getSql();

  // Verify meeting ownership
  const [meeting] = await sql`SELECT id FROM meetings WHERE id = ${id} AND user_email = ${session.email}`;
  if (!meeting) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body.filename !== 'string' || typeof body.content !== 'string') {
    return NextResponse.json({ error: 'Missing filename or content' }, { status: 400 });
  }

  const { filename, content } = body;

  // Validate extension — only .md and .txt
  const lower = filename.toLowerCase();
  if (!lower.endsWith('.md') && !lower.endsWith('.txt')) {
    return NextResponse.json(
      { error: 'Only .md and .txt files are accepted. Please upload a Markdown or plain text file.' },
      { status: 422 }
    );
  }

  // Size check (client sends UTF-16 string; estimate bytes)
  const contentBytes = new TextEncoder().encode(content).length;
  if (contentBytes > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `File too large. Maximum file size is 256 KB (this file is ${Math.ceil(contentBytes / 1024)} KB).` },
      { status: 422 }
    );
  }

  // Content must look like plain text
  if (!isPlainText(content)) {
    return NextResponse.json(
      { error: 'File does not appear to be plain text. Only text content is accepted.' },
      { status: 422 }
    );
  }

  // Check total per-session limits
  const [counts] = await sql`
    SELECT COUNT(*)::int AS file_count, COALESCE(SUM(length(content_text)), 0)::bigint AS total_bytes
    FROM session_reference_docs WHERE meeting_id = ${id}
  `;
  if (counts.file_count >= MAX_FILES_PER_SESSION) {
    return NextResponse.json(
      { error: `Maximum ${MAX_FILES_PER_SESSION} documents per session. Remove one before uploading another.` },
      { status: 422 }
    );
  }
  if (Number(counts.total_bytes) + contentBytes > MAX_TOTAL_BYTES) {
    return NextResponse.json(
      { error: 'Total document size limit (1 MB) reached for this session. Remove a document to free space.' },
      { status: 422 }
    );
  }

  const sanitized = sanitizeText(content);
  const safeName = filename.replace(/[^\w.\-]/g, '_').slice(0, 120);

  const [doc] = await sql`
    INSERT INTO session_reference_docs (meeting_id, filename, content_text)
    VALUES (${id}, ${safeName}, ${sanitized})
    RETURNING id, filename, added_at
  `;

  return NextResponse.json({ ok: true, doc });
}
