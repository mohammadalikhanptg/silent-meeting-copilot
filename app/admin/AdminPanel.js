'use client';
import { useState } from 'react';

function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function StatusBadge({ label, color, bg }) {
  return (
    <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '10px', color, background: bg, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
      {label}
    </span>
  );
}

function RoleBadge({ role }) {
  return role === 'admin'
    ? <StatusBadge label="admin" color="#fbbf24" bg="#292000" />
    : <StatusBadge label="user" color="#94a3b8" bg="#1e293b" />;
}

function InviteStatusBadge({ status }) {
  if (!status) return null;
  const map = {
    pending:  { color: '#fbbf24', bg: '#292000' },
    accepted: { color: '#22c55e', bg: '#052e16' },
    revoked:  { color: '#f87171', bg: '#2d0a0a' },
  };
  const s = map[status] || { color: '#94a3b8', bg: '#1e293b' };
  return <StatusBadge label={status} color={s.color} bg={s.bg} />;
}

export default function AdminPanel({ initialUsers, initialPending }) {
  const [users, setUsers] = useState(initialUsers);
  const [pending, setPending] = useState(initialPending);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteResult, setInviteResult] = useState(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [copied, setCopied] = useState(false);
  const [revokeLoading, setRevokeLoading] = useState(null);
  const [revokeError, setRevokeError] = useState('');

  async function refresh() {
    const r = await fetch('/api/admin/users');
    if (r.ok) {
      const d = await r.json();
      setUsers(d.users);
      setPending(d.pending);
    }
  }

  async function createInvite(e) {
    e.preventDefault();
    setInviteLoading(true);
    setInviteError('');
    setInviteResult(null);
    try {
      const r = await fetch('/api/admin/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail }),
      });
      const d = await r.json();
      if (!r.ok) { setInviteError(d.error || 'Failed'); return; }
      setInviteResult(d);
      setInviteEmail('');
      await refresh();
    } finally {
      setInviteLoading(false);
    }
  }

  async function copyLink(url) {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function revokeInvite(inviteId, email) {
    if (!confirm(`Revoke access for ${email}? This will immediately invalidate their sessions.`)) return;
    setRevokeLoading(inviteId);
    setRevokeError('');
    try {
      const r = await fetch(`/api/admin/invites/${inviteId}`, { method: 'DELETE' });
      const d = await r.json();
      if (!r.ok) { setRevokeError(d.error || 'Failed to revoke'); return; }
      await refresh();
    } finally {
      setRevokeLoading(null);
    }
  }

  const cell = { padding: '12px 16px', borderBottom: '1px solid #1e293b', fontSize: '13px', color: '#cbd5e1', verticalAlign: 'middle' };
  const th = { ...cell, color: '#64748b', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #1e293b' };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ color: '#f1f5f9', fontFamily: 'Georgia,serif', fontSize: '22px', margin: '0 0 4px' }}>Admin — Users</h1>
      <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 32px' }}>Manage access, invites, and active users.</p>

      {/* Invite form */}
      <section style={{ background: '#0f172a', border: '1px solid #1e3a5f', borderRadius: '12px', padding: '20px', marginBottom: '32px' }}>
        <h2 style={{ color: '#38bdf8', fontSize: '14px', fontWeight: 700, margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Invite a user</h2>
        <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 16px' }}>
          Creates an invite. The link is shown below — copy it and send it manually.
          No email is sent automatically. The user follows the link to set up TOTP, then logs in via the normal flow.
        </p>
        <form onSubmit={createInvite} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <input
            type="email" required value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            placeholder="invitee@example.com"
            style={{ flex: '1 1 260px', padding: '10px 14px', borderRadius: '8px', border: '1px solid #1e3a5f', background: '#0d1117', color: '#f1f5f9', fontSize: '14px' }}
          />
          <button type="submit" disabled={inviteLoading}
            style={{ padding: '10px 20px', borderRadius: '8px', background: '#0369a1', color: '#f0f9ff', border: 'none', fontWeight: 600, fontSize: '14px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {inviteLoading ? 'Creating…' : 'Create invite'}
          </button>
        </form>
        {inviteError && <p style={{ color: '#f87171', fontSize: '13px', margin: '10px 0 0' }}>{inviteError}</p>}
        {inviteResult && (
          <div style={{ marginTop: '14px', background: '#0d1117', border: '1px solid #1e3a5f', borderRadius: '8px', padding: '14px' }}>
            <p style={{ color: '#22c55e', fontSize: '13px', margin: '0 0 8px', fontWeight: 600 }}>
              Invite created for {inviteResult.email}
            </p>
            <p style={{ color: '#64748b', fontSize: '12px', margin: '0 0 8px' }}>
              Copy this link and send it to the invitee. It is single-use for acceptance but lets them return to re-enroll TOTP.
            </p>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <code style={{ fontSize: '11px', color: '#94a3b8', wordBreak: 'break-all', flex: 1 }}>{inviteResult.inviteUrl}</code>
              <button onClick={() => copyLink(inviteResult.inviteUrl)}
                style={{ padding: '6px 14px', borderRadius: '6px', background: copied ? '#052e16' : '#1e293b', color: copied ? '#22c55e' : '#94a3b8', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                {copied ? '✓ Copied' : 'Copy link'}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Pending invites (not yet accepted / user not yet registered) */}
      {pending.length > 0 && (
        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ color: '#94a3b8', fontSize: '13px', fontWeight: 700, margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pending invites (not yet accepted)</h2>
          <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid #1e293b' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 400 }}>
              <thead><tr>
                <th style={th}>Email</th>
                <th style={th}>Invited by</th>
                <th style={th}>Created</th>
                <th style={th}>Action</th>
              </tr></thead>
              <tbody>
                {pending.map(inv => (
                  <tr key={inv.id}>
                    <td style={cell}>{inv.email}</td>
                    <td style={cell}>{inv.invited_by}</td>
                    <td style={cell}>{formatDate(inv.invited_at)}</td>
                    <td style={cell}>
                      <button onClick={() => revokeInvite(inv.id, inv.email)}
                        disabled={revokeLoading === inv.id}
                        style={{ padding: '4px 12px', borderRadius: '6px', background: '#2d0a0a', color: '#f87171', border: '1px solid #7f1d1d', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>
                        {revokeLoading === inv.id ? 'Revoking…' : 'Cancel invite'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {revokeError && <p style={{ color: '#f87171', fontSize: '13px', margin: '0 0 16px' }}>{revokeError}</p>}

      {/* Registered users */}
      <section>
        <h2 style={{ color: '#94a3b8', fontSize: '13px', fontWeight: 700, margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Registered users</h2>
        <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid #1e293b' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
            <thead><tr>
              <th style={th}>Email</th>
              <th style={th}>Role</th>
              <th style={th}>TOTP</th>
              <th style={th}>Last login</th>
              <th style={th}>Invite status</th>
              <th style={th}>Action</th>
            </tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.email}>
                  <td style={cell}>{u.email}</td>
                  <td style={cell}><RoleBadge role={u.role} /></td>
                  <td style={cell}>{u.totp_verified_at ? <StatusBadge label="enrolled" color="#22c55e" bg="#052e16" /> : <StatusBadge label="pending" color="#fbbf24" bg="#292000" />}</td>
                  <td style={cell}>{formatDate(u.last_login_at)}</td>
                  <td style={cell}><InviteStatusBadge status={u.invite_status} /> {!u.invite_id && u.role === 'user' && <span style={{ color: '#475569', fontSize: '12px' }}>env only</span>}</td>
                  <td style={cell}>
                    {u.invite_id && u.invite_status !== 'revoked' && u.role !== 'admin' ? (
                      <button onClick={() => revokeInvite(u.invite_id, u.email)}
                        disabled={revokeLoading === u.invite_id}
                        style={{ padding: '4px 12px', borderRadius: '6px', background: '#2d0a0a', color: '#f87171', border: '1px solid #7f1d1d', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>
                        {revokeLoading === u.invite_id ? 'Revoking…' : 'Revoke'}
                      </button>
                    ) : (
                      <span style={{ color: '#334155', fontSize: '12px' }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p style={{ color: '#334155', fontSize: '11px', margin: '24px 0 0', lineHeight: 1.6 }}>
        Invites are inert until the admin manually sends the link. A Codex security review and Mo approval are required before inviting real users.
      </p>
    </div>
  );
}
