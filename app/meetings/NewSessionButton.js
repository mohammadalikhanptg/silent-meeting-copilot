'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewSessionButton({ className, style }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: null, objective: null, language_mode: 'english', context_notes: null }),
      });
      if (!res.ok) throw new Error('Failed to create session');
      const data = await res.json();
      router.push(`/session?m=${data.id}`);
    } catch (_) {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={className || 'btn-new-session'}
      style={style}
    >
      {loading ? 'Creating…' : '+ New Session'}
    </button>
  );
}
