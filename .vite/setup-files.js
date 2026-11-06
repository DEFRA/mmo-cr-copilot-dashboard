import { vi } from 'vitest'
import createFetchMock from 'vitest-fetch-mock'

import { config } from '#/config/config.js'

const fetchMock = createFetchMock(vi)

fetchMock.enableMocks()
global.fetch = fetchMock

vi.mock('ioredis')

// Tests sign in through the explicit dev bypass unless a file turns it off.
config.set('auth.devBypass', true)
