import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchToken } from '../api.js';
import { makeRoomCode } from '../lib/roles.js';

export default function Lobby({ onJoined }) {
  const [room, setRoom] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('visitor');
  const [cameras, setCameras] = useState([]);
  const [mics, setMics] = useState([]);
  const [camId, setCamId] = useState('');
  const [micId, setMicId] = useState('');
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [micLevel, setMicLevel] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(0);
  const ctxRef = useRef(null);
  const analyserRef = useRef(null);

  const enumerate = useCallback(async () => {
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      setCameras(devs.filter((d) => d.kind === 'videoinput'));
      setMics(devs.filter((d) => d.kind === 'audioinput'));
    } catch {
      /* ignore */
    }
  }, []);

  const startPreview = useCallback(async () => {
    stopPreview();
    setError('');

    const tryGetUserMedia = async (wantVideo) => {
      const constraints = {
        video: wantVideo && (camId ? { deviceId: { exact: camId } } : true),
        audio: micOn && (micId ? { deviceId: { exact: micId } } : true),
      };
      return navigator.mediaDevices.getUserMedia(constraints);
    };

    let stream;
    let hadVideoError = false;
    try {
      stream = await tryGetUserMedia(camOn);
    } catch (err) {
      if (camOn && micOn && (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError' || err?.name === 'NotReadableError' || err?.name === 'OverconstrainedError')) {
        hadVideoError = true;
        try {
          stream = await tryGetUserMedia(false);
        } catch (err2) {
          setError('Could not access microphone: ' + (err2?.message || 'permission denied.'));
          return;
        }
      } else {
        setError('Could not access camera/mic: ' + (err?.message || 'permission denied.'));
        return;
      }
    }

    if (hadVideoError) {
      console.warn('No camera found — continuing audio-only.');
    }

    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => {});
    }

if (micOn) {
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length) {
        try {
          const AC = window.AudioContext || window.webkitAudioContext;
          const ctx = new AC();
          const src = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          src.connect(analyser);
          ctxRef.current = ctx;
          analyserRef.current = analyser;
          const data = new Uint8Array(analyser.frequencyBinCount);
          const tick = () => {
            analyser.getByteTimeDomainData(data);
            let sum = 0;
            for (let i = 0; i < data.length; i++) {
              const v = (data[i] - 128) / 128;
              sum += v * v;
            }
            setMicLevel(Math.min(1, Math.sqrt(sum / data.length) * 3));
            rafRef.current = requestAnimationFrame(tick);
          };
          rafRef.current = requestAnimationFrame(tick);
        } catch {
          /* analyser optional */
        }
      }
    }
    await enumerate();
  }, [camOn, camId, micOn, micId, enumerate]);

  const stopPreview = () => {
    cancelAnimationFrame(rafRef.current);
    if (ctxRef.current) {
      ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
      analyserRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    startPreview();
    return stopPreview;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    startPreview();
    return stopPreview;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camOn, camId, micOn, micId]);

  const handleJoin = async () => {
    setError('');
    const finalRoom = (room || makeRoomCode()).trim();
    const identity = (
      name.trim() ||
      `${role}-${Math.random().toString(36).slice(2, 6)}`
    ).trim();
    setBusy(true);
    try {
      const { token } = await fetchToken({
        room: finalRoom,
        identity,
        role,
        name: name.trim() || identity,
      });
      stopPreview();
      onJoined({
        room: finalRoom,
        identity,
        role,
        token,
        devices: { camId, micId, camOn, micOn },
      });
    } catch (err) {
      setError(err.message || 'Failed to join.');
    } finally {
      setBusy(false);
    }
  };

  const micPct = Math.round(micLevel * 100);

  return (
    <div className="screen">
      <div className="card">
        <h1>Join a session</h1>
        <p className="sub">
          Hosts create &amp; moderate a room; visitors join an existing one.
        </p>

        <div className="roles">
          <button
            type="button"
            className={'role-btn' + (role === 'host' ? ' active' : '')}
            onClick={() => setRole('host')}
          >
            <span className="t">Host</span>
            <span className="d">Create / open the room, moderate participants.</span>
          </button>
          <button
            type="button"
            className={'role-btn' + (role === 'visitor' ? ' active' : '')}
            onClick={() => setRole('visitor')}
          >
            <span className="t">Visitor</span>
            <span className="d">Join an existing room by its code.</span>
          </button>
        </div>

        <div className="row">
          <div className="field">
            <label>Your name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alex"
              maxLength={40}
            />
          </div>
          <div className="field">
            <label>Room code</label>
            <input
              value={room}
              onChange={(e) => setRoom(e.target.value.toUpperCase())}
              placeholder={role === 'host' ? 'Leave blank to generate' : 'ROOM-XXXX'}
              maxLength={24}
            />
          </div>
        </div>

        <div className="preview" aria-label="Camera preview">
          <video ref={videoRef} muted playsInline autoPlay />
          {!camOn && <div className="novideo">Camera off</div>}
          <span className={'badge ' + (camOn ? 'on' : 'off')}>
            {camOn ? 'cam on' : 'cam off'}
          </span>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              height: 8,
              borderRadius: 999,
              background: 'var(--panel-2)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${micPct}%`,
                background:
                  'linear-gradient(90deg, var(--ok), #f3c04a, var(--danger))',
                transition: 'width 0.05s linear',
              }}
            />
          </div>
        </div>

        <div className="row">
          <div className="field">
            <label>Camera</label>
            <select
              value={camId}
              onChange={(e) => setCamId(e.target.value)}
            >
              <option value="">Default</option>
              {cameras.map((c) => (
                <option key={c.deviceId} value={c.deviceId}>
                  {c.label || 'Camera'}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Microphone</label>
            <select value={micId} onChange={(e) => setMicId(e.target.value)}>
              <option value="">Default</option>
              {mics.map((m) => (
                <option key={m.deviceId} value={m.deviceId}>
                  {m.label || 'Mic'}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="row" style={{ marginBottom: 16 }}>
          <button
            type="button"
            className={'btn secondary' + (camOn ? '' : ' off')}
            onClick={() => setCamOn((v) => !v)}
          >
            {camOn ? 'Camera: On' : 'Camera: Off'}
          </button>
          <button
            type="button"
            className={'btn secondary' + (micOn ? '' : ' off')}
            onClick={() => setMicOn((v) => !v)}
          >
            {micOn ? 'Mic: On' : 'Mic: Off'}
          </button>
        </div>

        <button className="btn" disabled={busy} onClick={handleJoin}>
          {busy ? 'Joining…' : role === 'host' ? 'Create & join room' : 'Join room'}
        </button>

        {error && <div className="error">{error}</div>}
      </div>
    </div>
  );
}