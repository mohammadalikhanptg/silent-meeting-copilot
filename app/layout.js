import { Inter, Bricolage_Grotesque } from 'next/font/google'
import { headers } from 'next/headers'
import './globals.css'
import './calm-overrides.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  weight: ['400', '500', '600', '700', '800'],
})

export const metadata = {
  title: 'Silent Meeting Copilot',
  description: 'Silent live conversation assistant',
}

// Inline script: reads cookie or localStorage before first paint — no flash
const THEME_SCRIPT = `(function(){try{var c=document.cookie.match(/smc_theme=([^;]+)/);var t=c?c[1]:localStorage.getItem('smc-theme');if(t==='light')document.documentElement.setAttribute('data-theme','light');}catch(e){}})()`

export default async function RootLayout({ children }) {
  // CSP nonce minted per request in middleware; applied to the only inline script.
  const nonce = (await headers()).get('x-nonce') || undefined
  return (
    <html lang="en" className={`${inter.variable} ${bricolage.variable}`}>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
