import { useEffect, useRef, useCallback } from 'react';

type WsMessage = Record<string, unknown>;
type WsHandler = (msg: WsMessage) => void;

interface UseWebSocketOptions {
  /** URL to connect to, e.g. 'ws://localhost:3999/ws/status' */
  url: string;
  /** Called on every parsed JSON message */
  onMessage?: WsHandler;
  /** Called when the connection opens */
  onOpen?: () => void;
  /** Called when the connection closes (not due to unmount) */
  onClose?: () => void;
  /** Called on error */
  onError?: (err: Event) => void;
  /** Reconnect delay in ms. Set to 0 to disable auto-reconnect. Default: 3000 */
  reconnectDelay?: number;
  /** Skip connection entirely when false. Default: true */
  enabled?: boolean;
}

export function useWebSocket({
  url,
  onMessage,
  onOpen,
  onClose,
  onError,
  reconnectDelay = 3000,
  enabled = true,
}: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const unmountedRef = useRef(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep handler refs stable to avoid reconnecting on re-render.
  // Refs are written in an effect (after commit), never during render.
  const onMessageRef = useRef(onMessage);
  const onOpenRef = useRef(onOpen);
  const onCloseRef = useRef(onClose);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onMessageRef.current = onMessage;
    onOpenRef.current = onOpen;
    onCloseRef.current = onClose;
    onErrorRef.current = onError;
  });

  // `connect` needs to re-schedule itself from ws.onclose; go through a ref
  // so the callback doesn't reference itself before it's declared.
  const connectRef = useRef<() => void>(() => {});

  const connect = useCallback(() => {
    if (unmountedRef.current || !enabled) return;
    if (wsRef.current && wsRef.current.readyState < WebSocket.CLOSING) return;

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      return; // Invalid URL or not supported
    }
    wsRef.current = ws;

    ws.onopen = () => {
      if (!unmountedRef.current) onOpenRef.current?.();
    };

    ws.onmessage = (ev) => {
      if (unmountedRef.current) return;
      try {
        const data = JSON.parse(ev.data as string) as WsMessage;
        onMessageRef.current?.(data);
      } catch {
        // Ignore non-JSON messages
      }
    };

    ws.onerror = (ev) => {
      if (!unmountedRef.current) onErrorRef.current?.(ev);
    };

    ws.onclose = () => {
      if (unmountedRef.current) return;
      onCloseRef.current?.();
      if (reconnectDelay > 0) {
        reconnectTimer.current = setTimeout(() => connectRef.current(), reconnectDelay);
      }
    };
  }, [url, enabled, reconnectDelay]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const send = useCallback((data: WsMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  useEffect(() => {
    unmountedRef.current = false;
    if (enabled) connect();

    return () => {
      unmountedRef.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [enabled, connect]);

  return { send };
}
