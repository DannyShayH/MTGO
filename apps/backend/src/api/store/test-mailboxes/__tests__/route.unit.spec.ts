import { GET } from "../route"

const originalEnvironment = {
  disposable: process.env.E2E_DISPOSABLE,
  key: process.env.TEST_MAILBOX_KEY,
}

afterEach(() => {
  if (originalEnvironment.disposable === undefined)
    delete process.env.E2E_DISPOSABLE
  else process.env.E2E_DISPOSABLE = originalEnvironment.disposable
  if (originalEnvironment.key === undefined) delete process.env.TEST_MAILBOX_KEY
  else process.env.TEST_MAILBOX_KEY = originalEnvironment.key
})

function request(email = "", key?: string) {
  return {
    query: { email },
    headers: key ? { "x-test-mailbox-key": key } : {},
    scope: {
      resolve: jest.fn().mockReturnValue({
        listNotifications: jest.fn().mockResolvedValue([
          {
            to: "customer@example.test",
            status: "sent",
            data: { verification_url: "https://example.test/verify" },
          },
        ]),
      }),
    },
  }
}

const response = () => ({ json: jest.fn().mockReturnThis() })

it.each([
  { disposable: "0", key: undefined, requestKey: undefined },
  { disposable: "1", key: undefined, requestKey: undefined },
  { disposable: "1", key: "expected", requestKey: "wrong" },
])(
  "rejects an unavailable mailbox",
  async ({ disposable, key, requestKey }) => {
    process.env.E2E_DISPOSABLE = disposable
    if (key) process.env.TEST_MAILBOX_KEY = key
    else delete process.env.TEST_MAILBOX_KEY

    await expect(
      GET(
        request("customer@example.test", requestKey) as never,
        response() as never,
      ),
    ).rejects.toThrow("Mailbox not found")
  },
)

it("requires a mailbox recipient", async () => {
  process.env.E2E_DISPOSABLE = "1"
  process.env.TEST_MAILBOX_KEY = "expected"

  await expect(
    GET(request("", "expected") as never, response() as never),
  ).rejects.toThrow("mailbox_recipient_required")
})

it("returns the newest verification messages", async () => {
  process.env.E2E_DISPOSABLE = "1"
  process.env.TEST_MAILBOX_KEY = "expected"
  const req = request(" Customer@Example.test ", "expected")
  const res = response()

  await GET(req as never, res as never)

  expect(req.scope.resolve).toHaveBeenCalled()
  expect(res.json).toHaveBeenCalledWith({
    messages: [
      {
        to: "customer@example.test",
        status: "sent",
        verification_url: "https://example.test/verify",
      },
    ],
  })
})
