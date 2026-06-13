export const PLATFORM = 'kick';

export const CLIENT_ID = '01KTE43RJ9JDJCNM9R2JFGJ6QZ';

export const DEFAULT_API_SERVER = 'https://rocketman-streams.com:443';
export const AUTH_SERVER_RU_URL = 'https://ru.rocketman-streams.com:443';
export const AUTH_SERVER_LOCAL_URL = 'https://local.rocketman-streams.com:443';

export const buildAuthServerSelectOptions = (includeLocalhost: boolean) => {
  const urlLabel = (url: string) => ({
    en: url,
    ru: url,
    uk: url,
  });

  const options = [
    { value: DEFAULT_API_SERVER, label: urlLabel(DEFAULT_API_SERVER) },
    { value: AUTH_SERVER_RU_URL, label: urlLabel(AUTH_SERVER_RU_URL) },
  ];

  if (includeLocalhost) {
    options.push({
      value: AUTH_SERVER_LOCAL_URL,
      label: urlLabel(AUTH_SERVER_LOCAL_URL),
    });
  }

  return options;
};

export const REDIRECT_URI = 'http://localhost:3000/addon/kick/auth';

export const OAUTH_AUTHORIZE_URL = 'https://id.kick.com/oauth/authorize';
export const OAUTH_INTROSPECT_URL =
  'https://id.kick.com/oauth/token/introspect';

export const API_BASE = 'https://api.kick.com/public/v1';

export const WEBHOOK_PATH = '/addon/kick/webhook';

/** Scopes requested during OAuth (user may grant a subset). */
export const SCOPES = [
  'user:read',
  'channel:read',
  'channel:rewards:read',
  'channel:rewards:write',
  'chat:write',
  'events:subscribe',
  'kicks:read',
] as const;

/** Minimum scopes required to keep the session. */
export const REQUIRED_SCOPES = [
  'user:read',
  'channel:read',
  'events:subscribe',
] as const;

export const WEBHOOK_EVENTS = [
  { name: 'chat.message.sent', version: 1 },
  { name: 'channel.followed', version: 1 },
  { name: 'channel.subscription.new', version: 1 },
  { name: 'channel.subscription.renewal', version: 1 },
  { name: 'channel.subscription.gifts', version: 1 },
  { name: 'channel.reward.redemption.updated', version: 1 },
  { name: 'livestream.status.updated', version: 1 },
  { name: 'livestream.metadata.updated', version: 1 },
  { name: 'kicks.gifted', version: 1 },
  { name: 'moderation.banned', version: 1 },
] as const;

export const KICK_EMOTE_URL = (emoteId: string) =>
  `https://files.kick.com/emotes/${emoteId}/fullsize`;

/** Public Pusher endpoint used by kick.com for live chat (no auth). */
export const PUSHER_WS_URL =
  'wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0&flash=false';

export const KICK_V2_CHANNEL_URL = (slug: string) =>
  `https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`;

export const KICK_BROWSER_HEADERS = {
  Accept: 'application/json',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
} as const;
