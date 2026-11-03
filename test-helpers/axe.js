import axe from 'axe-core'

/**
 * Runs axe against rendered markup and returns its violations. Colour contrast
 * is off because jsdom has no layout; contrast is tested from the tokens instead.
 */
export async function axeViolations(context) {
  const { violations } = await axe.run(context, {
    rules: { 'color-contrast': { enabled: false } }
  })

  return violations.map(({ id, nodes }) => ({
    id,
    targets: nodes.map((node) => node.target.join(' '))
  }))
}
