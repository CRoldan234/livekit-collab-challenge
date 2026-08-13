export function parseRole(metadata) {
  try {
    const parsed = metadata ? JSON.parse(metadata) : {};
    return parsed.role === 'host' ? 'host' : 'visitor';
  } catch {
    return 'visitor';
  }
}

export function parseName(metadata, fallback) {
  try {
    const parsed = metadata ? JSON.parse(metadata) : {};
    return parsed.name || fallback;
  } catch {
    return fallback;
  }
}

export function makeRoomCode() {
  const a = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `ROOM-${a}`;
}