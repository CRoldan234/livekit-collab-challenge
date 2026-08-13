import { useCallback, useState } from 'react';
import Lobby from './components/Lobby.jsx';
import RoomView from './components/RoomView.jsx';

export default function App() {
  const [screen, setScreen] = useState('lobby');
  const [session, setSession] = useState(null);

  const handleJoined = useCallback((s) => {
    setSession(s);
    setScreen('call');
  }, []);

  const handleLeave = useCallback(() => {
    setSession(null);
    setScreen('lobby');
  }, []);

  return (
    <div className="app-shell">
      <header className="topbar">
        <span className="brand">LiveKit&nbsp;Collab</span>
        <span className="spacer" />
        {screen === 'call' && session && (
          <span className="roomchip">
            Room&nbsp;<b>{session.room}</b>
          </span>
        )}
      </header>

      {screen === 'lobby' && <Lobby onJoined={handleJoined} />}
      {screen === 'call' && session && (
        <RoomView session={session} onLeave={handleLeave} />
      )}
    </div>
  );
}