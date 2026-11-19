import { roomCodeFromPath, usePath } from './lib/router';
import { useStore } from './lib/store';
import { Landing } from './pages/Landing';
import { RoomPage } from './pages/RoomPage';
import { Toasts } from './components/Toasts';

export function App() {
  const path = usePath();
  const code = roomCodeFromPath(path);
  const connected = useStore((s) => s.connected);
  return (
    <div className="app">
      {!connected && <div className="banner">Connecting to server…</div>}
      {code ? <RoomPage key={code} code={code} /> : <Landing />}
      <Toasts />
    </div>
  );
}
