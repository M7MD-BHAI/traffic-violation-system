import { useEffect, useRef, useState } from 'react';

const RETRY_DELAY_MS = 3_000;

export function useWebSocket(url) {
  const [data, setData]     = useState(null);
  const [status, setStatus] = useState('reconnecting');
  const wsRef               = useRef(null);
  const retryRef            = useRef(null);
  const unmounted           = useRef(false);

  useEffect(() => {
    unmounted.current = false;

    function connect() {
      if (unmounted.current) return;

      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!unmounted.current) setStatus('connected');
        };

        ws.onmessage = (evt) => {
          if (unmounted.current) return;
          try {
            setData(JSON.parse(evt.data));
          } catch {
            // ignore malformed frames
          }
        };

        ws.onerror = () => {
          // onclose fires right after onerror — let it handle retry
        };

        ws.onclose = () => {
          if (unmounted.current) return;
          setStatus('reconnecting');
          retryRef.current = setTimeout(connect, RETRY_DELAY_MS);
        };
      } catch {
        if (!unmounted.current) {
          setStatus('reconnecting');
          retryRef.current = setTimeout(connect, RETRY_DELAY_MS);
        }
      }
    }

    connect();

    return () => {
      unmounted.current = true;
      clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, [url]);

  return { data, status };
}
