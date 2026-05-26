// Online-presence registry — in-memory, process-local. A user is "online" while
// at least one of their sockets is connected; the per-user socket count makes it
// multi-tab safe (two tabs => count 2; closing one keeps them online).
//
// This module deliberately has NO dependency on socket.io or the DB so both the
// socket layer (which updates it on connect/disconnect) and friendService (which
// reads it to stamp FriendDTO.online) can import it without a cycle.
//
// Presence is intentionally NOT persisted: on a server restart every socket
// reconnects and re-registers, so the map rebuilds itself.

const counts = new Map<number, number>();

// Register a new socket for a user. Returns true only on the offline→online
// transition (first socket), so the caller can broadcast a presence change once.
export function markOnline(userId: number): boolean {
  const n = counts.get(userId) ?? 0;
  counts.set(userId, n + 1);
  return n === 0;
}

// Deregister a socket for a user. Returns true only on the online→offline
// transition (last socket closed), so the caller can broadcast once.
export function markOffline(userId: number): boolean {
  const n = counts.get(userId) ?? 0;
  if (n <= 1) {
    counts.delete(userId);
    return n === 1; // true only if they were actually online
  }
  counts.set(userId, n - 1);
  return false;
}

export function isOnline(userId: number): boolean {
  return (counts.get(userId) ?? 0) > 0;
}

// Test-only — reset the registry between cases.
export function _resetPresence(): void {
  counts.clear();
}
