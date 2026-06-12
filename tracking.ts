import { KickApi, type KickUser } from './api';
import { PLATFORM } from './constants';
import { KickPusherChatClient } from './pusher-chat';
import { notifyConnectionStatus } from './status-notify';

let starting = false;
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let broadcasterUserId: number | null = null;
let pusherChat: KickPusherChatClient | null = null;

const REFRESH_CHECK_INTERVAL_MS = 5 * 60 * 1000;

export const startKickTracking = async (user: KickUser) => {
  if (starting || !KickApi.accessToken) {
    return;
  }

  starting = true;
  stopKickTracking();
  status.Update({ current: 'connecting' });

  try {
    broadcasterUserId = user.user_id;

    await KickApi.clearEventSubscriptions();
    const subscribed = await KickApi.subscribeToEvents();
    if (!subscribed) {
      status.Update({
        current: 'error',
        message: {
          en: 'Kick events subscription failed',
          ru: 'Не удалось подписаться на события Kick',
          uk: 'Не вдалося підписатися на події Kick',
        },
      });
      notifyConnectionStatus('error');
      return;
    }

    if (user.channel_slug) {
      const channelIds = await KickApi.GetChannelIds(user.channel_slug);
      if (channelIds?.chatroomId) {
        pusherChat = new KickPusherChatClient(channelIds.chatroomId);
        await pusherChat.start();
        console.log(
          `[Kick] Pusher chat connected for chatroom ${channelIds.chatroomId} (${user.channel_slug})`
        );
      } else {
        console.warn(
          `[Kick] Chatroom id unavailable for slug "${user.channel_slug}", live chat disabled`
        );
      }
    } else {
      console.warn('[Kick] Channel slug missing, live chat disabled');
    }

    if (KickApi.hasScope('chat:write')) {
      void dashboard.onChatSend(async ({ text }) => {
        if (!KickApi.accessToken || !broadcasterUserId) {
          throw new Error('Kick is not authorized');
        }
        const params = await api.config.getParams<{
          token_expires_at?: number;
        }>();
        await KickApi.ensureAccessToken(params.token_expires_at);
        const sent = await KickApi.SendChatMessage(text, broadcasterUserId);
        if (!sent) {
          throw new Error('Kick chat message was not sent');
        }
      });
    }

    if (!refreshTimer) {
      refreshTimer = setInterval(() => {
        void (async () => {
          if (!KickApi.accessToken) {
            return;
          }
          const params = await api.config.getParams<{
            token_expires_at?: number;
          }>();
          await KickApi.ensureAccessToken(params.token_expires_at);
        })();
      }, REFRESH_CHECK_INTERVAL_MS);
    }

    status.Update({
      current: 'online',
      message: { en: 'Kick' },
    });
    notifyConnectionStatus('online');

    console.log(
      `[Kick] Tracking started for broadcaster ${user.user_id} (${PLATFORM})`
    );
  } catch (error) {
    console.error('Kick tracking failed to start:', error);
    status.Update({ current: 'error' });
    notifyConnectionStatus('error');
    stopKickTracking({ notify: false });
  } finally {
    starting = false;
  }
};

export const stopKickTracking = (options?: { notify?: boolean }) => {
  void dashboard.offChatSend();
  pusherChat?.stop();
  pusherChat = null;
  void KickApi.clearEventSubscriptions();
  broadcasterUserId = null;
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  status.Update({ current: 'offline' });
  if (options?.notify !== false) {
    notifyConnectionStatus('offline');
  }
};
