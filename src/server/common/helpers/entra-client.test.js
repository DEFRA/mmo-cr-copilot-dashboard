import { config } from '#/config/config.js'
import {
  EntraTokenError,
  endSessionUrl,
  entraSettings,
  exchangeCode,
  refreshTokens,
  requestedScopes
} from './entra-client.js'

const settings = {
  tenantId: 'tenant',
  clientId: 'client',
  clientSecret: 'secret',
  redirectUri: 'https://app.example/auth/callback',
  backendClientId: 'backend-id',
  backendScope: 'access_as_user',
  postLogoutRedirectUri: 'https://app.example/',
  timeoutMs: 1000
}

const bodyOf = () =>
  Object.fromEntries(new URLSearchParams(fetchMock.mock.calls[0][1].body))

describe('#entra-client', () => {
  test('Should build the backend scope from a client id or an App ID URI', () => {
    expect(requestedScopes(settings)).toBe(
      'openid profile email offline_access api://backend-id/access_as_user'
    )
    expect(
      requestedScopes({ ...settings, backendClientId: 'api://backend-id' })
    ).toContain('api://backend-id/access_as_user')
  })

  test('Should read the settings from config', () => {
    config.set('auth.entraTenantId', 'from-config')
    expect(entraSettings().tenantId).toBe('from-config')
    config.set('auth.entraTenantId', '')
  })

  describe('exchangeCode', () => {
    test('Should send the code, verifier, redirect uri and scope', async () => {
      fetchMock.mockResponse(
        JSON.stringify({
          id_token: 'id',
          access_token: 'at',
          refresh_token: 'rt',
          expires_in: 3600
        })
      )

      const tokens = await exchangeCode(settings, {
        code: 'abc',
        codeVerifier: 'verifier'
      })

      expect(bodyOf()).toMatchObject({
        grant_type: 'authorization_code',
        code: 'abc',
        code_verifier: 'verifier',
        redirect_uri: settings.redirectUri,
        scope: requestedScopes(settings)
      })
      expect(tokens).toMatchObject({
        idToken: 'id',
        accessToken: 'at',
        refreshToken: 'rt'
      })
      expect(tokens.expiresAt).toBeGreaterThan(Date.now())
    })

    test('Should report missing tokens as null rather than inventing them', async () => {
      fetchMock.mockResponse(JSON.stringify({ id_token: 'id' }))

      const tokens = await exchangeCode(settings, {
        code: 'a',
        codeVerifier: 'v'
      })

      expect(tokens).toMatchObject({
        accessToken: null,
        refreshToken: null,
        expiresAt: null
      })
    })

    test('Should refuse a response without an id token', async () => {
      fetchMock.mockResponse(JSON.stringify({ access_token: 'at' }))

      await expect(
        exchangeCode(settings, { code: 'a', codeVerifier: 'v' })
      ).rejects.toMatchObject({ kind: 'reauth' })
    })
  })

  describe('refreshTokens', () => {
    test('Should send the refresh grant and keep the old refresh token when none rotates', async () => {
      fetchMock.mockResponse(
        JSON.stringify({ access_token: 'new', expires_in: 3600 })
      )

      const tokens = await refreshTokens(settings, 'old-rt')

      expect(bodyOf()).toMatchObject({
        grant_type: 'refresh_token',
        refresh_token: 'old-rt',
        client_id: 'client',
        scope: requestedScopes(settings)
      })
      expect(tokens).toMatchObject({
        accessToken: 'new',
        refreshToken: 'old-rt'
      })
    })

    test('Should take a rotated refresh token', async () => {
      fetchMock.mockResponse(
        JSON.stringify({ access_token: 'new', refresh_token: 'rotated' })
      )

      const tokens = await refreshTokens(settings, 'old-rt')

      expect(tokens.refreshToken).toBe('rotated')
      expect(tokens.expiresAt).toBeNull()
    })

    test.each([
      ['invalid_grant', 400, 'reauth'],
      ['interaction_required', 400, 'reauth'],
      ['invalid_client', 401, 'config'],
      ['unauthorized_client', 400, 'config'],
      ['temporarily_unavailable', 400, 'transient'],
      [undefined, 503, 'transient']
    ])('Should map %s (%s) to %s', async (error, status, kind) => {
      fetchMock.mockResponse(JSON.stringify(error ? { error } : {}), { status })

      await expect(refreshTokens(settings, 'rt')).rejects.toMatchObject({
        kind,
        oauthError: error ?? null
      })
    })

    test('Should treat a network failure or timeout as transient', async () => {
      fetchMock.mockReject(new Error('timeout'))

      await expect(refreshTokens(settings, 'rt')).rejects.toBeInstanceOf(
        EntraTokenError
      )
      await expect(refreshTokens(settings, 'rt')).rejects.toMatchObject({
        kind: 'transient'
      })
    })

    test('Should not leak a token or response body into the error', async () => {
      fetchMock.mockResponse(
        JSON.stringify({
          error: 'invalid_grant',
          error_description: 'secret-rt'
        }),
        { status: 400 }
      )

      const error = await refreshTokens(settings, 'secret-rt').catch((e) => e)

      expect(JSON.stringify(error)).not.toContain('secret-rt')
      expect(error.message).not.toContain('secret-rt')
    })

    test('Should treat a success without an access token as transient', async () => {
      fetchMock.mockResponse(JSON.stringify({}))

      await expect(refreshTokens(settings, 'rt')).rejects.toMatchObject({
        kind: 'transient'
      })
    })
  })

  test('Should encode the post-logout redirect in the end-session URL', () => {
    const url = new URL(endSessionUrl(settings))

    expect(url.pathname).toBe('/tenant/oauth2/v2.0/logout')
    expect(url.searchParams.get('post_logout_redirect_uri')).toBe(
      'https://app.example/'
    )
    expect(url.search).toContain('post_logout_redirect_uri=https%3A%2F%2F')
  })
})
