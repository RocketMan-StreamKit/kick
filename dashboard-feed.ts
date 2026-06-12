import { KickApi } from './api';
import { KICK_EMOTE_URL, PLATFORM } from './constants';

export type KickEventUser = {
  user_id: number;
  username: string;
  profile_picture?: string;
};

const userId = (id: number) => `kick:${id}`;

const avatarCache = new Map<number, string>();
const recentChatIds = new Set<string>();

const resolveUserAvatar = async (kickUserId: number, fallback?: string) => {
  if (!kickUserId) {
    return fallback?.trim() || '';
  }

  if (fallback?.trim()) {
    avatarCache.set(kickUserId, fallback.trim());
    return fallback.trim();
  }

  const cached = avatarCache.get(kickUserId);
  if (cached) {
    return cached;
  }

  const user = await KickApi.GetUserById(kickUserId);
  const url = user?.profile_picture?.trim();
  if (!url) {
    return '';
  }

  avatarCache.set(kickUserId, url);
  return url;
};

const buildKickProfile = async (
  user: KickEventUser,
  extra?: { color?: string }
) => {
  const avatar = await resolveUserAvatar(user.user_id, user.profile_picture);
  return {
    id: userId(user.user_id),
    name: user.username,
    avatar,
    platform: PLATFORM,
    ...extra,
  };
};

const parseKickEmotes = (
  content: string,
  emotes?: { emote_id?: string; positions?: { s: number; e: number }[] }[]
) => {
  const map = new Map<string, string>();

  for (const emote of emotes ?? []) {
    const id = emote?.emote_id;
    if (!id) {
      continue;
    }
    const match = content.match(new RegExp(`\\[emote:${id}:([^\\]]+)\\]`, 'i'));
    const word = match?.[1] || id;
    map.set(word, KICK_EMOTE_URL(id));
  }

  const tokenMatches = content.matchAll(/\[emote:(\d+):([^\]]+)\]/gi);
  for (const match of tokenMatches) {
    const id = match[1];
    const word = match[2];
    if (id && word) {
      map.set(word, KICK_EMOTE_URL(id));
    }
  }

  const entries = [...map.entries()].map(([word, url]) => ({ word, url }));
  return entries.length ? entries : undefined;
};

const stripKickEmoteTokens = (content: string) =>
  content.replace(/\[emote:\d+:[^\]]+\]/gi, match => {
    const name = match.match(/\[emote:\d+:([^\]]+)\]/i)?.[1];
    return name ? `:${name}:` : match;
  });

export const pushFollow = async (follower: KickEventUser) => {
  const profile = await buildKickProfile(follower);
  return dashboard.addRecord(
    {
      type: 'follow',
      platform: PLATFORM,
      from: profile.id,
    },
    profile,
    { trigger: { type: 'follow' } }
  );
};

export const pushSubscribe = async (
  subscriber: KickEventUser,
  durationMonths?: number
) => {
  const profile = await buildKickProfile(subscriber);
  const months =
    durationMonths && durationMonths > 0 ? `${durationMonths} mo` : 'new sub';
  return dashboard.addRecord(
    {
      type: 'subscribe',
      platform: PLATFORM,
      from: profile.id,
      message: `Subscription (${months})`,
      attach: durationMonths
        ? [{ type: 'months', value: String(durationMonths) }]
        : undefined,
    },
    profile,
    { trigger: { type: 'subscribe' } }
  );
};

export const pushSubRenewal = async (
  subscriber: KickEventUser,
  durationMonths?: number
) => {
  const profile = await buildKickProfile(subscriber);
  const months =
    durationMonths && durationMonths > 0
      ? `${durationMonths} months`
      : 'renewal';
  return dashboard.addRecord(
    {
      type: 'custom',
      platform: PLATFORM,
      from: profile.id,
      message: `Sub renewal — ${months}`,
      attach: durationMonths
        ? [{ type: 'months', value: String(durationMonths) }]
        : undefined,
    },
    profile
  );
};

export const pushSubGift = async (
  gifter: KickEventUser,
  gifteeCount: number
) => {
  const profile = await buildKickProfile(gifter);
  return dashboard.addRecord(
    {
      type: 'custom',
      platform: PLATFORM,
      from: profile.id,
      message: `Gifted ${gifteeCount} sub${gifteeCount === 1 ? '' : 's'}`,
      attach: [{ type: 'gift_total', value: String(gifteeCount) }],
    },
    profile,
    {
      triggers: [
        { type: 'subgift' },
        { type: 'subgift', key: 'total', value: gifteeCount },
      ],
    }
  );
};

export const pushKicksGift = async (
  sender: KickEventUser,
  amount: number,
  giftName?: string,
  message?: string
) => {
  const profile = await buildKickProfile(sender);
  const label = giftName?.trim() || 'KICKs';
  const text = message?.trim()
    ? `${label} (${amount}): ${message}`
    : `${label} — ${amount} KICKs`;
  return dashboard.addRecord(
    {
      type: 'donation',
      platform: PLATFORM,
      from: profile.id,
      message: text,
      attach: [{ type: 'kicks', value: String(amount) }],
    },
    profile,
    { trigger: { type: 'custom', key: 'kicks', value: amount } }
  );
};

export const pushRewardRedemption = async (event: {
  id: string;
  user_input?: string;
  status?: string;
  reward: { id: string; title: string; cost: number };
  redeemer: KickEventUser;
}) => {
  if (
    event.status &&
    event.status !== 'pending' &&
    event.status !== 'accepted'
  ) {
    return;
  }

  const profile = await buildKickProfile(event.redeemer);
  const input = event.user_input?.trim();
  const costSuffix = event.reward.cost > 0 ? ` (${event.reward.cost} pts)` : '';
  const message = input
    ? `«${event.reward.title}»${costSuffix}: ${input}`
    : `«${event.reward.title}»${costSuffix}`;

  return dashboard.addRecord(
    {
      id: `kick:redemption:${event.id}`,
      type: 'custom',
      platform: PLATFORM,
      from: profile.id,
      message,
      attach: [
        { type: 'reward_id', value: event.reward.id },
        { type: 'cost', value: String(event.reward.cost) },
      ],
    },
    profile,
    {
      trigger: {
        type: 'custom',
        key: 'redeems',
        value: event.reward.id,
      },
    }
  );
};

export const pushLivestreamStatus = async (isLive: boolean, title?: string) => {
  return dashboard.addRecord(
    {
      type: 'custom',
      platform: PLATFORM,
      message: isLive
        ? title?.trim()
          ? `Stream started: ${title}`
          : 'Stream started'
        : title?.trim()
          ? `Stream ended: ${title}`
          : 'Stream ended',
    },
    undefined,
    isLive ? { trigger: { type: 'custom', key: 'live', value: 1 } } : undefined
  );
};

export const pushLivestreamMetadata = async (
  title?: string,
  category?: string
) => {
  const parts = [title?.trim(), category?.trim()].filter(Boolean);
  if (!parts.length) {
    return;
  }
  return dashboard.addRecord({
    type: 'custom',
    platform: PLATFORM,
    message: `Stream updated: ${parts.join(' · ')}`,
  });
};

export const pushModerationBan = async (
  bannedUser: KickEventUser,
  reason?: string
) => {
  const profile = await buildKickProfile(bannedUser);
  return dashboard.addRecord(
    {
      type: 'custom',
      platform: PLATFORM,
      from: profile.id,
      message: reason?.trim() ? `Banned: ${reason}` : 'Banned from channel',
    },
    profile
  );
};

export const pushChatMessage = async (event: {
  id?: string;
  sender: KickEventUser;
  content: string;
  color?: string;
  emotes?: { emote_id?: string; positions?: { s: number; e: number }[] }[];
}) => {
  const content = event.content?.trim();
  if (!content) {
    return;
  }

  const messageId = event.id?.trim();
  if (messageId) {
    if (recentChatIds.has(messageId)) {
      return;
    }
    recentChatIds.add(messageId);
    if (recentChatIds.size > 300) {
      recentChatIds.clear();
    }
  }

  const emotes = parseKickEmotes(content, event.emotes);
  const displayContent = stripKickEmoteTokens(content);
  const profile = await buildKickProfile(event.sender, {
    color: event.color,
  });

  return dashboard.addChatMessage(
    {
      content: displayContent,
      platform: PLATFORM,
      from: profile.id,
      emotes,
    },
    profile
  );
};
