import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Envelope } from "@medusajs/icons"
import { Alert, Button, Container, Heading, Text } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { sdk } from "../../lib/restaurant-api"

type CustomerEmailChangeNotice = {
  customer_id: string
  old_email: string
  new_email: string
  language: "da" | "en"
}

type NoticeResponse = { notices: CustomerEmailChangeNotice[] }

const CustomerEmailChangeNoticesPage = () => {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data, isLoading, error } = useQuery({
    queryKey: ["customer-email-change-notices"],
    queryFn: () =>
      sdk.client.fetch<NoticeResponse>("/admin/customer-email-change-notices"),
  })
  const retry = useMutation({
    mutationFn: (customerId: string) =>
      sdk.client.fetch<{ delivered: boolean }>(
        `/admin/customer-email-change-notices/${customerId}/retry`,
        { method: "POST", body: {} },
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["customer-email-change-notices"],
      }),
  })

  if (isLoading)
    return (
      <Text role="status">{t("customer_email_change_notices.loading")}</Text>
    )
  if (error || !data)
    return (
      <Alert variant="error">
        {t("customer_email_change_notices.load_error")}
      </Alert>
    )

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading>{t("customer_email_change_notices.title")}</Heading>
        <Text className="text-ui-fg-subtle">
          {t("customer_email_change_notices.description")}
        </Text>
      </div>
      {data.notices.length === 0 ? (
        <Text className="px-6 py-8">
          {t("customer_email_change_notices.empty")}
        </Text>
      ) : (
        data.notices.map((notice) => (
          <div
            className="flex items-center justify-between gap-4 px-6 py-4"
            key={notice.customer_id}
          >
            <div>
              <Text>
                {notice.old_email} → {notice.new_email}
              </Text>
              <Text className="text-ui-fg-subtle">
                {t("customer_email_change_notices.customer", {
                  id: notice.customer_id,
                })}{" "}
                · {notice.language.toUpperCase()}
              </Text>
            </div>
            <Button
              size="small"
              onClick={() => retry.mutate(notice.customer_id)}
              isLoading={
                retry.isPending && retry.variables === notice.customer_id
              }
            >
              {t("customer_email_change_notices.retry")}
            </Button>
          </div>
        ))
      )}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Email-change notices",
  icon: Envelope,
})

export default CustomerEmailChangeNoticesPage
