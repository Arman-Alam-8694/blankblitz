import { useEffect, useRef, useState } from 'react';
import { AVATAR_IDS, NICKNAME_MAX, NICKNAME_MIN, type AvatarChoice } from '@blankblitz/shared';
import { mountGoogleButton, signOut, useAuth } from '../lib/auth';
import { usePrefs } from '../lib/prefs';
import { session } from '../lib/session';
import { toast } from '../lib/store';
import { AVATARS, Avatar } from './Avatar';

/** Nickname + avatar picker + optional Google sign-in. */
export function ProfileCard({ nickname, setNickname }: { nickname: string; setNickname: (n: string) => void }) {
  const auth = useAuth();
  const { theme } = usePrefs();
  const [avatar, setAvatarState] = useState<AvatarChoice>(session.avatar());
  const [picking, setPicking] = useState(false);
  const btnRef = useRef<HTMLDivElement>(null);

  const choose = (a: AvatarChoice) => {
    session.setAvatar(a);
    setAvatarState(a);
    setPicking(false);
  };

  // (Re)render Google's button when signed out; re-render on theme change to match colours.
  useEffect(() => {
    if (auth.profile || !btnRef.current) return;
    void mountGoogleButton(btnRef.current, (m) => toast(m));
  }, [auth.profile, theme, auth.clientId]);

  // After signing in: adopt the Google photo and suggest the first name as nickname.
  useEffect(() => {
    if (!auth.profile) {
      if (avatar === 'google') choose(session.avatar());
      return;
    }
    setAvatarState(session.avatar());
    if (!nickname.trim()) {
      const suggested = auth.profile.name.replace(/[^\p{L}\p{N} _.-]/gu, '').slice(0, NICKNAME_MAX).trim();
      if (suggested.length >= NICKNAME_MIN) setNickname(suggested);
    }
  }, [auth.profile]);

  const usingGoogle = avatar === 'google' && auth.profile;
  return (
    <div className="profile">
      <div className="profile-row">
        <button
          type="button"
          className="avatar-btn"
          onClick={() => setPicking((p) => !p)}
          title="Change avatar"
          aria-label="Change avatar"
          aria-expanded={picking}
        >
          <Avatar avatar={usingGoogle ? null : avatar} picture={usingGoogle ? auth.profile?.picture : null} name={nickname} size={56} />
          <span className="avatar-edit">✎</span>
        </button>
        <label className="field grow">
          <span>Nickname</span>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            minLength={NICKNAME_MIN}
            maxLength={NICKNAME_MAX}
            placeholder="e.g. WordWizard"
            autoFocus
            autoComplete="nickname"
          />
        </label>
      </div>

      {picking && (
        <div className="avatar-grid" role="listbox" aria-label="Pick an avatar">
          {auth.profile?.picture && (
            <button type="button" className={`avatar-opt ${usingGoogle ? 'on' : ''}`} onClick={() => choose('google')} title="Google photo">
              <Avatar avatar={null} picture={auth.profile.picture} size={44} />
            </button>
          )}
          {AVATAR_IDS.map((id) => (
            <button
              key={id}
              type="button"
              className={`avatar-opt ${avatar === id ? 'on' : ''}`}
              onClick={() => choose(id)}
              title={AVATARS[id].label}
            >
              <Avatar avatar={id} size={44} />
            </button>
          ))}
        </div>
      )}

      <div className="signin-row">
        {auth.profile ? (
          <>
            <span className="muted small">Signed in with Google as <b>{auth.profile.name}</b></span>
            <button type="button" className="btn btn-tiny" onClick={() => void signOut()}>
              Sign out
            </button>
          </>
        ) : auth.clientId ? (
          <>
            <span className="muted small">Optional — use your Google photo:</span>
            <div ref={btnRef} className="gsi-btn" />
          </>
        ) : null}
        {auth.busy && <span className="muted small">Signing in…</span>}
      </div>
    </div>
  );
}
