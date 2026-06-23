import { redirect } from 'next/navigation';
import { getSessionPayload } from '../lib/auth';
import { getSql } from '../lib/db';
import AdminPanel from './AdminPanel';

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
    <main style={{ minHeight: '100vh', background: '#0d1117', color: '#f1f5f9' }}>
      <nav style={{ borderBottom: '1px solid #1e293b', padding: '12px 24px', display: 'flex', gap: '20px', alignItems: 'center' }}>
        <a href="/meetings" style={{ color: '#64748b', fontSize: '13px', textDecoration: 'none' }}>← Sessions</a>
        <span style={{ color: '#1e293b' }}>|</span>
        <span style={{ color: '#94a3b8', fontSize: '13px', fontWeight: 600 }}>Admin</span>
      </nav>
      <AdminPanel initialUsers={users} initialPending={pending} />
    </main>
  );
}
