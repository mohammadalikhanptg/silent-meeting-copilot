'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { PRODUCT_NAME } from '../lib/brand';
import ThemeToggle from './ThemeToggle';

const NAV = [
  {
    href: '/home',
    label: 'Home',
    exact: true,
    icon: (
      <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 8.5L9 2l7 6.5V16a1 1 0 01-1 1H3a1 1 0 01-1-1V8.5z"/>
        <path d="M6.5 17V11h5v6"/>
      </svg>
    ),
  },
  {
    href: '/session',
    label: 'Live',
    icon: (
      <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="9" r="3" fill="currentColor" strokeWidth="0"/>
        <circle cx="9" cy="9" r="6.5"/>
      </svg>
    ),
  },
  {
    href: '/insights',
    label: 'Insights',
    icon: (
      <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 14l4-4 3 2.5 3-6 4 4"/>
        <path d="M14 8V5h-3"/>
      </svg>
    ),
  },
  {
    href: '/meetings',
    label: 'Library',
    icon: (
      <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="14" height="3" rx="1"/>
        <rect x="2" y="8" width="14" height="3" rx="1"/>
        <rect x="2" y="13" width="8" height="3" rx="1"/>
      </svg>
    ),
  },
  {
    href: '/profile',
    label: 'Settings',
    icon: (
      <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="9" r="2.5"/>
        <path d="M9 1v2M9 15v2M1 9h2M15 9h2M3.22 3.22l1.41 1.41M13.36 13.36l1.41 1.41M3.22 14.78l1.41-1.41M13.36 4.64l1.41-1.41"/>
      </svg>
    ),
  },
  {
    href: '/billing',
    label: 'Billing',
    icon: (
      <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1.5" y="4" width="15" height="10.5" rx="1.5"/>
        <path d="M1.5 8h15"/>
        <path d="M5 12h2M10 12h3"/>
      </svg>
    ),
  },
];

const BOTTOM_NAV = NAV.filter(n => !n.badge).concat(NAV.filter(n => n.label === 'Insights').slice(0, 0));
const BOTTOM_FIVE = [NAV[0], NAV[1], NAV[3], NAV[4], NAV[2]];

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

        <ul className="shell-nav-items" role="list">
          {NAV.map(item => {
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
