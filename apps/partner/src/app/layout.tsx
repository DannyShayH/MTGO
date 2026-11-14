import { UnsavedChangesProvider } from "@modules/common/components/unsaved-changes"
import type { Metadata } from "next"
import { getMessages } from "@lib/i18n"
// Inter, self-hosted: Medusa UI's type classes name it, and no font request
// leaves for a third party.
import "@fontsource/inter/400.css"
import "@fontsource/inter/500.css"
import "@fontsource/inter/600.css"
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
        <UnsavedChangesProvider>{children}</UnsavedChangesProvider>
      </body>
    </html>
  )
}
