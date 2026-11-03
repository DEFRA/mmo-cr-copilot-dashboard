import { render, screen } from '@testing-library/react'

import { Tag } from './Tag.jsx'

describe('#Tag', () => {
  test('Should carry its meaning in text', () => {
    render(<Tag>Merged</Tag>)

    const tag = screen.getByText('Merged')
    expect(tag.tagName).toBe('STRONG')
    expect(tag).toHaveClass('govuk-tag')
  })

  test('Should apply the colour modifier', () => {
    render(
      <Tag colour="green" className="app-extra">
        Passed
      </Tag>
    )

    expect(screen.getByText('Passed')).toHaveClass(
      'govuk-tag',
      'govuk-tag--green',
      'app-extra'
    )
  })
})
