import { downloadCsv, escapeCsvCell, toCsv } from './csv.js'

describe('#escapeCsvCell', () => {
  test('Should leave plain text and numbers unchanged', () => {
    expect(escapeCsvCell('mmo-cr-pdf')).toBe('mmo-cr-pdf')
    expect(escapeCsvCell(42.5)).toBe('42.5')
  })

  test('Should keep negative numbers numeric', () => {
    expect(escapeCsvCell(-3)).toBe('-3')
  })

  test('Should write nothing for a missing value', () => {
    expect(escapeCsvCell(null)).toBe('')
    expect(escapeCsvCell(undefined)).toBe('')
  })

  test('Should quote commas, quotes and line breaks', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"')
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""')
    expect(escapeCsvCell('line\nbreak')).toBe('"line\nbreak"')
  })

  test.each(['=SUM(A1)', '+1', '-1+2', '@cmd', '\tx', '\rx'])(
    'Should neutralise the formula %j',
    (value) => {
      expect(escapeCsvCell(value).replace(/^"/, '')).toMatch(/^'/)
    }
  )

  test('Should neutralise and quote a formula containing a comma', () => {
    expect(escapeCsvCell('=HYPERLINK("x",1)')).toBe('"\'=HYPERLINK(""x"",1)"')
  })
})

describe('#toCsv', () => {
  test('Should join headers and rows with CRLF', () => {
    expect(
      toCsv(
        ['Repository', 'PRs'],
        [
          ['pdf', 3],
          ['api, v2', 1]
        ]
      )
    ).toBe('Repository,PRs\r\npdf,3\r\n"api, v2",1')
  })
})

describe('#downloadCsv', () => {
  test('Should download a Blob and release its URL', () => {
    URL.createObjectURL = vi.fn(() => 'blob:csv')
    URL.revokeObjectURL = vi.fn()
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function () {
        expect(this.download).toBe('figure-1.csv')
        expect(this.getAttribute('href')).toBe('blob:csv')
      })

    downloadCsv('figure-1.csv', 'a,b')

    expect(URL.createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob)
    expect(click).toHaveBeenCalledOnce()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:csv')
    expect(document.querySelector('a[download]')).toBeNull()
    click.mockRestore()
  })
})
