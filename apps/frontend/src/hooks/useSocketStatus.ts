import { useEffect, useState } from 'react';
import { socket } from '../socket';

// Reactive view of the shared Socket.IO connection. Returns true while connected.
// The socket connects after auth (AuthContext) and reconnects automatically; this
// just mirrors its current state for UI (e.g. the sidebar status indicator).
export function useSocketStatus(): boolean {
  const [connected, setConnected] = useState<boolean>(socket.connected);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    // Resync in case the state changed between render and effect attach.
    setConnected(socket.connected);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  return connected;
}
