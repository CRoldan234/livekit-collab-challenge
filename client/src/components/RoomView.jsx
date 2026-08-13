import { useEffect, useReducer, useRef, useState } from 'react';
import {
  LiveKitRoom,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
  useConnectionState,
  RoomAudioRenderer,
} from '@livekit/components-react';
import {
  RoomEvent,
  Track,
  ConnectionQuality,
} from 'livekit-client';
import { parseName, parseRole } from '../lib/roles.js';
import { hostRemoveParticipant } from '../api.js';

const SERVER_URL = import.meta.env.VITE_LIVEKIT_URL || '';

function useRoomTick() {
  const room = useRoomContext();
  const [, force] = useReducer((n) => n + 1, 0);
  useEffect(() => {
    if (!room) return;
    const handler = () => force();
    const events = [
      RoomEvent.TrackPublished,
      RoomEvent.TrackUnpublished,
      RoomEvent.TrackSubscribed,
      RoomEvent.TrackUnsubscribed,
      RoomEvent.TrackMuted,
      RoomEvent.TrackUnmuted,
      RoomEvent.ParticipantConnected,
      RoomEvent.ParticipantDisconnected,
      RoomEvent.ParticipantMetadataChanged,
      RoomEvent.ConnectionQualityChanged,
      RoomEvent.LocalTrackPublished,
      RoomEvent.LocalTrackUnpublished,
    ];
    events.forEach((e) => room.on(e, handler));
    return () => events.forEach((e) => room.off(e, handler));
  }, [room]);
  return null;
}

function qualityClass(q) {
  if (q === ConnectionQuality.Excellent || q === ConnectionQuality.Good) return 'q-good';
  if (q === ConnectionQuality.Poor || q === ConnectionQuality.Lost) return 'q-poor';
  return '';
}
function qualityLabel(q) {
  const map = {
    [ConnectionQuality.Excellent]: 'excellent',
    [ConnectionQuality.Good]: 'good',
    [ConnectionQuality.Poor]: 'poor',
    [ConnectionQuality.Lost]: 'lost',
    [ConnectionQuality.Unknown]: '—',
  };
  return map[q] ?? '—';
}

function ParticipantTile({ participant, isHostViewer, objectId, token, room }) {
  const videoRef = useRef(null);
  const role = parseRole(participant.metadata);
  const fname = parseName(participant.metadata, participant.identity);
  const camPub = participant.getTrackPublication(Track.Source.Camera);
  const micPub = participant.getTrackPublication(Track.Source.Microphone);
  const hasVideo =
    camPub && camPub.track && camPub.isEnabled !== false && camPub.isSubscribed !== false;
  const micOn = micPub ? micPub.isEnabled !== false : false;

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (hasVideo && camPub.track) {
      camPub.track.attach(el);
      return () => camPub.track.detach(el);
    }
    try {
      el.srcObject = null;
    } catch { }
  }, [hasVideo, camPub, participant]);

  const canRemove = isHostViewer && role === 'visitor' && objectId !== participant.identity;

  return (
    <div className={'tile' + (role === 'visitor' ? ' is-visitor' : '')}>
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        style={{ display: hasVideo ? 'block' : 'none' }}
      />
      {!hasVideo && (
        <div className="avatar">{(fname || participant.identity).slice(0, 1).toUpperCase()}</div>
      )}

      <div className={'quality ' + qualityClass(participant.connectionQuality)}>
        {qualityLabel(participant.connectionQuality)}
      </div>

      <div className="info">
        <span className="name">{fname || participant.identity}</span>
        <span className={'rolechip ' + role}>{role}</span>
        <span className="micoff">{micOn ? '' : '🔇'}</span>
      </div>

      {canRemove && (
        <button
          className="mkbtn show"
          title="Remove participant (host)"
          onClick={() =>
            hostRemoveParticipant(token, room, participant.identity)
          }
        >
          Remove
        </button>
      )}
    </div>
  );
}

function Controls({ onLeave }) {
  const room = useRoomContext();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } =
    useLocalParticipant();

  const toggleMic = async () => {
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } catch (e) {
      console.warn('mic toggle failed', e);
    }
  };
  const toggleCam = async () => {
    try {
      await localParticipant.setCameraEnabled(!isCameraEnabled);
    } catch (e) {
      console.warn('cam toggle failed', e);
    }
  };
  const leave = () => {
    room?.disconnect(false);
    onLeave();
  };

  return (
    <div className="controls">
      <button
        className={'ctrl ' + (isMicrophoneEnabled ? 'on' : 'off')}
        onClick={toggleMic}
      >
        {isMicrophoneEnabled ? '🎙️ Mic on' : '🔇 Mic off'}
      </button>
      <button
        className={'ctrl ' + (isCameraEnabled ? 'on' : 'off')}
        onClick={toggleCam}
      >
        {isCameraEnabled ? '📷 Cam on' : '📵 Cam off'}
      </button>
      <button className="ctrl leave" onClick={leave}>
        ⏏ Leave
      </button>
    </div>
  );
}

function ReconnectBanner() {
  const state = useConnectionState();
  if (state === 'reconnecting') {
    return (
      <div className="reconnect">
        Reconnecting… (LiveKit will resume when the network returns)
      </div>
    );
  }
  return null;
}

function CallInner({ session, onLeave }) {
  useRoomTick();
  const participants = useParticipants();

  const cols = Math.min(3, Math.max(1, participants.length));
  const isHost = session.role === 'host';

  return (
    <>
      <ReconnectBanner />
      <div className="call">
        <div className={`stage cols-${cols}`}>
            {participants.map((p) => (
              <ParticipantTile
                key={p.identity}
                participant={p}
                isHostViewer={isHost}
                objectId={session.identity}
                token={session.token}
                room={session.room}
              />
            ))}
        </div>

        <div className="side">
            <div className="panel">
              <h3>Participants ({participants.length})</h3>
              <div className="pplist">
                {participants.map((p) => {
                  const r = parseRole(p.metadata);
                  const nm = parseName(p.metadata, p.identity);
                  const you = p.identity === session.identity;
                  return (
                    <div key={p.identity} className={'pp' + (you ? ' you' : '')}>
                      <span className={'dot ' + qualityClass(p.connectionQuality)} />
                      <span className="nm">{nm || p.identity}</span>
                      {you && <span style={{ color: 'var(--muted)' }}>· you</span>}
                      <span className="rl">{r}</span>
                      {isHost && !you && r === 'visitor' && (
                        <button
                          className="xbtn"
                          title="Remove participant (host)"
                          onClick={() =>
                            hostRemoveParticipant(session.token, session.room, p.identity)
                          }
                        >
                          remove
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="panel">
              <h3>Controls</h3>
              <Controls onLeave={onLeave} />
              {!isHost && (
                <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 10 }}>
                  You joined as a visitor — you can speak and be seen, but cannot
                  moderate the room.
                </p>
              )}
            </div>
        </div>
      </div>
    </>
  );
}

export default function RoomView({ session, onLeave }) {
  const { devices } = session;
  const [connError, setConnError] = useState('');
  const connectedOnceRef = useRef(false);

  const audio =
    devices && devices.micOn
      ? devices.micId
        ? { deviceId: { exact: devices.micId } }
        : true
      : false;
  const video =
    devices && devices.camOn
      ? devices.camId
        ? { deviceId: { exact: devices.camId } }
        : true
      : false;

  return (
    <LiveKitRoom
      token={session.token}
      serverUrl={SERVER_URL}
      connect={true}
      audio={audio}
      video={video}
      options={{
        autoSubscribe: true,
        adaptiveStream: true,
        dynacast: true,
      }}
      onError={(err) => {
        console.error('LiveKit error:', err);
        setConnError(err.message);
      }}
      onConnected={() => {
        connectedOnceRef.current = true;
        setConnError('');
        console.log('LiveKit connected OK');
      }}
      onDisconnected={(reason) => {
        console.log('LiveKit disconnected, reason:', reason, 'connectedOnce:', connectedOnceRef.current);
        if (connectedOnceRef.current) {
          onLeave();
        }
      }}
    >
      <RoomAudioRenderer />
      <CallInner session={session} onLeave={onLeave} />
      {connError && (
        <div style={{
          position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--panel)', border: '1px solid var(--danger)',
          borderRadius: 12, padding: 16, maxWidth: 500, zIndex: 100,
        }}>
          <div style={{ color: 'var(--danger)', fontWeight: 700, marginBottom: 8 }}>
            Connection failed: {connError}
          </div>
          <button className="btn secondary" style={{ width: 'auto', padding: '8px 16px' }} onClick={onLeave}>
            Back to lobby
          </button>
        </div>
      )}
    </LiveKitRoom>
  );
}