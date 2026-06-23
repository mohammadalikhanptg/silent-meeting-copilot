'use client';

import { useState, useEffect } from 'react';

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const [businesses, setBusinesses] = useState([]);
  const [postalAddress, setPostalAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [emails, setEmails] = useState([]);
  const [socialLinks, setSocialLinks] = useState([]);
  const [bio, setBio] = useState('');
  const [commonItems, setCommonItems] = useState([]);

  useEffect(() => {
    fetch('/api/profile')
      .then(r => r.json())
      .then(d => {
        if (d.profile) {
          const p = d.profile;
          setBusinesses(p.businesses || []);
          setPostalAddress(p.postal_address || '');
          setPhone(p.phone || '');
          setEmails(p.emails || []);
          setSocialLinks(p.social_links || []);
          setBio(p.bio || '');
          setCommonItems(p.common_items || []);
        }
      })
      .catch(() => setError('Failed to load profile.'))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businesses,
          postal_address: postalAddress || null,
          phone: phone || null,
          emails,
          social_links: socialLinks,
          bio: bio || null,
          common_items: commonItems,
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  // List-field helpers
  function addBusiness() {
    setBusinesses(prev => [...prev, { name: '', website: '', blog: '' }]);
  }
  function removeBusiness(i) {
    setBusinesses(prev => prev.filter((_, idx) => idx !== i));
  }
  function updateBusiness(i, field, val) {
    setBusinesses(prev => prev.map((b, idx) => idx === i ? { ...b, [field]: val } : b));
  }

  function addEmail() { setEmails(prev => [...prev, { label: '', value: '' }]); }
  function removeEmail(i) { setEmails(prev => prev.filter((_, idx) => idx !== i)); }
  function updateEmail(i, field, val) {
    setEmails(prev => prev.map((e, idx) => idx === i ? { ...e, [field]: val } : e));
  }

  function addSocial() { setSocialLinks(prev => [...prev, { label: '', url: '' }]); }
  function removeSocial(i) { setSocialLinks(prev => prev.filter((_, idx) => idx !== i)); }
  function updateSocial(i, field, val) {
    setSocialLinks(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: val } : s));
  }

  function addItem() { setCommonItems(prev => [...prev, { label: '', value: '' }]); }
  function removeItem(i) { setCommonItems(prev => prev.filter((_, idx) => idx !== i)); }
  function updateItem(i, field, val) {
    setCommonItems(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: val } : c));
  }

  if (loading) {
    return (
      <div style={styles.root}>
        <div style={{ color: '#9aa0a6', padding: 32 }}>Loading profile…</div>
      </div>
    );
  }

  return (
    <>
      <style>{`* { box-sizing: border-box; } @media (max-width: 600px) { .pf-row { flex-direction: column !important; } }`}</style>
      <div style={styles.root}>
        <div style={styles.header}>
          <div>
            <div style={styles.brand}>Silent Meeting Copilot</div>
            <div style={{ display: 'flex', gap: 12, marginTop: 2 }}>
              <a href="/" style={styles.navLink}>&larr; Home</a>
              <a href="/session" style={styles.navLink}>Live session</a>
            </div>
          </div>
          <div style={styles.headerRight}>
            <h1 style={styles.title}>Operator Profile</h1>
            <p style={styles.subtitle}>
              The Live Assist feature uses this profile to surface copy-paste cards during meetings.
              Fields left blank will not generate cards. Phone, address, and bio are yours to fill in.
            </p>
          </div>
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}

        <div style={styles.infoBox}>
          <strong>Seeded businesses</strong> (Pacific Technology Group and Pacific Infotech) and email addresses are
          pre-filled from known public facts. All personal fields (phone, postal address, bio) are intentionally
          blank — please fill them in below.
        </div>

        <div style={styles.form}>

          {/* Businesses */}
          <section style={styles.section}>
            <div style={styles.sectionHeader}>
              <span style={styles.sectionTitle}>Businesses</span>
              <button style={styles.addBtn} onClick={addBusiness}>+ Add business</button>
            </div>
            {businesses.map((b, i) => (
              <div key={i} className="pf-row" style={styles.fieldRow}>
                <input
                  style={styles.input}
                  placeholder="Business name"
                  value={b.name}
                  onChange={e => updateBusiness(i, 'name', e.target.value)}
                />
                <input
                  style={styles.input}
                  placeholder="Website (e.g. pacific.london)"
                  value={b.website}
                  onChange={e => updateBusiness(i, 'website', e.target.value)}
                />
                <input
                  style={styles.input}
                  placeholder="Blog URL (optional)"
                  value={b.blog}
                  onChange={e => updateBusiness(i, 'blog', e.target.value)}
                />
                <button style={styles.removeBtn} onClick={() => removeBusiness(i)}>✕</button>
              </div>
            ))}
            {businesses.length === 0 && <div style={styles.empty}>No businesses — click + Add business</div>}
          </section>

          {/* Contact */}
          <section style={styles.section}>
            <div style={styles.sectionHeader}>
              <span style={styles.sectionTitle}>Contact</span>
            </div>
            <div className="pf-row" style={styles.fieldRow}>
              <label style={styles.label}>Phone</label>
              <input
                style={styles.input}
                placeholder="e.g. +44 20 1234 5678 (leave blank if not sharing)"
                value={phone}
                onChange={e => setPhone(e.target.value)}
              />
            </div>
            <div style={styles.fieldRow}>
              <label style={styles.label}>Postal address</label>
              <textarea
                style={{ ...styles.input, height: 72, resize: 'vertical' }}
                placeholder="e.g. 123 High Street, London EC1A 1AA (leave blank if not sharing)"
                value={postalAddress}
                onChange={e => setPostalAddress(e.target.value)}
              />
            </div>
          </section>

          {/* Email addresses */}
          <section style={styles.section}>
            <div style={styles.sectionHeader}>
              <span style={styles.sectionTitle}>Email addresses</span>
              <button style={styles.addBtn} onClick={addEmail}>+ Add email</button>
            </div>
            {emails.map((e, i) => (
              <div key={i} className="pf-row" style={styles.fieldRow}>
                <input
                  style={{ ...styles.input, maxWidth: 180 }}
                  placeholder="Label (e.g. Work)"
                  value={e.label}
                  onChange={ev => updateEmail(i, 'label', ev.target.value)}
                />
                <input
                  style={styles.input}
                  placeholder="Email address"
                  value={e.value}
                  onChange={ev => updateEmail(i, 'value', ev.target.value)}
                />
                <button style={styles.removeBtn} onClick={() => removeEmail(i)}>✕</button>
              </div>
            ))}
            {emails.length === 0 && <div style={styles.empty}>No emails — click + Add email</div>}
          </section>

          {/* Social / links */}
          <section style={styles.section}>
            <div style={styles.sectionHeader}>
              <span style={styles.sectionTitle}>Social / links</span>
              <button style={styles.addBtn} onClick={addSocial}>+ Add link</button>
            </div>
            {socialLinks.map((s, i) => (
              <div key={i} className="pf-row" style={styles.fieldRow}>
                <input
                  style={{ ...styles.input, maxWidth: 180 }}
                  placeholder="Label (e.g. LinkedIn)"
                  value={s.label}
                  onChange={e => updateSocial(i, 'label', e.target.value)}
                />
                <input
                  style={styles.input}
                  placeholder="URL"
                  value={s.url}
                  onChange={e => updateSocial(i, 'url', e.target.value)}
                />
                <button style={styles.removeBtn} onClick={() => removeSocial(i)}>✕</button>
              </div>
            ))}
            {socialLinks.length === 0 && <div style={styles.empty}>No links added</div>}
          </section>

          {/* Bio */}
          <section style={styles.section}>
            <div style={styles.sectionHeader}>
              <span style={styles.sectionTitle}>Short bio</span>
            </div>
            <textarea
              style={{ ...styles.input, height: 100, resize: 'vertical' }}
              placeholder="A sentence or two about yourself or your role (used when you say 'about me' in a meeting)"
              value={bio}
              onChange={e => setBio(e.target.value)}
              maxLength={500}
            />
          </section>

          {/* Common items */}
          <section style={styles.section}>
            <div style={styles.sectionHeader}>
              <span style={styles.sectionTitle}>Common things I share</span>
              <button style={styles.addBtn} onClick={addItem}>+ Add item</button>
            </div>
            <p style={styles.sectionHint}>
              Anything you regularly paste in meetings: Calendly link, deck URL, pricing page, etc.
            </p>
            {commonItems.map((c, i) => (
              <div key={i} className="pf-row" style={styles.fieldRow}>
                <input
                  style={{ ...styles.input, maxWidth: 220 }}
                  placeholder="Label (e.g. Book a call)"
                  value={c.label}
                  onChange={e => updateItem(i, 'label', e.target.value)}
                />
                <input
                  style={styles.input}
                  placeholder="Value or URL"
                  value={c.value}
                  onChange={e => updateItem(i, 'value', e.target.value)}
                />
                <button style={styles.removeBtn} onClick={() => removeItem(i)}>✕</button>
              </div>
            ))}
            {commonItems.length === 0 && <div style={styles.empty}>No items — click + Add item</div>}
          </section>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 8 }}>
            <button
              style={{ ...styles.saveBtn, background: saving ? '#374151' : '#2AB49F' }}
              onClick={save}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save profile'}
            </button>
            {saved && <span style={{ color: '#34d399', fontSize: 13 }}>Saved ✓</span>}
          </div>
        </div>
      </div>
    </>
  );
}

const styles = {
  root: {
    minHeight: '100vh',
    background: '#0f1115',
    color: '#e6e8eb',
    fontFamily: '"Segoe UI",system-ui,-apple-system,sans-serif',
    maxWidth: 800,
    margin: '0 auto',
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  header: { display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 },
  brand: { fontSize: 18, fontWeight: 600 },
  navLink: { fontSize: 11, color: '#9aa0a6', textDecoration: 'none' },
  headerRight: { flex: 1, minWidth: 280 },
  title: { fontSize: 22, fontWeight: 700, margin: '0 0 4px' },
  subtitle: { fontSize: 13, color: '#9aa0a6', margin: 0, lineHeight: 1.5 },
  errorBox: {
    background: '#2d1010', border: '1px solid #7f1d1d',
    borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#fca5a5',
  },
  infoBox: {
    background: '#0c1f33', border: '1px solid #1e3a5f',
    borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#93c5fd', lineHeight: 1.5,
  },
  form: { display: 'flex', flexDirection: 'column', gap: 24 },
  section: {
    background: '#171a21', border: '1px solid #2a2f37',
    borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10,
  },
  sectionHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sectionTitle: { fontSize: 14, fontWeight: 600, color: '#e6e8eb' },
  sectionHint: { fontSize: 12, color: '#6b7280', margin: 0 },
  addBtn: {
    border: '1px solid #2a2f37', borderRadius: 6, background: '#1a1d24',
    color: '#9aa0a6', padding: '4px 10px', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap',
  },
  removeBtn: {
    border: 'none', borderRadius: 6, background: '#2d1010',
    color: '#f87171', padding: '4px 8px', fontSize: 12, cursor: 'pointer', flexShrink: 0,
  },
  fieldRow: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  label: { fontSize: 12, color: '#9aa0a6', minWidth: 120, flexShrink: 0 },
  input: {
    background: '#1a1d24', border: '1px solid #2a2f37', color: '#e6e8eb',
    borderRadius: 6, padding: '7px 10px', fontSize: 13, flex: 1, minWidth: 0, outline: 'none',
    fontFamily: 'inherit',
  },
  empty: { fontSize: 12, color: '#6b7280', fontStyle: 'italic' },
  saveBtn: {
    border: 'none', borderRadius: 8, padding: '9px 24px',
    fontSize: 14, fontWeight: 600, color: '#fff', cursor: 'pointer',
  },
};
