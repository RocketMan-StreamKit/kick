import {
  API_BASE,
  DEFAULT_API_SERVER,
  OAUTH_INTROSPECT_URL,
  REDIRECT_URI,
  SCOPES,
  WEBHOOK_EVENTS,
} from './constants';
import { mergeKickParams } from './params';

export type KickUser = {
  user_id: number;
  name: string;
  username?: string;
  profile_picture?: string;
  channel_slug?: string;
};

export type KickChannelReward = {
  id: string;
  title: string;
  cost: number;
  is_enabled?: boolean;
  description?: string;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

const normalizeApiServer = (value?: string | null) => {
  const trimmed = value?.trim() || DEFAULT_API_SERVER;
  return trimmed.replace(/\/+$/, '');
};

const redactOAuthPayload = (raw: string) => {
  if (!raw?.trim()) {
    return { kind: 'empty' as const };
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      kind: 'json' as const,
      keys: Object.keys(parsed),
      error: parsed.error,
      error_description: parsed.error_description,
      detail: parsed.detail,
      message: parsed.message,
      has_access_token: Boolean(parsed.access_token),
      has_refresh_token: Boolean(parsed.refresh_token),
      expires_in: parsed.expires_in,
      scope: parsed.scope,
    };
  } catch (error) {
    const preview = raw.length > 500 ? `${raw.slice(0, 500)}...` : raw;
    return {
      kind: 'text' as const,
      preview,
      parseError: error instanceof Error ? error.message : String(error),
    };
  }
};

export const logKickOAuth = (
  level: 'log' | 'warn' | 'error',
  message: string,
  details: Record<string, unknown>
) => {
  console[level](`[Kick OAuth] ${message}`, details);
};

const normalizeListData = <T>(data: T | T[] | undefined): T | undefined => {
  if (Array.isArray(data)) {
    return data[0];
  }
  if (data && typeof data === 'object') {
    return data;
  }
  return undefined;
};

export const KickApi = new (class {
  accessToken: string | null = null;
  refreshToken: string | null = null;
  apiServer: string = DEFAULT_API_SERVER;
  grantedScopes = new Set<string>();
  private refreshInFlight: Promise<boolean> | null = null;
  private publicKeyCache: string | null = null;

  hasScope(scope: string) {
    return this.grantedScopes.has(scope);
  }

  setApiServer(value?: string | null) {
    this.apiServer = normalizeApiServer(value);
    logKickOAuth('log', 'api_server set', { resolved: this.apiServer });
  }

  private getTokenEndpointUrl(path: string) {
    return `${this.apiServer}${path}`;
  }

  private async postTokenEndpoint(
    path: string,
    body: Record<string, unknown>
  ): Promise<string> {
    return network.request.post(this.getTokenEndpointUrl(path), body);
  }

  private authHeaders() {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  private parseBody<T>(response: string, fallback: string) {
    if (!response?.trim()) {
      return { ok: false as const, message: fallback };
    }
    let body: T & { message?: string; error?: string; detail?: unknown };
    try {
      body = JSON.parse(response) as T & {
        message?: string;
        error?: string;
        detail?: unknown;
      };
    } catch {
      return { ok: false as const, message: fallback };
    }
    const errorMessage =
      body.error || (typeof body.detail === 'string' ? body.detail : undefined);
    if (errorMessage) {
      return { ok: false as const, message: errorMessage };
    }
    return { ok: true as const, body };
  }

  async exchangeAuthorizationCode(
    code: string,
    codeVerifier: string
  ): Promise<{
    success: boolean;
    accessToken?: string;
    refreshToken?: string;
    expiresIn?: number;
    scope?: string;
    message?: string;
  }> {
    const endpoint = this.getTokenEndpointUrl('/kick/oauth/token');

    logKickOAuth('log', 'Starting authorization code exchange', {
      endpoint,
      redirect_uri: REDIRECT_URI,
      codeLength: code.length,
      verifierLength: codeVerifier.length,
    });

    try {
      const response = await this.postTokenEndpoint('/kick/oauth/token', {
        code,
        code_verifier: codeVerifier,
        redirect_uri: REDIRECT_URI,
      });

      logKickOAuth('log', 'Token endpoint responded', {
        endpoint,
        responseLength: response?.length ?? 0,
        payload: redactOAuthPayload(response),
      });

      const parsed = this.parseBody<TokenResponse>(
        response,
        'Failed to exchange authorization code'
      );
      if (!parsed.ok || !parsed.body.access_token) {
        const detail =
          parsed.ok === false
            ? parsed.message
            : (parsed.body as { detail?: string }).detail ||
              (parsed.body as TokenResponse).error_description ||
              'Kick did not return access token';

        logKickOAuth('error', 'Authorization code exchange failed', {
          endpoint,
          reason: detail,
          parsedOk: parsed.ok,
          payload: redactOAuthPayload(response),
        });

        return {
          success: false,
          message: detail,
        };
      }

      logKickOAuth('log', 'Authorization code exchange succeeded', {
        endpoint,
        expiresIn: parsed.body.expires_in,
        scope: parsed.body.scope,
        hasRefreshToken: Boolean(parsed.body.refresh_token),
      });

      return {
        success: true,
        accessToken: parsed.body.access_token,
        refreshToken: parsed.body.refresh_token,
        expiresIn: parsed.body.expires_in,
        scope: parsed.body.scope,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Kick token exchange failed';

      logKickOAuth('error', 'Authorization code exchange threw', {
        endpoint,
        message,
        error:
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : error,
      });

      return { success: false, message };
    }
  }

  async refreshAccessToken(): Promise<boolean> {
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    const refreshToken = this.refreshToken?.trim();
    if (!refreshToken) {
      return false;
    }

    this.refreshInFlight = (async () => {
      const endpoint = this.getTokenEndpointUrl('/kick/oauth/refresh');

      logKickOAuth('log', 'Starting token refresh', {
        endpoint,
        refreshTokenLength: refreshToken.length,
      });

      try {
        const response = await this.postTokenEndpoint('/kick/oauth/refresh', {
          refresh_token: refreshToken,
        });

        logKickOAuth('log', 'Refresh endpoint responded', {
          endpoint,
          responseLength: response?.length ?? 0,
          payload: redactOAuthPayload(response),
        });

        const parsed = this.parseBody<TokenResponse>(
          response,
          'Failed to refresh Kick token'
        );
        if (!parsed.ok || !parsed.body.access_token) {
          logKickOAuth('warn', 'Token refresh failed', {
            endpoint,
            reason: parsed.ok ? parsed.body.message : parsed.message,
            parsedOk: parsed.ok,
            payload: redactOAuthPayload(response),
          });
          return false;
        }

        this.accessToken = parsed.body.access_token;
        if (parsed.body.refresh_token) {
          this.refreshToken = parsed.body.refresh_token;
        }

        const expiresAt =
          typeof parsed.body.expires_in === 'number'
            ? Date.now() + parsed.body.expires_in * 1000
            : Date.now() + 3600 * 1000;

        await mergeKickParams({
          access_token: this.accessToken,
          refresh_token: this.refreshToken,
          token_expires_at: expiresAt,
        });

        return true;
      } catch (error) {
        logKickOAuth('error', 'Token refresh threw', {
          endpoint,
          message: error instanceof Error ? error.message : String(error),
          error:
            error instanceof Error
              ? { name: error.name, message: error.message, stack: error.stack }
              : error,
        });
        return false;
      } finally {
        this.refreshInFlight = null;
      }
    })();

    return this.refreshInFlight;
  }

  async ensureAccessToken(expiresAt?: number): Promise<boolean> {
    if (!this.accessToken) {
      return false;
    }
    const shouldRefresh = !expiresAt || Date.now() >= expiresAt - 60_000;
    if (shouldRefresh && this.refreshToken) {
      return this.refreshAccessToken();
    }
    return true;
  }

  async validateTokenScopes(
    required: readonly string[],
    optional: readonly string[] = []
  ): Promise<boolean> {
    const accessToken = this.accessToken;
    if (!accessToken) {
      return false;
    }

    try {
      const response = await network.request.post(
        OAUTH_INTROSPECT_URL,
        {},
        { Authorization: `Bearer ${accessToken}` }
      );
      const parsed = this.parseBody<{
        data?: { active?: boolean; scope?: string };
      }>(response, 'Kick token introspection failed');

      if (!parsed.ok) {
        console.warn(parsed.message);
        return false;
      }

      const data = parsed.body.data;
      if (!data?.active) {
        return false;
      }

      this.grantedScopes = new Set(
        (data.scope ?? '').split(/\s+/).filter(Boolean)
      );

      const missingRequired = required.filter(
        scope => !this.grantedScopes.has(scope)
      );
      if (missingRequired.length > 0) {
        console.warn(
          'Kick token missing required scopes:',
          missingRequired.join(', ')
        );
        return false;
      }

      const missingOptional = optional.filter(
        scope => !this.grantedScopes.has(scope)
      );
      if (missingOptional.length > 0) {
        console.warn(
          'Kick token missing optional scopes:',
          missingOptional.join(', ')
        );
      }

      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  async GetChannelIds(
    channelSlug: string
  ): Promise<{ channelId: number; chatroomId: number } | null> {
    const slug = channelSlug.trim();
    if (!slug) {
      return null;
    }

    try {
      const response = await network.request.get(
        `${this.apiServer}/kick/channel/${encodeURIComponent(slug)}`
      );
      const parsed = this.parseBody<{
        channel_id?: number;
        chatroom_id?: number;
      }>(response, 'Failed to resolve Kick channel');

      if (!parsed.ok) {
        console.error('[Kick] GetChannelIds failed:', parsed.message);
        return null;
      }

      const channelId = parsed.body.channel_id;
      const chatroomId = parsed.body.chatroom_id;
      if (
        typeof channelId !== 'number' ||
        typeof chatroomId !== 'number' ||
        !chatroomId
      ) {
        console.warn('[Kick] GetChannelIds missing ids in response', {
          slug,
          channelId,
          chatroomId,
        });
        return null;
      }

      return { channelId, chatroomId };
    } catch (error) {
      console.error('[Kick] GetChannelIds error:', error);
      return null;
    }
  }

  async GetMyChannelSlug(broadcasterUserId?: number): Promise<string | null> {
    if (!this.accessToken) {
      return null;
    }

    try {
      const query =
        typeof broadcasterUserId === 'number'
          ? `?broadcaster_user_id=${encodeURIComponent(String(broadcasterUserId))}`
          : '';
      const response = await network.request.get(
        `${API_BASE}/channels${query}`,
        { Authorization: `Bearer ${this.accessToken}` }
      );
      const parsed = this.parseBody<{
        data?: { slug?: string } | { slug?: string }[];
      }>(response, 'Failed to load Kick channel');

      if (!parsed.ok) {
        console.warn('[Kick] GetMyChannelSlug failed:', parsed.message);
        return null;
      }

      const channel = normalizeListData(parsed.body.data);
      const slug = channel?.slug?.trim();
      return slug || null;
    } catch (error) {
      console.error('[Kick] GetMyChannelSlug error:', error);
      return null;
    }
  }

  async GetMe(): Promise<KickUser | null> {
    if (!this.accessToken) {
      return null;
    }

    try {
      const response = await network.request.get(`${API_BASE}/users`, {
        Authorization: `Bearer ${this.accessToken}`,
      });
      const parsed = this.parseBody<{
        data?:
          | {
              user_id?: number;
              name?: string;
              username?: string;
              profile_picture?: string;
            }
          | {
              user_id?: number;
              name?: string;
              username?: string;
              profile_picture?: string;
            }[];
      }>(response, 'Failed to resolve Kick user');

      if (!parsed.ok) {
        console.error(parsed.message);
        return null;
      }

      const user = normalizeListData(parsed.body.data);
      if (!user?.user_id) {
        return null;
      }

      const channelSlug = await this.GetMyChannelSlug(user.user_id);

      return {
        user_id: user.user_id,
        name: user.name || user.username || String(user.user_id),
        username: user.username,
        profile_picture: user.profile_picture,
        channel_slug: channelSlug || undefined,
      };
    } catch (error) {
      console.error('Failed to resolve Kick user:', error);
      return null;
    }
  }

  async GetUserById(userId: number): Promise<KickUser | null> {
    if (!this.accessToken || !userId) {
      return null;
    }

    try {
      const response = await network.request.get(
        `${API_BASE}/users?id=${encodeURIComponent(String(userId))}`,
        { Authorization: `Bearer ${this.accessToken}` }
      );
      const parsed = this.parseBody<{
        data?: {
          user_id?: number;
          name?: string;
          username?: string;
          profile_picture?: string;
        }[];
      }>(response, 'Failed to load Kick user');

      if (!parsed.ok) {
        return null;
      }

      const user = parsed.body.data?.[0];
      if (!user?.user_id) {
        return null;
      }

      return {
        user_id: user.user_id,
        name: user.name || user.username || String(user.user_id),
        username: user.username,
        profile_picture: user.profile_picture,
      };
    } catch {
      return null;
    }
  }

  async GetPublicKey(): Promise<string | null> {
    if (this.publicKeyCache) {
      return this.publicKeyCache;
    }

    try {
      const response = await network.request.get(`${API_BASE}/public-key`);
      const parsed = this.parseBody<{ data?: { public_key?: string } }>(
        response,
        'Failed to load Kick public key'
      );
      if (!parsed.ok) {
        return null;
      }
      const key = parsed.body.data?.public_key?.trim();
      if (!key) {
        return null;
      }
      this.publicKeyCache = key;
      return key;
    } catch (error) {
      console.error('Failed to fetch Kick public key:', error);
      return null;
    }
  }

  async subscribeToEvents(): Promise<boolean> {
    if (!this.accessToken) {
      return false;
    }

    try {
      const response = await network.request.post(
        `${API_BASE}/events/subscriptions`,
        {
          events: WEBHOOK_EVENTS.map(event => ({
            name: event.name,
            version: event.version,
          })),
          method: 'webhook',
        },
        this.authHeaders()
      );
      const parsed = this.parseBody<{ data?: unknown[] }>(
        response,
        'Failed to subscribe to Kick events'
      );
      if (!parsed.ok) {
        console.error('Kick event subscription failed:', parsed.message);
        return false;
      }
      return true;
    } catch (error) {
      console.error('Kick event subscription error:', error);
      return false;
    }
  }

  async clearEventSubscriptions(): Promise<void> {
    if (!this.accessToken) {
      return;
    }

    try {
      const listResponse = await network.request.get(
        `${API_BASE}/events/subscriptions`,
        { Authorization: `Bearer ${this.accessToken}` }
      );
      const parsed = this.parseBody<{ data?: { id?: string }[] }>(
        listResponse,
        'Failed to list Kick subscriptions'
      );
      if (!parsed.ok) {
        return;
      }

      const raw = parsed.body.data;
      const list = Array.isArray(raw) ? raw : [];
      const ids = list
        .map(item => item.id)
        .filter((id): id is string => Boolean(id));

      if (!ids.length) {
        return;
      }

      const query = ids.map(id => `id=${encodeURIComponent(id)}`).join('&');
      await network.request.delete(
        `${API_BASE}/events/subscriptions?${query}`,
        { Authorization: `Bearer ${this.accessToken}` }
      );
    } catch (error) {
      console.error('Failed to clear Kick subscriptions:', error);
    }
  }

  async SendChatMessage(
    content: string,
    broadcasterUserId: number
  ): Promise<boolean> {
    if (!this.accessToken || !content.trim() || !broadcasterUserId) {
      return false;
    }

    try {
      const response = await network.request.post(
        `${API_BASE}/chat`,
        {
          type: 'user',
          broadcaster_user_id: broadcasterUserId,
          content: content.trim().slice(0, 500),
        },
        this.authHeaders()
      );
      const parsed = this.parseBody<{ data?: { is_sent?: boolean } }>(
        response,
        'Failed to send Kick chat message'
      );
      if (!parsed.ok) {
        console.error(parsed.message);
        return false;
      }
      return parsed.body.data?.is_sent !== false;
    } catch (error) {
      console.error('Failed to send Kick chat message:', error);
      return false;
    }
  }

  async ListChannelRewards(broadcasterUserId: number): Promise<{
    success: boolean;
    rewards: KickChannelReward[];
    message?: string;
  }> {
    if (!this.accessToken) {
      return { success: false, rewards: [], message: 'Kick is not authorized' };
    }

    try {
      const response = await network.request.get(
        `${API_BASE}/channels/rewards?broadcaster_user_id=${encodeURIComponent(
          String(broadcasterUserId)
        )}`,
        { Authorization: `Bearer ${this.accessToken}` }
      );
      const parsed = this.parseBody<{
        data?: KickChannelReward[] | { rewards?: KickChannelReward[] };
      }>(response, 'Failed to load Kick rewards');

      if (!parsed.ok) {
        return { success: false, rewards: [], message: parsed.message };
      }

      const raw = parsed.body.data;
      const list = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.rewards)
          ? raw.rewards
          : [];

      const rewards = list.filter((item): item is KickChannelReward =>
        Boolean(item?.id && item?.title && typeof item.cost === 'number')
      );

      return { success: true, rewards };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to load Kick rewards';
      return { success: false, rewards: [], message };
    }
  }

  async CreateChannelReward(
    broadcasterUserId: number,
    title: string,
    cost = 1
  ): Promise<{
    success: boolean;
    reward?: KickChannelReward;
    message?: string;
  }> {
    if (!this.accessToken) {
      return { success: false, message: 'Kick is not authorized' };
    }

    const trimmedTitle = title.trim().slice(0, 50);
    if (!trimmedTitle) {
      return { success: false, message: 'Reward title is required' };
    }

    try {
      const response = await network.request.post(
        `${API_BASE}/channels/rewards`,
        {
          broadcaster_user_id: broadcasterUserId,
          title: trimmedTitle,
          cost: Math.max(1, Math.floor(cost)),
          is_enabled: true,
          requires_user_input: false,
        },
        this.authHeaders()
      );
      const parsed = this.parseBody<{
        data?: { id?: string; title?: string; cost?: number };
      }>(response, 'Failed to create Kick reward');

      if (!parsed.ok) {
        return { success: false, message: parsed.message };
      }

      const created = parsed.body.data;
      if (!created?.id) {
        return { success: false, message: 'Kick did not return reward id' };
      }

      return {
        success: true,
        reward: {
          id: created.id,
          title: created.title || trimmedTitle,
          cost: created.cost ?? cost,
          is_enabled: true,
        },
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to create Kick reward';
      return { success: false, message };
    }
  }

  async DeleteChannelReward(
    broadcasterUserId: number,
    rewardId: string
  ): Promise<boolean> {
    if (!this.accessToken || !rewardId) {
      return false;
    }

    try {
      await network.request.delete(
        `${API_BASE}/channels/rewards/${encodeURIComponent(rewardId)}?broadcaster_user_id=${encodeURIComponent(
          String(broadcasterUserId)
        )}`,
        { Authorization: `Bearer ${this.accessToken}` }
      );
      return true;
    } catch (error) {
      console.error('Failed to delete Kick reward:', error);
      return false;
    }
  }

  getRequiredScopes() {
    return SCOPES;
  }
})();
