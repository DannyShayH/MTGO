import { InformationCircleSolid } from "@medusajs/icons"
import { Drawer, IconButton, Text } from "@medusajs/ui"
import type { Definition } from "../lib/operations-definitions"

/**
 * How a section's figures are measured, behind an info button next to its
 * heading, so the cards keep short labels and the definitions stay one
 * click away. A Drawer, as Medusa Admin uses for longer side content; a
 * tooltip suits one short sentence only. The button names the section, so
 * a screen reader hears which definitions it opens.
 */
export function SectionDefinitions({
  title,
  description,
  definitions,
}: Readonly<{
  title: string
  description: string
  definitions: Definition[]
}>) {
  return (
    <Drawer>
      <Drawer.Trigger asChild>
        <IconButton
          size="small"
          variant="transparent"
          aria-label={`How ${title} is measured`}
          className="text-ui-fg-muted hover:text-ui-fg-subtle self-center"
        >
          <InformationCircleSolid />
        </IconButton>
      </Drawer.Trigger>
      <Drawer.Content>
        <Drawer.Header>
          <Drawer.Title>{title}</Drawer.Title>
          <Drawer.Description>{description}</Drawer.Description>
        </Drawer.Header>
        <Drawer.Body className="overflow-y-auto">
          <dl className="flex flex-col gap-y-5">
            {definitions.map(({ term, text }) => (
              <div key={term} className="flex flex-col gap-y-1">
                <dt>
                  <Text size="small" leading="compact" weight="plus">
                    {term}
                  </Text>
                </dt>
                <dd>
                  <Text size="small" className="text-ui-fg-subtle">
                    {text}
                  </Text>
                </dd>
              </div>
            ))}
          </dl>
        </Drawer.Body>
      </Drawer.Content>
    </Drawer>
  )
}
