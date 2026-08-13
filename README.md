# LiveKit Collab

App de video colaboración en tiempo real usando LiveKit Cloud. La idea es replicar algo tipo Microsoft Teams, donde hay un host que crea la sesión y visitors que se unen con un código. Pensada para correr sola o embebida en un iframe.

Implementa Level 1 (core), Level 2 (multi-participante + roles host/visitor reales) y parte de Level 3 (moderación, lista de participantes con calidad de conexión, reconexión).

```
.
├── server/   Backend Express que genera los tokens de LiveKit (el secret vive acá)
├── client/   Frontend en Vite + React (preview, join, UI de la llamada)
└── .env      Config compartida (ver .env.example) — no se commitea
```

## Cómo correrlo

### 1. Credenciales de LiveKit
Crear un proyecto gratuito en [LiveKit Cloud](https://cloud.livekit.io). Copiar el **API Key**, **API Secret** y la **URL** (`wss://...`).

### 2. Configurar el .env
Copiar `.env.example` a `.env` en la raíz y llenar los valores:

```bash
cp .env.example .env
```

```ini
LIVEKIT_API_KEY=APIxxxxxxxxxxxxxxxx
LIVEKIT_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
LIVEKIT_URL=wss://tu-proyecto.livekit.cloud
PORT=4000
TOKEN_API_SECRET=

VITE_TOKEN_ENDPOINT=http://localhost:4000/api/token
VITE_LIVEKIT_URL=wss://tu-proyecto.livekit.cloud
```

El `.env` lo comparten server y client. Vite lee las variables con prefijo `VITE_` y las pasa al browser; el secret nunca llega ahí.

### 3. Instalar y correr

```bash
npm run install:all   # instala server, client y dependencias raíz
npm run dev           # levanta backend (:4000) y frontend (:5173)
```

Abrir http://localhost:5173.

- **Host**: elegir Host, dejar room vacío para que se genere solo, entrar y compartir el código.
- **Visitor**: elegir Visitor, poner el código que le dio el host, entrar.

## Arquitectura

```
Browser (React)  →  POST /api/token  →  Express (livekit-server-sdk)
     ↓                                          ↑
     ↓ wss:// (media vía JWT)            API key + secret (server-side)
     ↓
LiveKit Cloud
```

El backend tiene el API secret y firma los tokens. El browser recibe un JWT válido por 6 horas y se conecta a LiveKit Cloud para el audio/video. No hay forma de que el secret llegue al cliente.

### Roles con grants distintos en el token

El rol no es solo visual: está metido en los grants del JWT que LiveKit respeta.

| Grant | Host | Visitor | Para qué |
|-------|:----:|:-------:|----------|
| `roomJoin` | si | si | Permite unirse a la sala |
| `roomCreate` | si | no | Solo el host crea la sala al entrar |
| `roomAdmin` | si | no | Solo el host puede moderar |
| `canPublishData` | si | no | Solo el host usa data channels |
| `canUpdateMetadata` | si | no | Solo el host cambia metadata |
| `canPublish` / `canSubscribe` | si | si | Ambos hablan y se ven |

El rol también va en el metadata firmado del token (`{role, name}`), así que el frontend lo lee desde ahí y no del propio estado del browser. Un visitor no puede fingir ser host.

### Moderación

Los endpoints de moderación (`remove participant`, `mute track`) son server-enforced. El cliente manda su JWT en el header `x-host-token`; el server verifica la firma HMAC y que tenga `roomAdmin` para esa sala. Si un visitor lo intenta, recibe `403`.

## Qué está implementado

**Level 1 — Core**
- Endpoint `POST /api/token` que genera tokens server-side
- Llamada 1:1+ con audio y video bidireccional
- Controles: mute/unmute mic, cámara on/off, leave

**Level 2 — Expected**
- Salas multi-participante (grid de 1 a 3 columnas)
- Host vs visitor con permisos distintos en el token (no solo UI)
- El host crea la sesión, los visitors entran con un código de sala

**Level 3 — Stretch**
- Moderación: remove participant (server-enforced, visitor recibe 403)
- Lista de participantes con presencia y estado de conexión
- Indicadores de calidad de conexión (excellent/good/poor/lost)
- Reconexión automática con banner visible

**Preview antes de entrar**
- Preview de cámara con `getUserMedia`
- Medidor de nivel de micrófono con WebAudio
- Selectores de cámara y micrófono (los device IDs se reusan en la llamada real)

## Decisiones de diseño

- **Un solo `.env` en la raiz** para server y client. Vite lo lee con `envDir: '../'`. Más simple que tener dos archivos.
- **Preview con `getUserMedia` nativo** en vez de una sala LiveKit. Así no conecta nada a LiveKit hasta que el usuario clica Join. Los device IDs seleccionados se pasan directo al `LiveKitRoom`.
- **Tiles custom en vez del `<VideoConference>` prebuilt.** El componente prebuilt es rápido pero no te deja controlar los badges de rol, calidad de conexión ni los botones de moderación. Preferí hacer los tiles a mano.
- **Moderación verificando el JWT del host.** El server valida la firma del JWT y chequea `roomAdmin`. No es auth federada, pero para la demo alcanza y el enforcement es real.
- **Hooks del SDK** (`useParticipants`, `useLocalParticipant`, `useConnectionState`) para no reimplementar cosas que ya funcionan.

## Supuestos

- La app corre dentro de un iframe. No usa APIs de top-level ni depende de fullscreen.
- LiveKit Cloud free tier es suficiente, no hace falta self-host.
- Para moderación, se asume que el browser manda su propio JWT y el server lo re-verifica. Auth federada del host queda fuera del scope.
- Los códigos de sala son cortos (`ROOM-XXXX`). La probabilidad de colisión es aceptable para una demo.

## Qué faltaría

- Chat in-call con data channels (los grants ya están preparados)
- Screen sharing
- Waiting room / admit-from-lobby
- Mute de un participante desde el host (el endpoint del server ya existe, falta el botón en la UI)
- Deploy (Vercel + Fly/Railway) y CI
- Code-splitting del bundle de LiveKit (723kb está ok para demo pero no para producción)