import { io, type Socket } from 'socket.io-client';
import { getAccessToken } from './api/client';

// Singleton — created once at module level, shared across the app
// autoConnect: false — connect manually after auth state is confirmed (in AuthContext)
export const socket: Socket = io('http://localhost:3000', {
  autoConnect: false,
  auth: (cb) => {
    // Callback form: called fresh on every reconnect — picks up latest token after JWT refresh
    cb({ token: getAccessToken() ?? '' });
  },
});
