import {
  CLIENT_ID,
  OAUTH_AUTHORIZE_URL,
  REDIRECT_URI,
  resolveApiServerUrl,
  SCOPES,
} from './constants';
import { KickApi, logKickOAuth } from './api';
import { RegenerateConfig } from './config';
import { authMessages } from './i18n';
import { mergeKickParams } from './params';
import { stopKickTracking } from './tracking';

const buildKickAuthUrl = (challenge: string, state: string) => {
  const query = new URLSearchParams();
  query.set('response_type', 'code');
  query.set('client_id', CLIENT_ID);
  query.set('redirect_uri', REDIRECT_URI);
  query.set('scope', SCOPES.join(' '));
  query.set('code_challenge', challenge);
  query.set('code_challenge_method', 'S256');
  query.set('state', state);
  return `${OAUTH_AUTHORIZE_URL}?${query.toString()}`;
};

const resolveKickUsername = (user: Awaited<ReturnType<typeof KickApi.GetMe>>) =>
  user?.username?.trim() || user?.name?.trim() || '';

events.On('kickLogin', async () => {
  const { verifier, challenge } = crypto.createPkce();
  const state = random.id() + random.id();

  await mergeKickParams({
    pkce_verifier: verifier,
    oauth_state: state,
  });

  api.openUrl(buildKickAuthUrl(challenge, state));
});

events.On('kickLogout', async () => {
  stopKickTracking();
  await mergeKickParams({
    access_token: '',
    refresh_token: '',
    token_expires_at: 0,
    pkce_verifier: '',
    oauth_state: '',
    kick_username: '',
  });
  RegenerateConfig();
});

network.endpoints.create('auth', 'GET', 'kickAuthCallback');

events.On('kickAuthCallback', async ({ query }) => {
  const error = typeof query.error === 'string' ? query.error : '';
  if (error) {
    return {
      redirect: ui.auth.generateFail(authMessages.authorizationFailed(error)),
    };
  }

  const code = typeof query.code === 'string' ? query.code : '';
  const state = typeof query.state === 'string' ? query.state : '';
  if (!code) {
    return {
      redirect: ui.auth.generateFail(authMessages.missingAuthorizationCode()),
    };
  }

  const params = await api.config.getParams<{
    api_server?: string;
    pkce_verifier?: string;
    oauth_state?: string;
  }>();

  const resolvedApiServer = resolveApiServerUrl(params.api_server);
  KickApi.setApiServer(resolvedApiServer);

  logKickOAuth('log', 'OAuth callback received', {
    hasCode: Boolean(code),
    codeLength: code.length,
    stateMatches: params.oauth_state === state,
    hasVerifier: Boolean(params.pkce_verifier?.trim()),
    configuredApiServer: params.api_server || null,
    resolvedApiServer,
  });

  if (!params.oauth_state || params.oauth_state !== state) {
    return {
      redirect: ui.auth.generateFail(authMessages.invalidOAuthState()),
    };
  }

  const verifier = params.pkce_verifier?.trim();
  if (!verifier) {
    return {
      redirect: ui.auth.generateFail(authMessages.missingPkceVerifier()),
    };
  }

  const exchanged = await KickApi.exchangeAuthorizationCode(code, verifier);
  if (!exchanged.success || !exchanged.accessToken) {
    return {
      redirect: ui.auth.generateFail(
        exchanged.message
          ? authMessages.authorizationFailed(exchanged.message)
          : authMessages.tokenExchangeFailed()
      ),
    };
  }

  const expiresAt =
    typeof exchanged.expiresIn === 'number'
      ? Date.now() + exchanged.expiresIn * 1000
      : Date.now() + 3600 * 1000;

  KickApi.accessToken = exchanged.accessToken;
  KickApi.refreshToken = exchanged.refreshToken || null;

  const user = await KickApi.GetMe();
  const kickUsername = resolveKickUsername(user);

  await mergeKickParams({
    access_token: exchanged.accessToken,
    refresh_token: exchanged.refreshToken || '',
    token_expires_at: expiresAt,
    pkce_verifier: '',
    oauth_state: '',
    kick_username: kickUsername,
  });

  RegenerateConfig();

  return {
    redirect: ui.auth.generateSuccess(authMessages.authorizationSuccessful()),
  };
});
