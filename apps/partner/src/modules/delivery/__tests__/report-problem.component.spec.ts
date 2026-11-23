import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { describe, it } from "node:test"
import { createElement, type ComponentType } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { build } from "esbuild"
import { DELIVERY_AGENT_TEXT } from "@dtc/i18n"

const require = createRequire(import.meta.url)
const source = new URL("../report-problem.tsx", import.meta.url).pathname
const bundle = await build({
  entryPoints: [source],
  bundle: true,
  platform: "node",
  format: "cjs",
  write: false,
  external: ["react", "react/jsx-runtime"],
  plugins: [
    {
      name: "component-boundaries",
      setup(build) {
        build.onResolve({ filter: /^@lib\/data\/delivery-agent$/ }, () => ({
          path: "@lib/data/delivery-agent",
          external: true,
        }))
        build.onResolve({ filter: /^@medusajs\/ui$/ }, () => ({
          path: "ui",
          namespace: "test",
        }))
        build.onLoad({ filter: /.*/, namespace: "test" }, () => ({
          contents:
            "import React from 'react'; export const Button = (props) => React.createElement('button', { disabled: props.disabled }, props.children); export const Alert = (props) => React.createElement('div', null, props.children)",
          loader: "js",
        }))
      },
    },
  ],
})
type Components = typeof import("../report-problem")
type ProblemFormProps = Parameters<Components["ProblemReportForm"]>[0]
type ReportProblemProps = Parameters<Components["ReportProblem"]>[0]
type StatusProps = Parameters<Components["ProblemReportStatus"]>[0]
const compiled = {
  exports: {} as {
    ProblemReportForm: ComponentType<ProblemFormProps>
    ReportProblem: ComponentType<ReportProblemProps>
    ProblemReportStatus: ComponentType<StatusProps>
  },
}
new Function("require", "module", "exports", bundle.outputFiles[0].text)(
  (id: string) =>
    id === "@lib/data/delivery-agent"
      ? {
          reportDeliveryProblem: () => {
            throw Error("not called during rendering")
          },
        }
      : require(id),
  compiled,
  compiled.exports,
)
const ProblemReportForm = compiled.exports.ProblemReportForm
const ReportProblem = compiled.exports.ReportProblem
const ProblemReportStatus = compiled.exports.ProblemReportStatus

type InteractiveElement = {
  props: {
    children?: unknown
    onClick?: () => void
    onSubmit?: (event: { preventDefault: () => void }) => Promise<void>
    pending?: boolean
    outcome?: string
  }
}

function interactiveReportProblem(action: () => Promise<unknown>) {
  const slots: unknown[] = []
  let cursor = 0
  const fakeReact = {
    ...require("react"),
    useState(initial: unknown) {
      const index = cursor++
      if (!(index in slots)) slots[index] = initial
      return [
        slots[index],
        (next: unknown) => {
          slots[index] =
            typeof next === "function"
              ? (next as (value: unknown) => unknown)(slots[index])
              : next
        },
      ]
    },
    useRef(initial: unknown) {
      const index = cursor++
      if (!(index in slots)) slots[index] = { current: initial }
      return slots[index]
    },
    useEffect() {},
  }
  const interactiveCompiled = { exports: {} as typeof compiled.exports }
  new Function("require", "module", "exports", bundle.outputFiles[0].text)(
    (id: string) =>
      id === "react"
        ? fakeReact
        : id === "@lib/data/delivery-agent"
          ? { reportDeliveryProblem: action }
          : require(id),
    interactiveCompiled,
    interactiveCompiled.exports,
  )
  return {
    render(props: ReportProblemProps) {
      cursor = 0
      return (
        interactiveCompiled.exports.ReportProblem as (
          props: ReportProblemProps,
        ) => InteractiveElement
      )(props)
    },
  }
}

function children(element: InteractiveElement): InteractiveElement[] {
  return Array.isArray(element.props.children)
    ? element.props.children
    : [element.props.children as InteractiveElement]
}

describe("ProblemReportForm", () => {
  for (const locale of ["da", "en"] as const) {
    it(`renders a bounded, labeled phone form with every category in ${locale}`, () => {
      const markup = renderToStaticMarkup(
        createElement(ProblemReportForm, {
          locale,
          copy: DELIVERY_AGENT_TEXT[locale],
          category: "food_missing_or_wrong",
          note: "A".repeat(280),
          pending: false,
          onCategory() {},
          onNote() {},
          onSubmit() {},
        }),
      )
      assert.match(markup, /<select[^>]*id="problem-category"/)
      assert.match(markup, /<textarea[^>]*maxLength="280"/)
      assert.match(markup, /280\/280/)
      assert.equal((markup.match(/<option /g) ?? []).length, 4)
      assert.ok(markup.includes(DELIVERY_AGENT_TEXT[locale].problemCategory))
      assert.ok(markup.includes(DELIVERY_AGENT_TEXT[locale].sendProblem))
      assert.match(markup, /aria-describedby="problem-note-hint"/)
    })
  }
})

describe("ReportProblem", () => {
  for (const locale of ["da", "en"] as const) {
    it(`shows the action on active work and hides it without work in ${locale}`, () => {
      const copy = DELIVERY_AGENT_TEXT[locale]
      assert.equal(
        renderToStaticMarkup(
          createElement(ReportProblem, { orderId: null, locale, copy }),
        ),
        "",
      )
      const active = renderToStaticMarkup(
        createElement(ReportProblem, { orderId: "order_active", locale, copy }),
      )
      assert.match(active, /<button/)
      assert.ok(active.includes(copy.reportProblem))
    })

    it(`distinguishes the first report from a repeat in ${locale}`, () => {
      const copy = DELIVERY_AGENT_TEXT[locale]
      const report = {
        id: "datt_1",
        order_id: "order_1",
        category: "food_missing_or_wrong" as const,
        note: null,
        reported_by: "dagt_1",
        reported_at: "2026-11-23T12:00:00.000Z",
      }
      const first = renderToStaticMarkup(
        createElement(ProblemReportStatus, {
          outcome: "reported",
          report,
          locale,
          copy,
        }),
      )
      assert.ok(first.includes(copy.problemReported))
      assert.ok(!first.includes(copy.problemAlreadyReported))
      const repeat = renderToStaticMarkup(
        createElement(ProblemReportStatus, {
          outcome: "already_reported",
          report,
          locale,
          copy,
        }),
      )
      assert.ok(repeat.includes(copy.problemAlreadyReported))
      assert.ok(
        repeat.includes(
          locale === "da"
            ? "Maden mangler eller er forkert"
            : "Food missing or wrong",
        ),
      )
    })
  }

  it("allows one in-flight submit and retries an uncertain first report", async () => {
    const firstReport = {
      id: "datt_first",
      order_id: "order_1",
      category: "food_missing_or_wrong" as const,
      note: null,
      reported_by: "dagt_1",
      reported_at: "2026-11-23T12:00:00.000Z",
    }
    let finishFirst: (result: { status: "uncertain" }) => void = () => {}
    const firstResponse = new Promise<{ status: "uncertain" }>((resolve) => {
      finishFirst = resolve
    })
    let calls = 0
    const component = interactiveReportProblem(() => {
      calls += 1
      return calls === 1
        ? firstResponse
        : Promise.resolve({ status: "already_reported", report: firstReport })
    })
    const props = {
      orderId: "order_1",
      locale: "en" as const,
      copy: DELIVERY_AGENT_TEXT.en,
    }
    const closed = component.render(props)
    children(closed)[0].props.onClick?.()
    const open = component.render(props)
    const submit = children(open)[2].props.onSubmit
    assert.ok(submit)
    const event = { preventDefault() {} }
    const firstTap = submit(event)
    const secondTap = submit(event)
    assert.equal(calls, 1)
    assert.equal(children(component.render(props))[2].props.pending, true)
    finishFirst({ status: "uncertain" })
    await Promise.all([firstTap, secondTap])
    const retry = component.render(props)
    assert.equal(children(children(retry)[1])[0].props.outcome, "uncertain")
    await children(retry)[2].props.onSubmit?.(event)
    assert.equal(calls, 2)
    const repeated = component.render(props)
    assert.equal(
      children(children(repeated)[1])[0].props.outcome,
      "already_reported",
    )
    assert.equal(children(repeated)[2], false)
  })
})
