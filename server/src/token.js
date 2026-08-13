import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

export async function buildToken({ room, identity, role, name }) {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error('LIVEKIT_API_KEY / LIVEKIT_API_SECRET are not configured on the server.');
  }

  const at = new AccessToken(apiKey, apiSecret, {
    identity,
    ttl: '6h',
    name: name || identity,
    metadata: JSON.stringify({ role, name: name || identity }),
  });

  if (role === 'host') {
    at.addGrant({
      room,
      roomJoin: true,
      roomCreate: true,
      roomAdmin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      canUpdateMetadata: true,
    });
  } else {
    at.addGrant({
      room,
      roomJoin: true,
      roomCreate: false,
      roomAdmin: false,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
      canUpdateMetadata: false,
    });
  }

  return at.toJwt();
}

let _svc = null;
export function roomService() {
  if (_svc) return _svc;
  const host = process.env.LIVEKIT_URL?.replace(/^wss?:\/\//, '') || '';
  if (!host) throw new Error('LIVEKIT_URL not configured on the server.');
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  _svc = new RoomServiceClient(host, apiKey, apiSecret);
  return _svc;
}