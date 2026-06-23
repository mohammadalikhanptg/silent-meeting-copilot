'use client'
import { useState, useEffect } from 'react'

export default function ThemeToggle({ className = 'theme-toggle', title }) {
  const [theme, setTheme] = useState('dark')

  useEffect(() => {
    const t = document.documentElement.getAttribute('data-theme') || 'dark'
    setTheme(t)
  }, [])

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    if (next === 'light') {
      document.documentElement.setAttribute('data-theme', 'light')
    } else {
      document.documentElement.removeAttribute('data-theme')
    }
    try {
      localStorage.setItem('smc-theme', next)
      document.cookie = `smc_theme=${next};path=/;max-age=31536000;SameSite=Strict`
    } catch (_) {}
  }

  return (
    <button
      onClick={toggle}
      className={className}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      title={title || (theme === 'dark' ? 'Light theme' : 'Dark theme')}
    >
      {theme === 'dark' ? '☀' : '🌙'}
    </button>
  )
}
