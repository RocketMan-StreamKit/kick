import { KickApi } from './api';
import {
  buildAuthServerSelectOptions,
  DEFAULT_API_SERVER,
  REQUIRED_SCOPES,
  SCOPES,
} from './constants';

const OPTIONAL_SCOPES = SCOPES.filter(
  scope => !REQUIRED_SCOPES.includes(scope as (typeof REQUIRED_SCOPES)[number])
);
import { mergeKickParams } from './params';
import { startKickTracking, stopKickTracking } from './tracking';

const clearKickAuth = () => {
  stopKickTracking();
  return mergeKickParams({
    access_token: '',
    refresh_token: '',
    token_expires_at: 0,
    pkce_verifier: '',
    oauth_state: '',
  }).then(() => {
    KickApi.accessToken = null;
    KickApi.refreshToken = null;
    KickApi.grantedScopes.clear();
    RegenerateConfig();
  });
};

export const RegenerateConfig = () => {
  api.config.getParams().then(params => {
    const access_token = params.access_token || '';
    const refresh_token = params.refresh_token || '';
    const api_server = params.api_server || DEFAULT_API_SERVER;
    const token_expires_at =
      typeof params.token_expires_at === 'number' ? params.token_expires_at : 0;

    KickApi.setApiServer(api_server);
    KickApi.accessToken = access_token || null;
    KickApi.refreshToken = refresh_token || null;

    if (KickApi.accessToken) {
      KickApi.ensureAccessToken(token_expires_at).then(async ok => {
        if (!ok) {
          await clearKickAuth();
          return;
        }

        const scopesOk = await KickApi.validateTokenScopes(
          REQUIRED_SCOPES,
          OPTIONAL_SCOPES
        );
        if (!scopesOk) {
          await clearKickAuth();
          return;
        }

        const user = await KickApi.GetMe();
        if (!user) {
          await clearKickAuth();
          return;
        }

        startKickTracking(user);
      });
    } else {
      stopKickTracking();
    }

    const fields: Parameters<typeof GenerateConfig>[0] = [
      {
        key: 'api_server',
        type: 'select',
        default: DEFAULT_API_SERVER,
        options: buildAuthServerSelectOptions(isDeveloperMode),
        editor: {
          label: {
            en: 'API Server',
            ru: 'API сервер',
            uk: 'API сервер',
          },
          description: {
            en: 'Auth server URL (domain + port)',
            ru: 'URL сервера авторизации (домен + порт)',
            uk: 'URL сервера авторизації (домен + порт)',
          },
        },
      },
      {
        key: 'access_token',
        type: 'text',
        default: '',
      },
      {
        key: 'refresh_token',
        type: 'text',
        default: '',
      },
      {
        key: 'token_expires_at',
        type: 'number',
        default: 0,
      },
      {
        key: 'pkce_verifier',
        type: 'text',
        default: '',
      },
      {
        key: 'oauth_state',
        type: 'text',
        default: '',
      },
    ];

    if (access_token) {
      fields.push({
        type: 'button',
        key: 'logout',
        event: 'kickLogout',
        editor: { label: { en: 'Logout', ru: 'Выйти', uk: 'Вийти' } },
      });
    } else {
      fields.push({
        type: 'button',
        key: 'login',
        event: 'kickLogin',
        editor: {
          label: {
            en: 'Login via Kick',
            ru: 'Войти через Kick',
            uk: 'Увійти через Kick',
          },
        },
      });
    }

    GenerateConfig(fields);
  });
};
