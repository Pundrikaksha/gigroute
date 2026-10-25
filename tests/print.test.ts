import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const css = readFileSync('app/globals.css', 'utf8')
const print = css.slice(css.indexOf('@media print'))

describe('print layout', () => {
  test('headings stay with the following content and stop cards break individually', () => {
    expect(print).toMatch(/h1,\s*h2,\s*h3,\s*h4,\s*h5,\s*h6\s*\{[^}]*break-after:\s*avoid/)
    expect(print).toMatch(/\.gr-stops-lead\s*\{[^}]*break-inside:\s*avoid/)
    expect(print).toMatch(/\.gr-stop\s*\{[^}]*break-inside:\s*avoid/)
    expect(print).toMatch(/\.gr-stops\s*\{[^}]*break-inside:\s*auto/)
    expect(print).not.toMatch(/article,\s*li\s*\{[^}]*break-inside:\s*avoid/)
  })

  test('interactive controls are hidden', () => {
    expect(print).toMatch(/button,\s*input,\s*select,\s*textarea\s*\{[^}]*display:\s*none\s*!important/)
  })
})
