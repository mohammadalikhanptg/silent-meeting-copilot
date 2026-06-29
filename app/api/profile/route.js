import { NextResponse } from 'next/server';
import { getSessionPayload } from '../../lib/auth';
import { getSql } from '../../lib/db';

export const dynamic = 'force-dynamic';

// Default seed profile — only public business facts, no personal data.
// Operator fills in phone, postal_address, bio via the /profile page.
const DEFAULT_SEED = {
  businesses: [
    { name: 'Pacific Technology Group', website: 'pacific.london', blog: '' },
    { name: 'Pacific Infotech', website: 'pacificinfotech.co.uk', blog: '' },
  ],
  postal_address: '',
  phone: '',
  emails: [
    { label: 'Work', value: 'ali@pacific.london' },
    { label: 'Managed services', value: 'ali@pacificinfotech.co.uk' },
  ],
  social_links: [],
  bio: '',
  common_items: [],
};

async function getOrCreateProfile(sql, email) {
  // Idempotent self-migration: ensure the personal display-name column exists.
  try { await sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS display_name TEXT`; } catch (_) {}
  const rows = await sql`SELECT * FROM user_profiles WHERE user_email = ${email} LIMIT 1`;
  if (rows.length > 0) return rows[0];

  // First visit — seed with known public facts, leave personal fields blank
  const [row] = await sql`
    INSERT INTO user_profiles (user_email, businesses, emails, social_links, common_items)
    VALUES (
      ${email},
      ${JSON.stringify(DEFAULT_SEED.businesses)},
      ${JSON.stringify(DEFAULT_SEED.emails)},
      ${JSON.stringify(DEFAULT_SEED.social_links)},
      ${JSON.stringify(DEFAULT_SEED.common_items)}
    )
    RETURNING *
  `;
  return row;
}

export async function GET() {
  const session = await getSessionPayload();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sql = getSql();
  const profile = await getOrCreateProfile(sql, session.email);

  // Include uploaded profile docs (with content_text) so session page can pass them to coaching
  const docs = await sql`
    SELECT id, filename, content_text, added_at
    FROM profile_docs
    WHERE user_email = ${session.email}
    ORDER BY added_at
  `;

  return NextResponse.json({
    profile: {
      ...profile,
      default_language_mode: profile.default_language_mode || 'english',
      profile_reference_text: profile.profile_reference_text || '',
      profile_docs: docs,
    },
  });
}

export async function PUT(request) {
  const session = await getSessionPayload();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const {
    businesses, postal_address, phone, emails,
    social_links, bio, common_items, profile_reference_text,
    default_language_mode, display_name,
  } = body;

  const sql = getSql();

  // Ensure profile row exists before updating
  await getOrCreateProfile(sql, session.email);

  const dlm = ['english', 'hindi-urdu', 'auto'].includes(default_language_mode) ? default_language_mode : 'english';

  const [updated] = await sql`
    UPDATE user_profiles
    SET
      businesses             = ${JSON.stringify(businesses ?? [])},
      postal_address         = ${postal_address ?? null},
      phone                  = ${phone ?? null},
      emails                 = ${JSON.stringify(emails ?? [])},
      social_links           = ${JSON.stringify(social_links ?? [])},
      bio                    = ${bio ?? null},
      common_items           = ${JSON.stringify(common_items ?? [])},
      profile_reference_text = ${profile_reference_text ?? null},
      default_language_mode  = ${dlm},
      display_name           = ${display_name ?? null},
      updated_at             = now()
    WHERE user_email = ${session.email}
    RETURNING *
  `;

  return NextResponse.json({ profile: updated });
}
