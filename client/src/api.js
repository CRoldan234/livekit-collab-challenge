const TOKEN_ENDPOINT =
  import.meta.env.VITE_TOKEN_ENDPOINT || '/api/token';

export function getTokenSecret() {
  return import.meta.env.VITE_TOKEN_API_SECRET || '';
}

export async function fetchToken({ room, identity, role, name }) {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      room,
      identity,
      role,
      name,
      tokenSecret: getTokenSecret(),
    }),
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body.error || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  const data = await res.json();
  return data;
}

export async function hostRemoveParticipant(token, room, identity) {
  const res = await fetch(
    `/api/rooms/${encodeURIComponent(room)}/participants/${encodeURIComponent(identity)}/remove`,
    {
      method: 'POST',
      headers: {
        'x-host-token': token,
        'content-type': 'application/json',
      },
    },
  );
  return res.json();
}