import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { buildToken, roomService } from './token.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;
const TOKEN_API_SECRET = process.env.TOKEN_API_SECRET || '';

const b64url = (s) =>
  Buffer.from(typeof s === 'string' ? s : JSON.stringify(s))
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

const timingSafeEqual = (a, b) => {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
};

function verifyJwt(token) {
  try {
    const [headerB64, payloadB64, sigB64] = token.split('.');
    if (!headerB64 || !payloadB64 || !sigB64) return null;
    const header = JSON.parse(
      Buffer.from(headerB64, 'base64url').toString('utf8'),
    );
    if (header.alg !== 'HS256') return null;

    const signingInput = `${headerB64}.${payloadB64}`;
    const expectedSig = crypto
      .createHmac('sha256', process.env.LIVEKIT_API_SECRET)
      .update(signingInput)
      .digest('base64url');

    if (!timingSafeEqual(expectedSig, sigB64)) return null;

    const payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8'),
    );
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === 'number' && now >= payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function isHostToken(token, room) {
  const p = verifyJwt(token);
  if (!p) return false;
  const grants = p.video || {};
  if (room && grants.room && grants.room !== room) return false;
  return grants.roomAdmin === true;
}

function sendError(res, status, message) {
  res.status(status).json({ error: message });
}

app.get('/api/health', (_req, res) => {
  const ok = !!(process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);
  res.json({
    ok,
    configured: ok,
    livekitUrl: Boolean(process.env.LIVEKIT_URL),
  });
});

app.post('/api/token', async (req, res) => {
  const room = String(req.body?.room || '').trim();
  const identity = String(req.body?.identity || '').trim();
  const role = String(req.body?.role || 'visitor').trim();
  const name = String(req.body?.name || '').trim() || identity;
  const providedSecret = String(req.body?.tokenSecret || '');

  if (!room || !identity) {
    return sendError(res, 400, '`room` and `identity` are required.');
  }
  if (role !== 'host' && role !== 'visitor') {
    return sendError(res, 400, "`role` must be 'host' or 'visitor'.");
  }
  if (TOKEN_API_SECRET && !timingSafeEqual(providedSecret, TOKEN_API_SECRET)) {
    return sendError(res, 401, 'Invalid tokenSecret.');
  }

  try {
    const jwt = await buildToken({ room, identity, role, name });
    res.json({ token: jwt, room, identity, role, livekitUrl: process.env.LIVEKIT_URL || '' });
  } catch (err) {
    console.error('Token mint failed:', err.message);
    sendError(res, 500, 'Could not mint token. Are server env vars set?');
  }
});

app.get('/api/rooms/:room/participants', async (req, res) => {
  const { room } = req.params;
  const token = req.header('x-host-token') || '';
  if (!isHostToken(token, room)) {
    return sendError(res, 403, 'Only a host token with roomAdmin may list participants.');
  }
  try {
    const svc = roomService();
    const participants = await svc.listParticipants(room);
    res.json({
      participants: participants.map((p) => ({
        identity: p.identity,
        name: p.name,
        metadata: p.metadata,
        joinedAt: p.joinedAt,
      })),
    });
  } catch (err) {
    console.error('listParticipants failed:', err.message);
    sendError(res, 502, 'LiveKit room service request failed.');
  }
});

app.post('/api/rooms/:room/participants/:identity/remove', async (req, res) => {
  const { room, identity } = req.params;
  const token = req.header('x-host-token') || '';
  if (!isHostToken(token, room)) {
    return sendError(res, 403, 'Only a host with roomAdmin may remove participants.');
  }
  try {
    await roomService().removeParticipant(room, identity);
    res.json({ ok: true, removed: identity });
  } catch (err) {
    console.error('removeParticipant failed:', err.message);
    sendError(res, 502, 'Could not remove participant.');
  }
});

app.post('/api/rooms/:room/participants/:identity/mute', async (req, res) => {
  const { room, identity } = req.params;
  const token = req.header('x-host-token') || '';
  if (!isHostToken(token, room)) {
    return sendError(res, 403, 'Only a host with roomAdmin may mute tracks.');
  }
  const muted = Boolean(req.body?.muted);
  try {
    await roomService().mutePublishedTrack(room, identity, '', muted);
    res.json({ ok: true, identity, muted });
  } catch (err) {
    console.error('mutePublishedTrack failed:', err.message);
    sendError(res, 502, 'Could not mute track. (Is the participant publishing?)');
  }
});

app.listen(PORT, () => {
  console.log(`LiveKit token server listening on http://localhost:${PORT}`);
  const configured = !!(process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);
  console.log(configured ? '✓ LiveKit credentials configured.' : '⚠ LIVEKIT_API_KEY/SECRET not set — /api/token will fail.');
});