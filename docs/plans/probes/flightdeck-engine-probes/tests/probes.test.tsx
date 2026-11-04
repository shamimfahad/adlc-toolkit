// Engine behaviour probes P1..P9. Each test records what happened and prints
// one `P<n> VERDICT:` line; assertions are kept to what the probe needs to
// run at all, so an unexpected answer is printed rather than hidden.
import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const PLUGIN = 'flightdeck-engine-probes'
const BAND_ID = 'above-prompt'

/**
 * Reads one of the mod's atoms through its `readout` Pane: the test's engine
 * `$` has no state noun, so the mod draws them and the test reads the Text.
 */
async function stateOf($: Engine, key: string): Promise<unknown> {
  const ui = await $.ui.mount({
    plugin: PLUGIN,
    surface: 'terminal',
    component: 'Pane',
    requestId: 'readout',
    props: {
      title: 'readout',
      isFocused: false,
      bodyColumns: 200,
      placement: 'inline',
      scroll: { offset: 0, bodyRows: 40 },
      view: {},
    },
  })
  const row = await ui.find({ type: 'Text', text: `${key}=` })
  await ui.unmount()
  const text = row?.text ?? ''
  const json = text.slice(text.indexOf('=') + 1)

  return json === '' ? undefined : JSON.parse(json)
}

function verdict(line: string) {
  console.log(line)
}

function describeError(error: unknown): string {
  return String(error instanceof Error ? error.message : error).split('\n')[0].slice(0, 200)
}

/** Session start + the /probe command registered, answered as the engine would. */
function world(on: On) {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))

  return mock.clock(on)
}

async function selectProbe($: Engine, id: string, presentation = { isFullscreen: false, columns: 120 }) {
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'probe', args: id, origin: { kind: 'composer' }, presentation } as never)
}

function band(maxRows = 10, offset = 0) {
  return {
    plugin: PLUGIN,
    component: 'AbovePrompt' as const,
    requestId: BAND_ID,
    viewport: { columns: 120, rows: 40, isFullscreen: false },
    props: {
      hasSurvey: false,
      isWorking: false,
      maxRows,
      bodyColumns: 115,
      scroll: { offset, bodyRows: maxRows - 1 },
      view: {},
    },
  }
}

async function texts(ui: { findAll: (q: { type?: string }) => Promise<{ text: string }[]> }) {
  return (await ui.findAll({ type: 'Text' })).map(t => t.text)
}

describe('P1 digit vs letter hotkey in an empty composer', () => {
  test('band buttons with hotkey "1" and "a"', async ($, on) => {
    world(on)
    await selectProbe($, 'p1')
    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })

    const buttons = await ui.findAll({ type: 'Button' })
    const hotkeys = buttons.map(b => `${b.key}=${String(b.props.hotkey)}`).join(',')
    expect(buttons).toHaveLength(2)

    // The kit's only key act reaches a Client's onKey; try it to record the fact.
    let keyAct = 'n/a'
    try {
      await (ui as unknown as { key: (e: { key: string }) => Promise<void> }).key({ key: '1' })
      keyAct = 'accepted'
    } catch (error) {
      keyAct = `rejected (${describeError(error)})`
    }

    await ui.press({ key: 'digit' })
    const pressed = (await stateOf($, 'presses')) as string[]

    verdict(`P1 FACT: band validates hotkeys [${hotkeys}]; ui.press({key:'digit'}) -> presses=${JSON.stringify(pressed)}; ui.key('1') ${keyAct}`)
    verdict(
      'P1 VERDICT: not testable in plugin test — the kit has no composer/prompt key routing (press is by element key, key() reaches only a Client) — check live with /probe p1; docs (Button.hotkey) say a bare digit in an EMPTY composer answers a band Button, a letter never reaches it from the composer',
    )
    await ui.unmount()
  })
})

describe('P2 a mod owning ui.scroll for the AbovePrompt band', () => {
  test('tall band, person wheel answered by the mod', async ($, on) => {
    world(on)
    await selectProbe($, 'p2')

    let mounted = 'ok'
    const ui = await $.ui.mount({ ...band(10), surface: 'terminal' }).catch(error => {
      mounted = `rejected: ${describeError(error)}`

      return undefined
    })

    if (ui === undefined) {
      verdict(`P2 VERDICT: tall band tree refused at mount (${mounted})`)

      return
    }

    const before = await texts(ui)
    const result = await $.ui.scroll({
      component: 'AbovePrompt',
      requestId: BAND_ID,
      offset: 5,
      by: 5,
      bodyRows: 9,
      contentRows: 31,
      origin: { kind: 'person' },
    })
    const offset = await stateOf($, 'bandOffset')
    const after = await texts(ui)

    // Engine's own window: a hook that passes. Leave p2 to see `next` answered.
    const decisionDrawn = (await ui.findAll({ type: 'Button' })).map(b => b.key).join(',')

    verdict(
      `P2 FACT: mount of a 31-row tree at maxRows=10 ${mounted}; before[0..1]=${JSON.stringify(before.slice(0, 2))}; $.ui.scroll(person, by 5) -> ${JSON.stringify(result)}; mod offset=${String(offset)}; after[0..1]=${JSON.stringify(after.slice(0, 2))}; after has ${after.length} Text, buttons=[${decisionDrawn}]`,
    )
    expect(offset).toBe(5)

    // Scroll to the end: the decision row enters the mod's own window.
    await $.ui.scroll({
      component: 'AbovePrompt',
      requestId: BAND_ID,
      offset: 31,
      by: 100,
      bodyRows: 9,
      contentRows: 31,
      origin: { kind: 'person' },
    })
    const endButtons = (await ui.findAll({ type: 'Button' })).map(b => b.key).join(',')
    const endOffset = await stateOf($, 'bandOffset')

    verdict(
      `P2 VERDICT: a mod CAN own ui.scroll for the band — answering without next returns ${JSON.stringify(result)}, its atom moves (offset ${String(offset)}, then ${String(endOffset)} at end) and its redraw draws its own slice (${JSON.stringify(after[1] ?? '')} first after scroll; buttons at end=[${endButtons}]); the kit does not paint, so whether the engine ALSO windows that tree with scroll.bodyRows (double-scroll) is check-live`,
    )
    await ui.unmount()
  })
})

describe('P3 letter hotkeys on buttons scrolled out of the band window', () => {
  test('decision row last, engine window at top', async ($, on) => {
    world(on)
    await selectProbe($, 'p3')
    const ui = await $.ui.mount({ ...band(10, 0), surface: 'terminal' })

    const count = (await texts(ui)).length
    const result = await ui.press({ key: 'decide-y' })
    const pressed = (await stateOf($, 'presses')) as string[]

    verdict(
      `P3 FACT: tree of ${count + 1} rows at maxRows=10 offset 0; ui.press({key:'decide-y'}) on an out-of-window Button -> ${JSON.stringify(result)} presses=${JSON.stringify(pressed)} (kit press is by key: it ignores the window)`,
    )
    verdict(
      'P3 VERDICT: not testable in plugin test — the kit presses by element key and models no band window or hotkey arming — check live with /probe p3 (focus band with ctrl+x tab, press y while row 29 is out of view); docs only state the window rule for a BARE DIGIT (AbovePrompt.maxRows remark), letters unspecified',
    )
    await ui.unmount()
  })
})

describe('P4 update() started inside ui.render', () => {
  test('unawaited update that settles after the render', async ($, on) => {
    const clock = world(on)
    await selectProbe($, 'p4')
    const before = await stateOf($, 'viewedMarks')
    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    await clock.settle()
    await clock.advance(1000)
    const after = await stateOf($, 'viewedMarks')
    // A second render draws how the first render's unawaited write settled.
    await ui.redraw()
    const drawn = await texts(ui)
    const outcome = drawn[0] ?? ''

    verdict(`P4 FACT: viewedMarks before=${String(before)} after render+settle+advance(1000)=${String(after)}; next render drew ${JSON.stringify(outcome)}`)
    verdict(
      `P4 VERDICT: unawaited update() started in ui.render -> ${after === undefined || after === 0 ? (outcome.includes('rejected') ? 'REFUSED (promise rejects with the render-purity denial; atom unchanged; silently lost unless the mod catches it)' : 'LOST (atom unchanged, no rejection seen)') : `LANDED (atom=${String(after)})`}`,
    )
    await ui.unmount()
  })

  test('write deferred to a $.clock.after timer scheduled by the render', async ($, on) => {
    const clock = world(on)
    await selectProbe($, 'p4-timer')
    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    await clock.advance(10)
    const after = await stateOf($, 'viewedMarks')
    const drawn = await texts(ui)

    verdict(`P4 FACT (timer): viewedMarks=${String(after)}; drawn=${JSON.stringify(drawn)}`)
    verdict(
      `P4 VERDICT (timer): a write deferred with $.clock.after from the render -> ${typeof after === 'number' && after > 0 ? `LANDS (atom=${after}); a render that also READS that atom would redraw and reschedule on every write, so it needs a guard` : 'refused/lost too'}`,
    )
    await ui.unmount()
  })

  test('awaited update inside the render', async ($, on) => {
    const clock = world(on)
    await selectProbe($, 'p4-await')
    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    await clock.settle()
    const after = await stateOf($, 'viewedMarks')
    const drawn = await texts(ui)

    verdict(`P4 FACT (awaited): viewedMarks=${String(after)}; drawn=${JSON.stringify(drawn)}`)
    verdict(
      `P4 VERDICT (awaited): update() awaited in ui.render -> ${after === undefined || after === 0 ? 'refused' : 'landed'}; refusal text drawn: ${JSON.stringify(drawn[0] ?? '')}`,
    )
    await ui.unmount()
  })
})

describe('P5 Pane placement and a dock guard', () => {
  test('placement reported, close-when-dock guard', async ($, on) => {
    world(on)
    const opens: unknown[] = []
    const closes: unknown[] = []
    on('ui.open', (_, e) => {
      opens.push(e)

      return { value: { isPlaced: true } }
    })
    on('ui.close', (_, e) => {
      closes.push(e)

      return { value: undefined } as never
    })
    await selectProbe($, 'p5', { isFullscreen: true, columns: 120 })
    const openResult = await stateOf($, 'p5Open')

    const pane = (placement: 'dock' | 'inline', isFullscreen: boolean) => ({
      plugin: PLUGIN,
      component: 'Pane' as const,
      requestId: 'p5',
      viewport: { columns: 120, rows: 40, isFullscreen },
      props: {
        title: 'P5',
        isFocused: false,
        bodyColumns: placement === 'dock' ? 50 : 116,
        placement,
        scroll: { offset: 0, bodyRows: 20 },
        view: {},
      },
    })

    const dock = await $.ui.mount({ ...pane('dock', true), surface: 'terminal' })
    const dockText = (await texts(dock))[0]
    const closesAfterDock = closes.length
    await dock.unmount()

    const inline = await $.ui.mount({ ...pane('inline', false), surface: 'terminal' })
    const inlineText = (await texts(inline))[0]
    const closesAfterInline = closes.length
    await inline.unmount()

    verdict(
      `P5 FACT: $.ui.open result recorded=${String(openResult)} (the test stub's answer; isPlaced only, no placement field); dock render=${JSON.stringify(dockText)} closes=${closesAfterDock} ${JSON.stringify(closes[0] ?? null)}; inline render=${JSON.stringify(inlineText)} closes=${closesAfterInline}`,
    )
    verdict(
      `P5 VERDICT: placement is only on Pane render props (UiOpenResult has isPlaced/reason, no placement); which value fullscreen@120 vs main screen gives is the surface's — not testable (kit takes props from the test), check live with /probe p5; guard calling $.ui.close from the render when placement==='dock' ${closesAfterDock === 1 && closesAfterInline === 1 ? 'WORKS (ui.close raised once, origin plugin, not on inline)' : `observed closes dock=${closesAfterDock} inline=${closesAfterInline}`}`,
    )
  })
})

describe('P6 two band contributors composing via await next(e)', () => {
  test('two hooks in the same module', async ($, on) => {
    world(on)
    await selectProbe($, 'p6')
    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    const drawn = await texts(ui)

    verdict(`P6 FACT (same module): drawn=${JSON.stringify(drawn)}`)
    verdict(
      `P6 VERDICT (same module): ${drawn.includes('probes-outer') && drawn.includes('probes-inner') ? 'COMPOSES — outer hook embedding await next(e) as a child draws both' : 'does not compose'}`,
    )
    await ui.unmount()
  })

  test(
    'a second plugin (inline fixture) drawing the band',
    {
      plugins: [
        {
          name: 'other-band',
          register(on) {
            on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
              const { Box, Text } = $.ui.resolve(e)
              const beneath = await next(e)

              return (
                <Box flexDirection="column">
                  <Text>other-band</Text>
                  {beneath}
                </Box>
              )
            })
          },
        },
      ],
    },
    async ($, on) => {
      world(on)
      // The test's own ui.render hook stands for the engine's band drawing.
      on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
        const { Text } = $.ui.resolve(e)

        return <Text>engine-band</Text>
      })
      await selectProbe($, 'p6-pass')
      const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
      const drawn = await texts(ui)

      verdict(`P6 FACT (two plugins, both wrap next): drawn=${JSON.stringify(drawn)}`)
      const both = drawn.includes('other-band') && drawn.includes('probes-outer')
      verdict(
        `P6 VERDICT (two plugins): inline second plugin is POSSIBLE in the kit; ${both ? `COMPOSES — order top-down ${JSON.stringify(drawn)}` : `does not compose: ${JSON.stringify(drawn)}`}`,
      )
      await ui.unmount()
    },
  )

  test(
    'a second plugin that draws without next',
    {
      plugins: [
        {
          name: 'greedy-band',
          register(on) {
            on('ui.render', { component: 'AbovePrompt' }, async ($, e) => {
              const { Text } = $.ui.resolve(e)

              return <Text>greedy-band</Text>
            })
          },
        },
      ],
    },
    async ($, on) => {
      world(on)
      await selectProbe($, 'p6-pass')
      const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
      const drawn = await texts(ui)

      verdict(`P6 FACT (greedy second plugin): drawn=${JSON.stringify(drawn)}`)
      verdict(
        `P6 VERDICT (greedy): a contributor that does not call next ${drawn.includes('probes-outer') && drawn.includes('greedy-band') ? 'is wrapped by ours (ours sits above it in the chain)' : drawn.includes('greedy-band') ? 'hides ours (it sits above)' : 'is never reached'}; drawn=${JSON.stringify(drawn)}`,
      )
      await ui.unmount()
    },
  )
})

describe('P7 $.prompt.submit from a band press during an open question dialog', () => {
  test('submit while AskUserQuestion is pending', async ($, on) => {
    const clock = world(on)
    const events: string[] = []
    on('prompt.submit', (_, e) => {
      events.push(`prompt.submit bottom: ${JSON.stringify({ text: e.text, origin: e.origin })}`)

      return { text: e.text }
    })
    on('tool.call', { tool: 'AskUserQuestion' } as never, async () => {
      events.push('ask: open')
      await clock.sleep(5000)
      events.push('ask: answered')

      return { result: { answers: {} } } as never
    })

    await selectProbe($, 'p7')
    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })

    let askState = 'pending'
    const ask = $.tool
      .call({
        tool: 'AskUserQuestion',
        questions: [
          {
            question: 'Gate?',
            header: 'Gate',
            multiSelect: false,
            options: [
              { label: 'Approve', description: 'go' },
              { label: 'Reject', description: 'stop' },
            ],
          },
        ],
      } as never)
      .then(
        r => {
          askState = `resolved ${JSON.stringify(r).slice(0, 80)}`
        },
        error => {
          askState = `rejected ${describeError(error)}`
        },
      )
    await clock.settle()

    // Press while the dialog is held open on the mocked clock.
    const pressing = ui.press({ key: 'submit' })
    let pressSettled = false
    void pressing.then(() => {
      pressSettled = true
    })
    await clock.settle()
    events.push(`press settled before ask answered: ${pressSettled}`)
    await clock.advance(6000)
    await pressing
    await ask

    const presses = (await stateOf($, 'presses')) as string[]
    verdict(`P7 FACT: events=${JSON.stringify(events)} presses=${JSON.stringify(presses)} ask=${askState}`)
    verdict(
      'P7 VERDICT: not testable in plugin test — nothing sits beneath the test\'s prompt.submit hook, so the engine\'s idle queue, the dialog and the composer draft are not modelled (the kit delivers the submit to the bottom at once, as recorded) — check live with /probe p7; docs: $.prompt.submit queues "a turn of its own, once the session is idle" and resolves as that turn starts',
    )
    await ui.unmount()
  })
})

describe('P8 Input rows=3: Enter vs Shift+Enter and what reaches onSubmit', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    test(`multi-line submit on ${surface}`, async ($, on) => {
      world(on)
      await selectProbe($, 'p8')
      const ui = await $.ui.mount({ ...band(), surface })
      const field = await ui.find({ type: 'Input' })
      const text = 'line one\nline two  '

      await ui.input({ key: 'explain', text: 'line one\n', kind: 'change' })
      await ui.input({ key: 'explain', text })
      const submits = (await stateOf($, 'p8Submits')) as string[]
      const inputs = (await stateOf($, 'p8Inputs')) as string[]

      verdict(
        `P8 FACT (${surface}): Input drawn rows=${String(field?.props.rows)}; onInput saw ${JSON.stringify(inputs)}; onSubmit saw ${JSON.stringify(submits)}`,
      )
      verdict(
        `P8 VERDICT (${surface}): onSubmit receives the text whole (newlines kept, not trimmed: ${submits.at(-1)?.endsWith(JSON.stringify(text)) ? 'confirmed' : 'NOT confirmed'}); which physical key (Enter vs Shift+Enter) submits vs types a newline is not testable in plugin test — kit input() is a semantic submit/change — check live; docs: "Enter submits; a newline is typed as in the prompt box"`,
      )
      await ui.unmount()
    })
  }
})

describe('P9 context percent on session.measure, and after /compact', () => {
  test('measure before and after a compaction', async ($, on) => {
    world(on)
    mock.session(on)
    await selectProbe($, 'p9')
    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    const initial = await texts(ui)

    await $.session.measure({
      context: { tokens: 50_000, window: 200_000, percent: 25 },
      rateLimits: [],
      changed: ['context'],
    } as never)
    const live = await texts(ui)
    const liveSnap = await stateOf($, 'measure')

    // A compacted session: the live window has no response yet, so the engine
    // leaves tokens and percent out (SessionContextUsage doc).
    await $.session.measure({
      context: { window: 200_000 },
      rateLimits: [],
      changed: ['context'],
    } as never)
    const compacted = await texts(ui)
    const compactedSnap = await stateOf($, 'measure')

    verdict(
      `P9 FACT: initial=${JSON.stringify(initial)} live=${JSON.stringify(live)} snapshot=${JSON.stringify(liveSnap)}; after-compact=${JSON.stringify(compacted)} snapshot=${JSON.stringify(compactedSnap)}`,
    )
    verdict(
      `P9 VERDICT: session.measure carries context.percent (0-100 integer) beside tokens/window; with percent absent (post-/compact shape per type docs) the hook sees keys ${JSON.stringify((compactedSnap as { keys?: string[] } | null)?.keys)} and the band draws ${JSON.stringify(compacted[0] ?? '')}; the kit replays the shape the test gives — that the engine raises measure with percent absent right after /compact is from the type docs (inferred), check live`,
    )
    await ui.unmount()
  })
})
