'use client';

import { useState, useEffect, useRef } from 'react';

const GUIDE_PROMPT = `I need your help writing an "about me" document I can paste into an AI meeting copilot as my always-on coaching context.

Please ask me about each of the following one section at a time, then produce a clean Markdown document with all my answers:

1. **Who I am** — my name, job title, and seniority
2. **My company / companies** — what they do, size, industry, and website
3. **My expertise** — key skills, technical areas, and knowledge domains
4. **Communication style** — how I typically present myself in meetings (concise vs detail-heavy, formal vs conversational, etc.)
5. **Typical meetings** — the kinds of meetings I usually run or attend (sales calls, client reviews, technical deep-dives, board updates, etc.)
6. **My goals in meetings** — what I'm usually trying to achieve (close a deal, get alignment, gather information, build trust, etc.)
7. **How I like to be coached** — what kind of real-time guidance is most useful to me (flag open questions, suggest follow-ups, prompt me to share specific info, etc.)

Once you have all my answers, produce a clean Markdown document I can paste directly into my profile.`;

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [guideCopied, setGuideCopied] = useState(false);

  const [businesses, setBusinesses] = useState([]);
  const [postalAddress, setPostalAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [emails, setEmails] = useState([]);
  const [socialLinks, setSocialLinks] = useState([]);
  const [bio, setBio] = useState('');
  const [commonItems, setCommonItems] = useState([]);

  // P1: Profile dual-input — typed reference text + uploaded docs
  const [profileRefText, setProfileRefText] = useState('');
  const [profileDocs, setProfileDocs] = useState([]); // [{id, filename, size_bytes, added_at}]
  const [docUploading, setDocUploading] = useState(false);
  const [docError, setDocError] = useState('');
  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

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
          setProfileRefText(p.profile_reference_text || '');
          // Docs: map from content-bearing profile_docs to display metadata
          setProfileDocs((p.profile_docs || []).map(doc => ({
            id: doc.id,
            filename: doc.filename,
            size_bytes: doc.content_text ? new TextEncoder().encode(doc.content_text).length : 0,
            added_at: doc.added_at,
          })));
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
          profile_reference_text: profileRefText || null,
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

  // P2: Guide prompt copy
  const copyGuide = () => {
    navigator.clipboard.writeText(GUIDE_PROMPT).then(() => {
      setGuideCopied(true);
      setTimeout(() => setGuideCopied(false), 2000);
    });
  };

  // P1: File upload handler
  const uploadFile = async (file) => {
    setDocError('');
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.md') && !lower.endsWith('.txt')) {
      setDocError('Only .md and .txt files are accepted.');
      return;
    }
    setDocUploading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target.result;
      try {
        const res = await fetch('/api/profile-docs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, content }),
        });
        const data = await res.json();
        if (!res.ok) {
          setDocError(data.error || 'Upload failed.');
        } else {
          setProfileDocs(prev => [...prev, {
            id: data.doc.id,
            filename: data.doc.filename,
            size_bytes: new TextEncoder().encode(content).length,
            added_at: data.doc.added_at,
          }]);
        }
      } catch {
        setDocError('Upload failed — network error.');
      } finally {
        setDocUploading(false);
      }
    };
    reader.onerror = () => { setDocError('Failed to read file.'); setDocUploading(false); };
    reader.readAsText(file, 'utf-8');
  };

  const removeDoc = async (docId) => {
    setDocError('');
    try {
      const res = await fetch(`/api/profile-docs/${docId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Remove failed');
      setProfileDocs(prev => prev.filter(d => d.id !== docId));
    } catch {
      setDocError('Failed to remove document.');
    }
  };

  // Drag-and-drop handlers
  const onDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
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
      <style>{`
        * { box-sizing: border-box; }
        @media (max-width: 600px) { .pf-row { flex-direction: column !important; } }
        .pf-dropzone:focus { outline: 2px solid #38bdf8; }
      `}</style>
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

          {/* ---- P1/P2: Coaching context (dual-input) ---- */}
          <section style={{ ...styles.section, border: '1px solid #1e3a5f', background: '#0c1f33' }}>
            <div style={styles.sectionHeader}>
              <span style={{ ...styles.sectionTitle, color: '#93c5fd' }}>Coaching context (always-on)</span>
              <span style={{ fontSize: 11, color: '#6b7280' }}>fed to the AI coach in every session</span>
            </div>
            <p style={{ fontSize: 13, color: '#9aa0a6', margin: 0, lineHeight: 1.5 }}>
              Describe yourself here — who you are, your role, your companies, how you like to be coached.
              This is included automatically in every session as background context.
              You can type it directly, dictate it, or upload a Markdown / text file.
            </p>

            {/* P2: Guide prompt */}
            <div style={styles.guideBox}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#93c5fd', marginBottom: 6 }}>
                Generate your about-me with AI
              </div>
              <p style={{ fontSize: 12, color: '#9aa0a6', margin: '0 0 10px' }}>
                Copy the prompt below, paste it into ChatGPT or Claude, and answer the questions.
                Then paste the generated Markdown into the text box or upload it as a file.
              </p>
              <pre style={styles.guidePre}>{GUIDE_PROMPT}</pre>
              <button
                style={{ ...styles.copyBtn, background: guideCopied ? '#14532d' : '#1a2a3a', borderColor: guideCopied ? '#22c55e' : '#1e3a5f', color: guideCopied ? '#22c55e' : '#93c5fd' }}
                onClick={copyGuide}
              >
                {guideCopied ? '✓ Copied!' : 'Copy prompt'}
              </button>
            </div>

            {/* Typed / dictated text */}
            <div>
              <label style={{ fontSize: 12, color: '#9aa0a6', display: 'block', marginBottom: 4 }}>
                Type or paste your about-me context
              </label>
              <textarea
                style={{ ...styles.input, height: 140, resize: 'vertical', width: '100%' }}
                placeholder="I am Mohammad Ali Khan, director of Pacific Technology Group (pacific.london), a cybersecurity consultancy. I typically run advisory meetings with enterprise clients. Coach me to stay on track and surface relevant talking points…"
                value={profileRefText}
                onChange={e => setProfileRefText(e.target.value)}
                maxLength={2000}
              />
              <div style={{ fontSize: 11, color: '#6b7280', textAlign: 'right', marginTop: 2 }}>
                {profileRefText.length}/2000 chars
              </div>
            </div>

            {/* File upload zone */}
            <div>
              <label style={{ fontSize: 12, color: '#9aa0a6', display: 'block', marginBottom: 4 }}>
                Or upload a .md / .txt about-me document
              </label>
              <div
                ref={dropZoneRef}
                className="pf-dropzone"
                tabIndex={0}
                role="button"
                aria-label="Upload a .md or .txt file"
                style={{
                  ...styles.dropZone,
                  borderColor: dragOver ? '#38bdf8' : '#1e3a5f',
                  background: dragOver ? '#0d2035' : '#071525',
                }}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
              >
                <span style={{ fontSize: 13, color: '#4b6a8a' }}>
                  {docUploading
                    ? 'Uploading…'
                    : <><strong style={{ color: '#38bdf8' }}>Drag & drop</strong> a .md or .txt file here, or <strong style={{ color: '#38bdf8' }}>click to browse</strong></>
                  }
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".md,.txt"
                  style={{ display: 'none' }}
                  onChange={e => { if (e.target.files[0]) uploadFile(e.target.files[0]); e.target.value = ''; }}
                />
              </div>
              {docError && <div style={{ fontSize: 12, color: '#fca5a5', marginTop: 4 }}>{docError}</div>}
            </div>

            {/* Uploaded docs list */}
            {profileDocs.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>Uploaded profile documents:</div>
                {profileDocs.map(doc => (
                  <div key={doc.id} style={styles.docRow}>
                    <span style={{ fontSize: 13, color: '#e6e8eb', flex: 1 }}>{doc.filename}</span>
                    <span style={{ fontSize: 11, color: '#6b7280', marginRight: 8 }}>
                      {Math.ceil(doc.size_bytes / 1024)} KB
                    </span>
                    <button style={styles.removeBtn} onClick={() => removeDoc(doc.id)} title="Remove document">✕</button>
                  </div>
                ))}
              </div>
            )}
            {profileDocs.length === 0 && (
              <div style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic' }}>No profile documents uploaded</div>
            )}
          </section>

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
  guideBox: {
    background: '#071525', border: '1px solid #1e3a5f',
    borderRadius: 10, padding: 14,
  },
  guidePre: {
    background: '#0a1a2a', border: '1px solid #1e3a5f',
    borderRadius: 8, padding: '12px 14px',
    fontSize: 12, color: '#cbd5e1', lineHeight: 1.6,
    fontFamily: '"Fira Mono","Consolas","Courier New",monospace',
    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    margin: '0 0 10px',
  },
  copyBtn: {
    border: '1px solid', borderRadius: 6,
    padding: '5px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
    transition: 'background 0.15s',
  },
  dropZone: {
    border: '2px dashed', borderRadius: 10,
    padding: '20px 16px', textAlign: 'center',
    cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s',
    userSelect: 'none',
  },
  docRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: '#0a1a2a', border: '1px solid #1e3a5f',
    borderRadius: 6, padding: '5px 10px',
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
