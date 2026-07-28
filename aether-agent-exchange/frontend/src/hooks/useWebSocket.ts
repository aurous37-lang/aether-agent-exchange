import { useEffect, useRef, useCallback } from 'react';

/**
 * Connect to the backend WebSocket and subscribe to channels.
 *
 * Protocol (matches backend/src/services/websocket.ts):
 *   Client → Server:
 *     { type: 'subscribe',   channel: 'job:<id>' }
 *     { type: 'unsubscribe', channel: 'job:<id>' }
 *     { type: 'auth',        userId: '<id>' }
 *   Server → Client:
 *     { type: 'connected', clientId: '...' }
 *     { type: '<event>',   channel: '...', data: {...}, timestamp: number }
 *
 * @param channels  Array of channel names to subscribe to (e.g. ['job:abc', 'user:xyz'])
 * @param onMessage Called for every non-system message received on a subscribed channel
 * @param userId    Optional — if provided, sends an auth message so the server can route
 *                  user-targeted messages (e.g. notifications) to this connection
 */
export function useWebSocket(
  channels: string[],
  onMessage: (type: string, data: unknown) => void,
  userId?: string | null,
) {
  // Keep latest callback in a ref so reconnect logic always calls the current version
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  // Stable channel list reference (serialise to string for dep comparison)
  const channelKey = channels.join(',');

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const connectRef = useRef<() => void>(() => {});

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    // Determine ws URL relative to current page so it works behind the Vite proxy
    // in dev (ws://localhost:5173/ws) and in production behind any reverse-proxy.
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.addEventListener('open', () => {
      // Authenticate so the server can route user-targeted messages
      if (userId) {
        ws.send(JSON.stringify({ type: 'auth', userId }));
      }
      // Subscribe to every requested channel
      const chans = channelKey.split(',').filter(Boolean);
      for (const channel of chans) {
        ws.send(JSON.stringify({ type: 'subscribe', channel }));
      }
    });

    ws.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data) as { type?: unknown; data?: unknown };
        // Ignore the initial 'connected' handshake
        if (msg.type === 'connected') return;
        if (typeof msg.type === 'string') {
          onMessageRef.current(msg.type, msg.data);
        }
      } catch {
        // Ignore unparseable frames
      }
    });

    ws.addEventListener('close', () => {
      wsRef.current = null;
      // Auto-reconnect after 3 seconds if still mounted
      if (mountedRef.current) {
        reconnectTimer.current = setTimeout(() => connectRef.current(), 3000);
      }
    });

    ws.addEventListener('error', () => {
      // The 'close' event always fires after 'error', so reconnect is handled there.
      // Force-close to trigger the close handler immediately.
      ws.close();
    });
  }, [channelKey, userId]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);
}
