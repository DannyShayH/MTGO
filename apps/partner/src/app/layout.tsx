import type { Metadata } from "next"
import { getMessages } from "@lib/i18n"
import "./globals.css"

export async function generateMetadata(): Promise<Metadata> {
  const { messages } = await getMessages()
  return { title: messages.text.app_name, robots: { index: false } }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { locale } = await getMessages()
  return (
    <html lang={locale}>
      <body className="bg-ui-bg-subtle text-ui-fg-base antialiased">
        {children}
      </body>
    </html>
  )
}
