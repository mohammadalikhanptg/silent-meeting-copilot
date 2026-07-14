'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { PRODUCT_NAME } from '../lib/brand';
import ThemeToggle from './ThemeToggle';

const I = {
  home: (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 8.5L9 2l7 6.5V16a1 1 0 01-1 1H3a1 1 0 01-1-1V8.5z"/>
      <path d="M6.5 17V11h5v6"/>
    </svg>
  ),
  live: (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="9" r="3" fill="currentColor" strokeWidth="0"/>
      <circle cx="9" cy="9" r="6.5"/>
    </svg>
  ),
  insights: (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 14l4-4 3 2.5 3-6 4 4"/>
      <path d="M14 8V5h-3"/>
    </svg>
  ),
  library: (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="14" height="3" rx="1"/>
      <rect x="2" y="8" width="14" height="3" rx="1"/>
      <rect x="2" y="13" width="8" height="3" rx="1"/>
    </svg>
  ),
  radar: (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="9" r="1.6" fill="currentColor" strokeWidth="0"/>
      <path d="M9 9L14 4"/>
      <path d="M13.6 9A4.6 4.6 0 119 4.4"/>
      <path d="M16.5 9A7.5 7.5 0 119 1.5"/>
    </svg>
  ),
  commitments: (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 5l1.5 1.5L7 4"/>
      <path d="M3 11l1.5 1.5L7 10"/>
      <path d="M9.5 5.5H15"/>
      <path d="M9.5 11.5H15"/>
    </svg>
  ),
  briefings: (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 2h7l3 3v11a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z"/>
      <path d="M11 2v3h3"/>
      <path d="M6 9h6M6 12h4"/>
    </svg>
  ),
  interview: (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="6" r="3"/>
      <path d="M3.5 16c.7-3 2.9-4.5 5.5-4.5S13.8 13 14.5 16"/>
    </svg>
  ),
  bot: (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="12" height="9" rx="2"/>
      <path d="M9 6V3M7 3h4"/>
      <circle cx="6.5" cy="10" r="0.9" fill="currentColor" strokeWidth="0"/>
      <circle cx="11.5" cy="10" r="0.9" fill="currentColor" strokeWidth="0"/>
      <path d="M7 12.8h4"/>
    </svg>
  ),
  translation: (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="9" r="7"/>
      <path d="M2 9h14"/>
      <path d="M9 2c2.2 2 3.2 4.4 3.2 7S11.2 14 9 16c-2.2-2-3.2-4.4-3.2-7S6.8 4 9 2z"/>
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="9" r="2.5"/>
      <path d="M9 1v2M9 15v2M1 9h2M15 9h2M3.22 3.22l1.41 1.41M13.36 13.36l1.41 1.41M3.22 14.78l1.41-1.41M13.36 4.64l1.41-1.41"/>
    </svg>
  ),
  billing: (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="4" width="15" height="10.5" rx="1.5"/>
      <path d="M1.5 8h15"/>
      <path d="M5 12h2M10 12h3"/>
    </svg>
  ),
};

const GROUPS = [
  {
    label: 'Workspace',
    items: [
      { href: '/home', label: 'Home', exact: true, icon: I.home },
      { href: '/session', label: 'Live session', icon: I.live },
      { href: '/meetings', label: 'Library', icon: I.library },
      { href: '/insights', label: 'Insights', icon: I.insights },
    ],
  },
  {
    label: 'Coaching',
    items: [
      { href: '/radar', label: 'Expectation Radar', icon: I.radar, badge: 'Soon' },
      { href: '/commitments', label: 'Commitments', icon: I.commitments, badge: 'Soon' },
      { href: '/briefings', label: 'Briefings', icon: I.briefings, badge: 'Soon' },
      { href: '/interview', label: 'Interview Mode', icon: I.interview, badge: 'Soon' },
    ],
  },
  {
    label: 'Meeting bot',
    items: [
      { href: '/bot', label: 'Zoom Bot', icon: I.bot, badge: 'Beta' },
      { href: '/translation', label: 'Live Translation', icon: I.translation, badge: 'Soon' },
    ],
  },
  {
    label: 'Account',
    items: [
      { href: '/profile', label: 'Settings', icon: I.settings },
      { href: '/billing', label: 'Billing', icon: I.billing },
    ],
  },
];

const BOTTOM_FIVE = [
  GROUPS[0].items[0],
  GROUPS[0].items[1],
  GROUPS[0].items[2],
  GROUPS[0].items[3],
  GROUPS[3].items[0],
];

function isActive(pathname, item) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + '/');
}

export default function AppShell({ children }) {
  const pathname = usePathname();

  return (
    <div className="shell-layout">
      {/* Sidebar — desktop */}
      <nav className="shell-nav" aria-label="Primary navigation">
        <div className="shell-brand">
          <div className="shell-logo" aria-hidden="true">◐</div>
          <span className="shell-name">{PRODUCT_NAME}</span>
        </div>

        <div style={{ flex: 1, padding: '6px 8px 10px' }}>
          {GROUPS.map(group => (
            <div key={group.label} style={{ marginBottom: 10 }}>
              <div style={{
                fontSize: 9.5, fontWeight: 700, letterSpacing: '0.09em',
                textTransform: 'uppercase', color: 'var(--tx-3)',
                opacity: 0.75, padding: '8px 11px 4px',
              }}>
                {group.label}
              </div>
              <ul className="shell-nav-items" role="list" style={{ padding: 0, flex: 'none' }}>
                {group.items.map(item => {
                  const active = isActive(pathname, item);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`shell-nav-item${active ? ' active' : ''}`}
                        aria-current={active ? 'page' : undefined}
                      >
                        <span className="shell-nav-icon" aria-hidden="true">{item.icon}</span>
                        <span className="shell-nav-label">{item.label}</span>
                        {item.badge && (
                          <span className="shell-nav-badge">{item.badge}</span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        {/* Theme toggle — desktop sidebar footer */}
        <div className="shell-nav-footer">
          <ThemeToggle className="theme-toggle" title="Toggle theme" />
        </div>
      </nav>

      {/* Main content */}
      <main className="shell-main">
        {children}
      </main>

      {/* Bottom nav — mobile */}
      <nav className="shell-bottom-nav" aria-label="Mobile navigation">
        {BOTTOM_FIVE.map(item => {
          const active = isActive(pathname, item);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`shell-bottom-item${active ? ' active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              {item.icon}
              <span className="shell-bottom-label">{item.label}</span>
            </Link>
          );
        })}
        {/* Theme toggle — mobile bottom nav */}
        <ThemeToggle className="shell-bottom-item shell-bottom-theme" title="Toggle theme" />
      </nav>
    </div>
  );
}
