import { KickApi } from './api';

const PROVIDER = 'kick_rewards';
let cachedBroadcasterId: number | null = null;

const resolveBroadcasterId = async () => {
  if (cachedBroadcasterId) {
    return cachedBroadcasterId;
  }
  const user = await KickApi.GetMe();
  if (!user?.user_id) {
    return null;
  }
  cachedBroadcasterId = user.user_id;
  return user.user_id;
};

events.On(`overlayTriggerValue:${PROVIDER}:list`, async () => {
  if (!KickApi.accessToken) {
    return {
      success: false,
      message: 'Kick is not authorized',
      items: [],
    };
  }

  const broadcasterId = await resolveBroadcasterId();
  if (!broadcasterId) {
    return {
      success: false,
      message: 'Kick channel not found',
      items: [],
    };
  }

  const result = await KickApi.ListChannelRewards(broadcasterId);
  if (!result.success) {
    return {
      success: false,
      message: result.message || 'Failed to load Kick rewards',
      items: [],
    };
  }

  return {
    success: true,
    items: result.rewards.map(item => ({
      id: item.id,
      label: item.title,
      meta: String(item.cost),
    })),
  };
});

events.On(
  `overlayTriggerValue:${PROVIDER}:create`,
  async (payload: {
    title?: string;
    context?: Record<string, string | number | boolean>;
  }) => {
    if (!KickApi.accessToken) {
      return { success: false, message: 'Kick is not authorized' };
    }

    const broadcasterId = await resolveBroadcasterId();
    if (!broadcasterId) {
      return { success: false, message: 'Kick channel not found' };
    }

    const title = payload?.title?.trim();
    if (!title) {
      return { success: false, message: 'Reward title is required' };
    }

    const rawCost = payload?.context?.cost;
    const cost =
      typeof rawCost === 'number'
        ? rawCost
        : typeof rawCost === 'string'
          ? Number(rawCost)
          : 1;
    if (!Number.isFinite(cost) || cost < 1) {
      return { success: false, message: 'Reward cost must be at least 1' };
    }

    const created = await KickApi.CreateChannelReward(
      broadcasterId,
      title,
      cost
    );
    if (!created.success || !created.reward?.id) {
      return {
        success: false,
        message: created.message || 'Failed to create Kick reward',
      };
    }

    return {
      success: true,
      valueId: created.reward.id,
      label: created.reward.title,
      meta: String(created.reward.cost),
    };
  }
);

events.On(
  `overlayTriggerValue:${PROVIDER}:release`,
  async (payload: { valueId?: string }) => {
    if (!KickApi.accessToken) {
      return { success: false, message: 'Kick is not authorized' };
    }

    const broadcasterId = await resolveBroadcasterId();
    if (!broadcasterId) {
      return { success: false, message: 'Kick channel not found' };
    }

    const valueId = payload?.valueId?.trim();
    if (!valueId) {
      return { success: false, message: 'Invalid reward id' };
    }

    const deleted = await KickApi.DeleteChannelReward(broadcasterId, valueId);
    return deleted
      ? { success: true }
      : { success: false, message: 'Failed to delete Kick reward' };
  }
);
