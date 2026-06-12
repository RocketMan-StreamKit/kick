import { KickApi } from './api';
import {
  pushChatMessage,
  pushFollow,
  pushKicksGift,
  pushLivestreamMetadata,
  pushLivestreamStatus,
  pushModerationBan,
  pushRewardRedemption,
  pushSubGift,
  pushSubscribe,
  pushSubRenewal,
  type KickEventUser,
} from './dashboard-feed';

type WebhookPayload = {
  query: Record<string, unknown>;
  params: Record<string, unknown>;
  body: unknown;
  rawBody?: string;
  headers?: Record<string, string>;
};

const header = (headers: Record<string, string> | undefined, name: string) => {
  if (!headers) {
    return '';
  }
  const direct = headers[name];
  if (direct) {
    return direct;
  }
  const lower = headers[name.toLowerCase()];
  return lower || '';
};

const asKickUser = (value: unknown): KickEventUser | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const user = value as Record<string, unknown>;
  const userId = user.user_id ?? user.id;
  const username = user.username;
  const numericUserId =
    typeof userId === 'number'
      ? userId
      : typeof userId === 'string'
        ? Number.parseInt(userId, 10)
        : Number.NaN;
  if (!Number.isFinite(numericUserId) || typeof username !== 'string') {
    return null;
  }
  return {
    user_id: numericUserId,
    username,
    profile_picture:
      typeof user.profile_picture === 'string'
        ? user.profile_picture
        : undefined,
  };
};

const verifyWebhook = async (payload: WebhookPayload) => {
  const messageId = header(payload.headers, 'Kick-Event-Message-Id');
  const timestamp = header(payload.headers, 'Kick-Event-Message-Timestamp');
  const signature = header(payload.headers, 'Kick-Event-Signature');
  const rawBody = payload.rawBody ?? '';

  if (!messageId || !timestamp || !signature || !rawBody) {
    console.warn('Kick webhook missing signature headers');
    return false;
  }

  const publicKey = await KickApi.GetPublicKey();
  if (!publicKey) {
    console.warn('Kick public key unavailable, skipping webhook verification');
    return true;
  }

  const signedPayload = `${messageId}.${timestamp}.${rawBody}`;
  return crypto.verifyRsaSha256(publicKey, signedPayload, signature);
};

const handleEvent = async (
  eventType: string,
  body: Record<string, unknown>
) => {
  switch (eventType) {
    case 'chat.message.sent': {
      const sender = asKickUser(body.sender);
      const content = typeof body.content === 'string' ? body.content : '';
      if (!sender || !content) {
        return;
      }
      const identity =
        sender &&
        body.sender &&
        typeof body.sender === 'object' &&
        (body.sender as { identity?: { username_color?: string } }).identity;
      const color =
        identity && typeof identity.username_color === 'string'
          ? identity.username_color
          : undefined;
      await pushChatMessage({
        id: typeof body.id === 'string' ? body.id : undefined,
        sender,
        content,
        color,
        emotes: Array.isArray(body.emotes)
          ? (body.emotes as {
              emote_id?: string;
              positions?: { s: number; e: number }[];
            }[])
          : undefined,
      });
      return;
    }
    case 'channel.followed': {
      const follower = asKickUser(body.follower);
      if (follower) {
        await pushFollow(follower);
      }
      return;
    }
    case 'channel.subscription.new': {
      const subscriber = asKickUser(body.subscriber);
      if (subscriber) {
        const duration =
          typeof body.duration === 'number' ? body.duration : undefined;
        await pushSubscribe(subscriber, duration);
      }
      return;
    }
    case 'channel.subscription.renewal': {
      const subscriber = asKickUser(body.subscriber);
      if (subscriber) {
        const duration =
          typeof body.duration === 'number' ? body.duration : undefined;
        await pushSubRenewal(subscriber, duration);
      }
      return;
    }
    case 'channel.subscription.gifts': {
      const gifter = asKickUser(body.gifter);
      const giftees = Array.isArray(body.giftees) ? body.giftees : [];
      if (gifter) {
        await pushSubGift(gifter, giftees.length || 1);
      }
      return;
    }
    case 'channel.reward.redemption.updated': {
      const redeemer = asKickUser(body.redeemer);
      const reward =
        body.reward && typeof body.reward === 'object'
          ? (body.reward as {
              id?: string;
              title?: string;
              cost?: number;
            })
          : null;
      if (
        redeemer &&
        reward?.id &&
        reward.title &&
        typeof reward.cost === 'number' &&
        typeof body.id === 'string'
      ) {
        await pushRewardRedemption({
          id: body.id,
          user_input:
            typeof body.user_input === 'string' ? body.user_input : undefined,
          status: typeof body.status === 'string' ? body.status : undefined,
          reward: {
            id: reward.id,
            title: reward.title,
            cost: reward.cost,
          },
          redeemer,
        });
      }
      return;
    }
    case 'livestream.status.updated': {
      await pushLivestreamStatus(
        Boolean(body.is_live),
        typeof body.title === 'string' ? body.title : undefined
      );
      return;
    }
    case 'livestream.metadata.updated': {
      const metadata =
        body.metadata && typeof body.metadata === 'object'
          ? (body.metadata as {
              title?: string;
              category?: { name?: string };
            })
          : null;
      await pushLivestreamMetadata(metadata?.title, metadata?.category?.name);
      return;
    }
    case 'kicks.gifted': {
      const sender = asKickUser(body.sender);
      const gift =
        body.gift && typeof body.gift === 'object'
          ? (body.gift as { amount?: number; name?: string; message?: string })
          : null;
      if (sender && typeof gift?.amount === 'number') {
        await pushKicksGift(sender, gift.amount, gift.name, gift.message);
      }
      return;
    }
    case 'moderation.banned': {
      const bannedUser = asKickUser(body.banned_user);
      const metadata =
        body.metadata && typeof body.metadata === 'object'
          ? (body.metadata as { reason?: string })
          : null;
      if (bannedUser) {
        await pushModerationBan(bannedUser, metadata?.reason);
      }
      return;
    }
    default:
      return;
  }
};

network.endpoints.create('webhook', 'POST', 'onKickWebhook');

events.On('onKickWebhook', async (payload: WebhookPayload) => {
  const valid = await verifyWebhook(payload);
  if (!valid) {
    console.warn('Kick webhook signature verification failed');
    return { ok: false };
  }

  const eventType = header(payload.headers, 'Kick-Event-Type');
  const body =
    payload.body && typeof payload.body === 'object'
      ? (payload.body as Record<string, unknown>)
      : {};

  try {
    await handleEvent(eventType, body);
    status.Update({
      current: 'online',
      message: { en: 'Kick' },
    });
  } catch (error) {
    console.error('Kick webhook handler error:', error);
  }

  return { ok: true };
});
