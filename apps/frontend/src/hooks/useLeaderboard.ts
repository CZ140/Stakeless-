import { useEffect } from 'react';
import { socket } from '../socket';
import { getAccessToken } from '../api/client';
import { useLeaderboardStore, type LeaderboardSnapshot } from '../stores/leaderboardStore';

export function useLeaderboard(): void {
  const setSnapshot = useLeaderboardStore((s) => s.setSnapshot);

  useEffect(() => {
    // Ensure socket is connected — AuthContext only connects when authenticated.
    // Guests visiting /leaderboard need the socket connected to receive live broadcasts.
    if (!socket.connected) {
      socket.connect();
    }

    function onUpdate(data: LeaderboardSnapshot) {
      setSnapshot(data);
    }
    socket.on('leaderboard:update', onUpdate);

    return () => {
      socket.off('leaderboard:update', onUpdate);
      // Only disconnect if no access token — if authenticated, AuthContext owns the lifecycle.
      if (getAccessToken() === null) {
        socket.disconnect();
      }
    };
  }, [setSnapshot]);
}
