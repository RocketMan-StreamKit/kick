import { PUSHER_WS_URL } from './constants';
import { pushChatMessage } from './dashboard-feed';

type PusherFrame = {
  event?: string;
  channel?: string;
  data?: string | Record<string, unknown>;
};

type WsConnection = Awaited<ReturnType<(typeof network.websocket)['connect']>>;

const CHAT_EVENT = 'App\\Events\\ChatMessageEvent';
const RECONNECT_DELAY_MS = 5000;

export class KickPusherChatClient {
  private connection: WsConnection | null = null;
  private destroyed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private subscribed = false;

  constructor(private readonly chatroomId: number) {}

  async start() {
    this.destroyed = false;
    await this.connect();
  }

  stop() {
    this.destroyed = true;
    this.subscribed = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.destroyConnection(this.connection);
    this.connection = null;
  }

  private async connect() {
    if (this.destroyed) {
      return;
    }

    try {
      const ws = await network.websocket.connect(PUSHER_WS_URL, {});
      if (this.destroyed) {
        ws.Destroy();
        return;
      }

      this.destroyConnection(this.connection);
      this.connection = ws;
      this.subscribed = false;

      ws.On('message', (raw: string) => this.onMessage(raw, ws));
      ws.On('close', () => {
        if (!this.destroyed && this.connection === ws) {
          this.scheduleReconnect();
        }
      });
      ws.On('error', (error: Error) => {
        console.error('Kick Pusher WebSocket error:', error);
      });
    } catch (error) {
      console.error('Kick Pusher connect failed:', error);
      this.scheduleReconnect();
    }
  }

  private onMessage(raw: string, ws: WsConnection) {
    let frame: PusherFrame;
    try {
      frame = JSON.parse(raw) as PusherFrame;
    } catch (error) {
      console.error(error);
      return;
    }

    const event = frame.event || '';

    if (event === 'pusher:connection_established') {
      this.subscribe(ws);
      return;
    }

    if (event === 'pusher:ping') {
      try {
        ws.Send({ event: 'pusher:pong', data: {} });
      } catch (error) {
        console.error(error);
      }
      return;
    }

    if (event !== CHAT_EVENT) {
      return;
    }

    void this.handleChatMessage(frame.data);
  }

  private subscribe(ws: WsConnection) {
    if (this.subscribed || this.destroyed) {
      return;
    }

    try {
      ws.Send({
        event: 'pusher:subscribe',
        data: {
          auth: '',
          channel: `chatrooms.${this.chatroomId}.v2`,
        },
      });
      this.subscribed = true;
    } catch (error) {
      console.error('Kick Pusher subscribe failed:', error);
    }
  }

  private async handleChatMessage(data: PusherFrame['data']) {
    let payload: Record<string, unknown>;
    try {
      if (typeof data === 'string') {
        payload = JSON.parse(data) as Record<string, unknown>;
      } else if (data && typeof data === 'object') {
        payload = data;
      } else {
        return;
      }
    } catch (error) {
      console.error(error);
      return;
    }

    const senderRaw =
      payload.sender && typeof payload.sender === 'object'
        ? (payload.sender as Record<string, unknown>)
        : null;
    const content = typeof payload.content === 'string' ? payload.content : '';
    if (!senderRaw || !content.trim()) {
      return;
    }

    const userId = senderRaw.user_id ?? senderRaw.id;
    const username = senderRaw.username;
    if (
      (typeof userId !== 'number' && typeof userId !== 'string') ||
      typeof username !== 'string'
    ) {
      return;
    }

    const numericUserId =
      typeof userId === 'number' ? userId : Number.parseInt(userId, 10);
    if (!Number.isFinite(numericUserId)) {
      return;
    }

    const identity =
      senderRaw.identity && typeof senderRaw.identity === 'object'
        ? (senderRaw.identity as { username_color?: string; color?: string })
        : null;
    const color =
      (typeof identity?.username_color === 'string'
        ? identity.username_color
        : undefined) ||
      (typeof identity?.color === 'string' ? identity.color : undefined);

    await pushChatMessage({
      id: typeof payload.id === 'string' ? payload.id : undefined,
      sender: {
        user_id: numericUserId,
        username,
        profile_picture:
          typeof senderRaw.profile_picture === 'string'
            ? senderRaw.profile_picture
            : undefined,
      },
      content,
      color,
    });
  }

  private scheduleReconnect() {
    if (this.destroyed || this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, RECONNECT_DELAY_MS);
  }

  private destroyConnection(connection: WsConnection | null) {
    if (!connection) {
      return;
    }
    try {
      connection.Destroy();
    } catch (error) {
      console.error(error);
    }
  }
}
