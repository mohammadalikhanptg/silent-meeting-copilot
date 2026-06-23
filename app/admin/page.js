import { redirect } from 'next/navigation';
import { getSessionPayload } from '../lib/auth';
import { getSql } from '../lib/db';
import AdminPanel from './AdminPanel';
import ThemeToggle from '../components/ThemeToggle';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const session = await getSessionPayload();
  if (!session) redirect('/login');
  if (session.role !== 'admin') redirect('/meetings');

  const sql = getSql();

  const users = await sql`
    SELECT
      u.email,
      u.role,
      u.totp_verified_at,
      u.last_login_at,
      u.created_at,
      i.id          AS invite_id,
      i.status      AS invite_status,
      i.invited_by,
      i.created_at  AS invited_at
    FROM auth_users u
    LEFT JOIN LATERAL (
      SELECT id, status, invited_by, created_at
      FROM invites
      WHERE email = u.email
      ORDER BY created_at DESC
      LIMIT 1
    ) i ON true
    ORDER BY u.created_at DESC
  `;

  const pending = await sql`
    SELECT id, email, status, invited_by, created_at AS invited_at
    FROM invites
    WHERE email NOT IN (SELECT email FROM auth_users)
      AND status = 'pending'
    ORDER BY created_at DESC
  `;

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--tx)' }}>
      <nav style={{ borderBottom: '1px solid var(--border)', padding: '12px 24px', display: 'flex', gap: 16, alignItems: 'center' }}>
        <a href="/meetings" style={{ color: 'var(--accent)', fontSize: 13, textDecoration: 'none' }}>← Sessions</a>
        <span style={{ color: 'var(--border)' }}>|</span>
        <span style={{ color: 'var(--tx)', fontSize: 13, fontWeight: 600 }}>Admin</span>
        <ThemeToggle style={{ marginLeft: 'auto' }} />
      </nav>
      <AdminPanel initialUsers={users} initialPending={pending} />
    </main>
  );
}
