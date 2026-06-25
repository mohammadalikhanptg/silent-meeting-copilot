import { Inter } from 'next/font/google'
import './globals.css'
import './calm-overrides.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata = {
  title: 'Silent Meeting Copilot',
  description: 'Silent live conversation assistant',
}

// Inline script: reads cookie or localStorage before first paint — no flash
const THEME_SCRIPT = `(function(){try{var c=document.cookie.match(/smc_theme=([^;]+)/);var t=c?c[1]:localStorage.getItem('smc-theme');if(t==='light')document.documentElement.setAttribute('data-theme','light');}catch(e){}})()`

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
