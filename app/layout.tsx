import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { Version } from '@/components/version'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Date Booker',
  description: 'A simple date booker application',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>{children}</Providers>
        <Version />
      </body>
    </html>
  )
}
