import {
  Alert,
  Button,
  Container,
  FocusModal,
  Heading,
  Input,
  Label,
  StatusBadge,
  Text,
  toast,
  usePrompt,
} from "@medusajs/ui"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { FormEvent, ReactNode, useState } from "react"
import {
  RestaurantDetail,
  RestaurantDetailResponse,
  StaffInvitationResponse,
  StaffMember,
  restaurantMessages,
  sdk,
} from "../lib/restaurant-api"

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  })

/** The operator sends the link themselves while the MVP has no email service. */
const copyInviteLink = async (link: string) => {
  try {
    await navigator.clipboard.writeText(link)
    toast.success("Invite link copied")
  } catch {
    toast.error(
      "Could not copy the invite link. Allow clipboard access and try again.",
    )
  }
}

const messageFor = (error: Error, fallback: string) =>
  restaurantMessages[error.message] || fallback

const useInvitationChange = (restaurantId: string) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      path,
      method,
      body,
    }: {
      path: string
      method: "POST" | "DELETE"
      body?: Record<string, string>
    }) =>
      sdk.client.fetch<StaffInvitationResponse | RestaurantDetailResponse>(
        `/admin/restaurants/${restaurantId}/staff-invitations${path}`,
        { method, body },
      ),
    onSuccess: async (response) => {
      queryClient.setQueryData(["restaurant", restaurantId], {
        restaurant: response.restaurant,
      })
      await queryClient.invalidateQueries({ queryKey: ["restaurants"] })
    },
  })
}

const InviteStaffModal = ({
  restaurantId,
  onClose,
}: {
  restaurantId: string
  onClose: () => void
}) => {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  const invite = useInvitationChange(restaurantId)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim() || !email.trim()) {
      setError("Name and email are required.")
      return
    }
    setError("")
    invite.mutate(
      { path: "", method: "POST", body: { name, email } },
      {
        onSuccess: () => {
          toast.success("Invitation created. Copy the invite link to send it.")
          onClose()
        },
        onError: (failure) =>
          setError(
            messageFor(
              failure,
              "Could not invite. Check both fields and try again.",
            ),
          ),
      },
    )
  }
  return (
    <FocusModal
      open
      onOpenChange={(open) => {
        if (!open && !invite.isPending) onClose()
      }}
    >
      <FocusModal.Content>
        <FocusModal.Header>
          <FocusModal.Title>Invite staff</FocusModal.Title>
        </FocusModal.Header>
        <FocusModal.Body className="overflow-auto">
          <form
            onSubmit={submit}
            className="mx-auto flex w-full max-w-lg flex-col gap-6 p-6"
          >
            <Text className="text-ui-fg-subtle">
              The person gets a one-time invite link to the partner app, valid
              for 24 hours. You send the link yourself.
            </Text>
            <div className="flex flex-col gap-2">
              <Label htmlFor="staff-name">Staff name</Label>
              <Input
                id="staff-name"
                required
                maxLength={255}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="staff-email">Staff email</Label>
              <Input
                id="staff-email"
                type="email"
                required
                maxLength={255}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            {error && <Alert variant="error">{error}</Alert>}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={invite.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" isLoading={invite.isPending}>
                Invite
              </Button>
            </div>
          </form>
        </FocusModal.Body>
      </FocusModal.Content>
    </FocusModal>
  )
}

const StaffGroup = ({
  label,
  empty,
  staff,
  children,
}: {
  label: string
  empty: string
  staff: StaffMember[]
  children: (member: StaffMember) => ReactNode
}) => (
  <div className="flex flex-col gap-2 px-6 py-4">
    <Text size="small" weight="plus" leading="compact">
      {label}
    </Text>
    {staff.length ? (
      <ul aria-label={label} className="flex flex-col gap-3">
        {staff.map((member) => (
          <li
            key={member.id}
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <Text weight="plus" className="break-words">
                {member.name}
              </Text>
              <Text size="small" className="text-ui-fg-subtle break-all">
                {member.email}
              </Text>
            </div>
            {children(member)}
          </li>
        ))}
      </ul>
    ) : (
      <Text size="small" className="text-ui-fg-subtle">
        {empty}
      </Text>
    )}
  </div>
)

const PendingActions = ({
  restaurantId,
  member,
}: {
  restaurantId: string
  member: StaffMember
}) => {
  const change = useInvitationChange(restaurantId)
  const prompt = usePrompt()
  const invitation = member.invitation
  if (!invitation) return null
  const isExpired = new Date(invitation.expires_at).getTime() <= Date.now()
  const failed = (failure: Error) =>
    toast.error(
      messageFor(failure, "Could not change the invitation. Try again."),
    )
  const resend = () =>
    change.mutate(
      { path: `/${member.id}/resend`, method: "POST" },
      {
        onSuccess: () =>
          toast.success(
            "New invite link created. The previous link no longer works.",
          ),
        onError: failed,
      },
    )
  const cancel = async () => {
    const isConfirmed = await prompt({
      title: `Cancel the invitation for ${member.name}?`,
      description: "The invite link stops working at once.",
      confirmText: "Cancel invitation",
      cancelText: "Keep",
    })
    if (isConfirmed)
      change.mutate(
        { path: `/${member.id}`, method: "DELETE" },
        {
          onSuccess: () => toast.success("Invitation cancelled"),
          onError: failed,
        },
      )
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusBadge color={isExpired ? "red" : "orange"}>
        {isExpired ? "Expired" : "Pending"}
      </StatusBadge>
      <Text size="small" className="text-ui-fg-subtle">
        {isExpired ? "Expired" : "Expires"}{" "}
        {formatDateTime(invitation.expires_at)}
      </Text>
      <Button
        size="small"
        variant="secondary"
        disabled={change.isPending || isExpired}
        aria-label={`Copy invite link for ${member.name}`}
        onClick={() => copyInviteLink(invitation.invite_link)}
      >
        Copy invite link
      </Button>
      <Button
        size="small"
        variant="secondary"
        isLoading={change.isPending}
        aria-label={`Resend invitation for ${member.name}`}
        onClick={resend}
      >
        Resend
      </Button>
      <Button
        size="small"
        variant="transparent"
        disabled={change.isPending}
        aria-label={`Cancel invitation for ${member.name}`}
        onClick={cancel}
      >
        Cancel
      </Button>
    </div>
  )
}

export const StaffSection = ({
  restaurant,
}: {
  restaurant: RestaurantDetail
}) => {
  const [inviting, setInviting] = useState(false)
  const { pending, authorized, former } = restaurant.staff
  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading level="h2">Staff</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Only people MTOGO invites can operate the Restaurant.
          </Text>
        </div>
        <Button size="small" onClick={() => setInviting(true)}>
          Invite
        </Button>
      </div>
      <StaffGroup
        label="Pending invitations"
        empty="No pending invitations."
        staff={pending}
      >
        {(member) => (
          <PendingActions restaurantId={restaurant.id} member={member} />
        )}
      </StaffGroup>
      <StaffGroup
        label="Authorized staff"
        empty="No authorized staff yet."
        staff={authorized}
      >
        {(member) => (
          <Text size="small" className="text-ui-fg-subtle">
            {member.accepted_at
              ? `Authorized ${formatDateTime(member.accepted_at)}`
              : "Authorized"}
          </Text>
        )}
      </StaffGroup>
      <StaffGroup label="Former staff" empty="No former staff." staff={former}>
        {(member) => (
          <Text size="small" className="text-ui-fg-subtle">
            {member.revoked_at
              ? `Access revoked ${formatDateTime(member.revoked_at)}`
              : "Access revoked"}
          </Text>
        )}
      </StaffGroup>
      {inviting && (
        <InviteStaffModal
          restaurantId={restaurant.id}
          onClose={() => setInviting(false)}
        />
      )}
    </Container>
  )
}
