// Engine behaviour probes for adlc-flightdeck design decisions.
//
// Minimal fixtures, one behaviour each, selected by the `mode` atom. The
// `/probe <id>` command sets the mode (p1..p10, or `off`), so every fixture can
// also be driven by hand in a live session for the probes the test kit
// cannot exercise (key routing, real placement, real dialogs).
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { ProbeMeasure } from '../types'

const mode = atom({ plugin: 'flightdeck-engine-probes', key: 'mode' } as const, null)
const presses = atom({ plugin: 'flightdeck-engine-probes', key: 'presses' } as const, [])
const bandOffset = atom({ plugin: 'flightdeck-engine-probes', key: 'bandOffset' } as const, 0)
const viewedMarks = atom({ plugin: 'flightdeck-engine-probes', key: 'viewedMarks' } as const, 0)
const p5Open = atom({ plugin: 'flightdeck-engine-probes', key: 'p5Open' } as const, null)
const p8Submits = atom({ plugin: 'flightdeck-engine-probes', key: 'p8Submits' } as const, [])
const p8Inputs = atom({ plugin: 'flightdeck-engine-probes', key: 'p8Inputs' } as const, [])
const measure = atom({ plugin: 'flightdeck-engine-probes', key: 'measure' } as const, null)
const p10Offset = atom({ plugin: 'flightdeck-engine-probes', key: 'p10Offset' } as const, 0)
const p10Scrolls = atom({ plugin: 'flightdeck-engine-probes', key: 'p10Scrolls' } as const, [])

// P2/P3: a band tree of TALL_ROWS rows, the decision row last.
const TALL_ROWS = 30
const P5_PANE = 'p5'

// P10: a body of P10_LINES lines in a Box P10_BODY rows tall, which the mod
// scrolls itself, with three option rows under it. Pinned = the options stay
// on screen while the body's lines move.
const P10_LINES = 30
const P10_BODY = 6
const P10_OPTIONS = [
  { key: 'opt-approve', hotkey: 'y', label: 'Approve' },
  { key: 'opt-revise', hotkey: 'r', label: 'Revise' },
  { key: 'opt-halt', hotkey: 'h', label: 'Halt' },
] as const

// P4: what the unawaited write settled to, drawn on the next render. A module
// variable on purpose: the probe is about a write the state host may refuse.
let p4Unawaited = 'pending'

const log = (list: readonly string[], item: string) => [...list, item].slice(-50)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'probe',
      description: 'Select an engine probe fixture (p1..p10, off)',
      argumentHint: '<p1..p10|off>',
    })

    return next(e)
  })

  on('command.run', { command: 'probe' }, async ($, e) => {
    const id = (e.args ?? '').trim() || 'off'

    // Live checks: show every atom in a pane the person asked for.
    if (id === 'readout') {
      const opened = await $.ui.open({ id: 'readout', title: 'Probe readout' })
      return { text: `readout pane: ${JSON.stringify(opened)}` }
    }

    await update($, mode, () => (id === 'off' ? null : id))
    await update($, bandOffset, () => 0)
    await update($, p10Offset, () => 0)

    if (id === 'p5') {
      const opened = await $.ui.open({ id: P5_PANE, title: 'P5 placement probe' })
      await update($, p5Open, () => JSON.stringify(opened))
    }

    return { text: `probe mode: ${id}` }
  })

  // P9: what session.measure carries, snapshotted for the band to draw.
  on('session.measure', async ($, e, next) => {
    const context = e.context as Record<string, unknown>
    const snapshot: ProbeMeasure = {
      percent: typeof e.context.percent === 'number' ? e.context.percent : null,
      tokens: typeof e.context.tokens === 'number' ? e.context.tokens : null,
      window: typeof e.context.window === 'number' ? e.context.window : null,
      keys: Object.keys(context).sort(),
      changed: [...e.changed],
    }
    await update($, measure, () => snapshot)

    return next(e)
  })

  // P2: the band owns its own scroll while mode is p2. P10: every scroll that
  // reaches the band is logged, and moves the body's own offset, not the band.
  on('ui.scroll', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, mode)

    if (current === 'p10') {
      const seen = `by=${e.by} body=${e.bodyRows} content=${e.contentRows} origin=${e.origin.kind} pointer=${e.pointer === undefined ? '-' : JSON.stringify(e.pointer)}`
      await update($, p10Scrolls, list => log(list, seen))
      await update($, p10Offset, n => Math.min(P10_LINES - P10_BODY, Math.max(0, (n ?? 0) + e.by)))

      return {}
    }

    if (current !== 'p2') {
      return next(e)
    }

    const last = Math.max(0, TALL_ROWS - e.bodyRows)
    await update($, bandOffset, n => Math.min(last, Math.max(0, (n ?? 0) + e.by)))

    return {}
  })

  // P6: a first band hook that wraps whatever the rest of the chain draws.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, mode)

    if (current !== 'p6' && current !== 'p6-pass') {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const beneath = await next(e)

    return (
      <Box flexDirection="column">
        <Text>probes-outer</Text>
        {beneath}
      </Box>
    )
  })

  // The main band fixture.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, mode)

    if (current === null || e.props.hasSurvey) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    // Each press is recorded and announced, so a live check can see what fired.
    const press = (name: string) => async () => {
      await update($, presses, list => log(list, name))
      void $.ui.toast(`probe pressed: ${name}`)
    }

    if (current === 'p1') {
      return (
        <Box flexDirection="row" gap={1}>
          <Button key="digit" hotkey="1" plain label="Digit one" onPress={press('digit')} />
          <Button key="letter" hotkey="a" plain label="Letter a" onPress={press('letter')} />
        </Box>
      )
    }

    if (current === 'p2' || current === 'p3') {
      const rows = Array.from({ length: TALL_ROWS - 1 }, (_, i) => `row ${i}`)
      const decision = (
        <Box key="decision" flexDirection="row" gap={1}>
          <Button key="decide-y" hotkey="y" label="Approve" onPress={press('decide-y')} />
          <Button key="decide-9" hotkey="9" label="Nine" onPress={press('decide-9')} />
        </Box>
      )

      if (current === 'p3') {
        // Engine-owned window: the whole tree, decision row last.
        return (
          <Box flexDirection="column">
            {rows.map(text => (
              <Text>{text}</Text>
            ))}
            {decision}
          </Box>
        )
      }

      // P2: the mod's own window of scroll.bodyRows rows from its own offset.
      const offset = await read($, bandOffset)
      const height = Math.max(1, e.props.scroll.bodyRows)
      const all = [...rows.map(text => <Text>{text}</Text>), decision]

      return (
        <Box flexDirection="column">
          <Text dimColor>
            window {offset}..{offset + height - 1} of {TALL_ROWS} (engine offset{' '}
            {e.props.scroll.offset}, maxRows {e.props.maxRows})
          </Text>
          {all.slice(offset, offset + height)}
        </Box>
      )
    }

    if (current === 'p10') {
      // A fixed-height body that draws its own slice, then the options.
      const offset = await read($, p10Offset)
      const scrolls = await read($, p10Scrolls)
      const lines = Array.from({ length: P10_LINES }, (_, i) => `line ${String(i + 1).padStart(2, '0')}`)

      return (
        <Box flexDirection="column">
          <Text dimColor>
            p10 body {offset + 1}..{offset + P10_BODY} of {P10_LINES} · scrolls seen {scrolls.length} · engine offset{' '}
            {e.props.scroll.offset} · maxRows {e.props.maxRows}
          </Text>
          <Box key="p10-body" flexDirection="column" height={P10_BODY} overflow="hidden">
            {lines.slice(offset, offset + P10_BODY).map(text => (
              <Text>{text}</Text>
            ))}
          </Box>
          {P10_OPTIONS.map(option => (
            <Box key={`row-${option.key}`} flexDirection="row">
              <Button key={option.key} hotkey={option.hotkey} label={option.label} onPress={press(option.key)} />
            </Box>
          ))}
        </Box>
      )
    }

    if (current === 'p4-timer') {
      // The write deferred to a clock timer the render schedules.
      void $.clock.after(0, () => {
        void update($, viewedMarks, n => (n ?? 0) + 1).then(
          () => {
            p4Unawaited = 'timer write resolved'
          },
          error => {
            p4Unawaited = `timer write rejected: ${String(error)}`
          },
        )
      })

      return <Text>p4-timer render drew; previous: {p4Unawaited}</Text>
    }

    if (current === 'p4' || current === 'p4-await') {
      let refusal = 'none'

      if (current === 'p4') {
        // Starts inside the render, settles after it.
        const previous = p4Unawaited
        p4Unawaited = 'pending'
        void update($, viewedMarks, n => (n ?? 0) + 1).then(
          () => {
            p4Unawaited = 'resolved'
          },
          error => {
            p4Unawaited = `rejected: ${String(error)}`
          },
        )

        return <Text>p4 render drew; previous unawaited write: {previous}</Text>
      } else {
        try {
          await update($, viewedMarks, n => (n ?? 0) + 1)
        } catch (error) {
          refusal = String(error)
        }
      }

      return <Text>p4 render drew; awaited refusal: {refusal}</Text>
    }

    if (current === 'p6') {
      return <Text>probes-inner</Text>
    }

    if (current === 'p6-pass') {
      return next(e)
    }

    if (current === 'p7') {
      return (
        <Box flexDirection="row" gap={1}>
          <Button
            key="submit"
            label="Approve via submit"
            onPress={async () => {
              await update($, presses, list => log(list, 'submit:start'))
              try {
                const result = await $.prompt.submit({ text: 'probe-approve', asUser: true })
                await update($, presses, list => log(list, `submit:resolved ${JSON.stringify(result)}`))
                void $.ui.toast(`probe submit resolved: ${JSON.stringify(result)}`)
              } catch (error) {
                await update($, presses, list => log(list, `submit:rejected ${String(error)}`))
              }
            }}
          />
        </Box>
      )
    }

    if (current === 'p8') {
      const { Input } = $.ui.resolve(e)

      return (
        <Input
          key="explain"
          rows={3}
          label="Explain back"
          onInput={(value: string) => update($, p8Inputs, list => log(list, value))}
          onSubmit={async (value: string) => {
            await update($, p8Submits, list => log(list, `${e.surface}:${JSON.stringify(value)}`))
            void $.ui.toast(`probe submitted: ${JSON.stringify(value)}`)
          }}
        />
      )
    }

    if (current === 'p9') {
      const snap = await read($, measure)

      return (
        <Text>
          ctx {snap === null ? 'no-measure' : snap.percent === null ? 'percent-null' : `${snap.percent}%`}
        </Text>
      )
    }

    return next(e)
  })

  // Readout: a Pane instance the tests mount to read the atoms (the test's
  // engine `$` has no state noun). Drawn as one Text per atom, `key=json`.
  on('ui.render', { component: 'Pane', requestId: 'readout' }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const values: [string, unknown][] = [
      ['mode', await read($, mode)],
      ['presses', await read($, presses)],
      ['bandOffset', await read($, bandOffset)],
      ['viewedMarks', await read($, viewedMarks)],
      ['p5Open', await read($, p5Open)],
      ['p8Submits', await read($, p8Submits)],
      ['p8Inputs', await read($, p8Inputs)],
      ['measure', await read($, measure)],
      ['p10Offset', await read($, p10Offset)],
      ['p10Scrolls', await read($, p10Scrolls)],
    ]

    return (
      <Box flexDirection="column">
        {values.map(([name, value]) => (
          <Text>
            {name}={JSON.stringify(value ?? null)}
          </Text>
        ))}
      </Box>
    )
  })

  // P5: the pane reports its placement; a guard closes it when docked.
  on('ui.render', { component: 'Pane', requestId: P5_PANE }, async ($, e) => {
    const { Text } = $.ui.resolve(e)

    if (e.props.placement === 'dock') {
      void $.ui.close({ id: P5_PANE })
      void $.ui.toast(
        `probe p5: placement=dock (fullscreen=${String(e.viewport?.isFullscreen)}, cols=${String(e.viewport?.columns)}) -> closed`,
      )
    }

    return (
      <Text>
        p5 placement={e.props.placement} fullscreen={String(e.viewport?.isFullscreen)} cols=
        {String(e.viewport?.columns)}
      </Text>
    )
  })
}
