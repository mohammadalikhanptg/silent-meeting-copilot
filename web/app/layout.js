import './globals.css'

export const metadata = {
  title: 'Silent Meeting Copilot',
  description: 'Silent live conversation assistant'
}

export default function RootLayout ({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}