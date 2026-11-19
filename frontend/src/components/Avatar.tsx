/**
 * Minimal, slightly silly avatars drawn as inline SVG — no image downloads, no third-party
 * service, no licensing cost. Each preset is a small recipe of face parts.
 */
import { useState } from 'react';
import type { AvatarId } from '@blankblitz/shared';

type Hair =
  | 'spiky' | 'short' | 'side' | 'curly' | 'mohawk' | 'bald' | 'afro'
  | 'long' | 'bob' | 'bun' | 'ponytail' | 'pigtails';
type Eyes = 'dots' | 'wink' | 'happy' | 'sleepy' | 'shades' | 'glasses' | 'wide';
type Mouth = 'grin' | 'tongue' | 'smirk' | 'shock' | 'flat' | 'laugh';
type Extra = 'mustache' | 'beard' | 'blush' | 'freckles';

interface Recipe {
  label: string;
  bg: string;
  skin: string;
  hair: Hair;
  hairColor: string;
  eyes: Eyes;
  mouth: Mouth;
  extras?: Extra[];
}

const SKIN = { light: '#f9d7b5', tan: '#e7b48a', medium: '#c98e5c', brown: '#9a6239', deep: '#6b4226' };
const HAIR = {
  black: '#1f1b1a', brown: '#5b3a1e', blond: '#e8c35a', ginger: '#c6531f', green: '#22c55e',
  pink: '#f472b6', purple: '#8b5cf6', red: '#dc2626', grey: '#9ca3af',
};

export const AVATARS: Record<AvatarId, Recipe> = {
  m1: { label: 'Spike', bg: '#bfdbfe', skin: SKIN.light, hair: 'spiky', hairColor: HAIR.brown, eyes: 'dots', mouth: 'grin' },
  m2: { label: 'Cool Cat', bg: '#fde68a', skin: SKIN.medium, hair: 'short', hairColor: HAIR.black, eyes: 'shades', mouth: 'smirk' },
  m3: { label: 'Big Stache', bg: '#fecaca', skin: SKIN.brown, hair: 'bald', hairColor: HAIR.black, eyes: 'happy', mouth: 'laugh', extras: ['mustache'] },
  m4: { label: 'Punk', bg: '#ddd6fe', skin: SKIN.tan, hair: 'mohawk', hairColor: HAIR.green, eyes: 'wide', mouth: 'tongue' },
  m5: { label: 'Nerd', bg: '#bbf7d0', skin: SKIN.light, hair: 'side', hairColor: HAIR.blond, eyes: 'glasses', mouth: 'shock' },
  m6: { label: 'Sleepy', bg: '#e9d5ff', skin: SKIN.deep, hair: 'curly', hairColor: HAIR.black, eyes: 'sleepy', mouth: 'flat' },
  m7: { label: 'Winky', bg: '#fed7aa', skin: SKIN.light, hair: 'short', hairColor: HAIR.ginger, eyes: 'wink', mouth: 'grin', extras: ['freckles'] },
  m8: { label: 'Groovy', bg: '#a5f3fc', skin: SKIN.brown, hair: 'afro', hairColor: HAIR.brown, eyes: 'dots', mouth: 'laugh', extras: ['beard'] },
  f1: { label: 'Sunny', bg: '#fef08a', skin: SKIN.light, hair: 'long', hairColor: HAIR.brown, eyes: 'happy', mouth: 'grin', extras: ['blush'] },
  f2: { label: 'Boss', bg: '#fbcfe8', skin: SKIN.medium, hair: 'bob', hairColor: HAIR.black, eyes: 'shades', mouth: 'smirk' },
  f3: { label: 'Bun Bun', bg: '#c7d2fe', skin: SKIN.tan, hair: 'bun', hairColor: HAIR.pink, eyes: 'wink', mouth: 'tongue' },
  f4: { label: 'Gasp', bg: '#bae6fd', skin: SKIN.light, hair: 'ponytail', hairColor: HAIR.blond, eyes: 'wide', mouth: 'shock' },
  f5: { label: 'Pippi', bg: '#d9f99d', skin: SKIN.light, hair: 'pigtails', hairColor: HAIR.red, eyes: 'dots', mouth: 'laugh', extras: ['freckles'] },
  f6: { label: 'Smarty', bg: '#fecdd3', skin: SKIN.deep, hair: 'afro', hairColor: HAIR.black, eyes: 'glasses', mouth: 'smirk' },
  f7: { label: 'Dreamy', bg: '#e0e7ff', skin: SKIN.brown, hair: 'long', hairColor: HAIR.purple, eyes: 'sleepy', mouth: 'flat', extras: ['blush'] },
  f8: { label: 'Giggles', bg: '#ffedd5', skin: SKIN.tan, hair: 'bob', hairColor: HAIR.ginger, eyes: 'happy', mouth: 'laugh' },
};

const INK = '#1f2937';

/** Hair drawn behind the head (long styles). */
function HairBack({ hair, color }: { hair: Hair; color: string }) {
  switch (hair) {
    case 'long':
      return <path d="M10 34 Q8 10 32 10 Q56 10 54 34 L56 60 L42 60 L44 36 L20 36 L22 60 L8 60 Z" fill={color} />;
    case 'bob':
      return <path d="M10 30 Q10 9 32 9 Q54 9 54 30 L54 47 Q49 51 45 47 L45 32 L19 32 L19 47 Q15 51 10 47 Z" fill={color} />;
    case 'afro':
      return <circle cx="32" cy="28" r="25" fill={color} />;
    case 'ponytail':
      return <path d="M48 18 Q62 22 58 44 Q55 36 50 32 Z" fill={color} />;
    case 'pigtails':
      return (
        <>
          <circle cx="10" cy="32" r="7" fill={color} />
          <circle cx="54" cy="32" r="7" fill={color} />
        </>
      );
    case 'bun':
      return <circle cx="32" cy="9" r="7" fill={color} />;
    default:
      return null;
  }
}

/** Hair drawn on top of the head. */
function HairFront({ hair, color }: { hair: Hair; color: string }) {
  switch (hair) {
    case 'spiky':
      return <path d="M12 30 L15 15 L21 21 L26 10 L31 18 L37 8 L41 18 L48 12 L52 30 Q32 18 12 30 Z" fill={color} />;
    case 'short':
    case 'ponytail':
    case 'pigtails':
    case 'bun':
      return <path d="M12 30 Q12 12 32 12 Q52 12 52 30 Q46 20 32 20 Q18 20 12 30 Z" fill={color} />;
    case 'side':
      return <path d="M12 31 Q10 12 34 12 Q54 13 52 30 Q50 22 40 22 Q29 22 26 16 Q22 25 12 31 Z" fill={color} />;
    case 'curly':
      return (
        <g fill={color}>
          {[14, 20, 26, 32, 38, 44, 50].map((x, i) => (
            <circle key={x} cx={x} cy={i % 2 ? 15 : 19} r="6" />
          ))}
        </g>
      );
    case 'mohawk':
      return <path d="M28 4 Q32 0 36 4 L37 21 L27 21 Z" fill={color} />;
    case 'long':
    case 'bob':
      return <path d="M12 30 Q14 12 32 12 Q50 12 52 30 Q44 18 32 22 Q20 18 12 30 Z" fill={color} />;
    case 'afro':
      return <path d="M12 26 Q20 14 32 15 Q44 14 52 26 Q44 21 32 22 Q20 21 12 26 Z" fill={color} />;
    case 'bald':
      return <path d="M20 19 Q26 15 30 17" stroke="#fff" strokeOpacity="0.5" strokeWidth="2" fill="none" strokeLinecap="round" />;
  }
}

function EyesPart({ eyes }: { eyes: Eyes }) {
  const s = { stroke: INK, strokeWidth: 2.4, fill: 'none', strokeLinecap: 'round' as const };
  switch (eyes) {
    case 'dots':
      return (
        <g fill={INK}>
          <circle cx="25" cy="32" r="2.6" />
          <circle cx="39" cy="32" r="2.6" />
        </g>
      );
    case 'wide':
      return (
        <g>
          <circle cx="25" cy="31" r="4.5" fill="#fff" stroke={INK} strokeWidth="1.5" />
          <circle cx="39" cy="31" r="4.5" fill="#fff" stroke={INK} strokeWidth="1.5" />
          <circle cx="25" cy="31" r="2" fill={INK} />
          <circle cx="39" cy="31" r="2" fill={INK} />
        </g>
      );
    case 'wink':
      return (
        <g>
          <path d="M22 32 Q25 29 28 32" {...s} />
          <circle cx="39" cy="32" r="2.6" fill={INK} />
        </g>
      );
    case 'happy':
      return (
        <g>
          <path d="M22 33 Q25 28 28 33" {...s} />
          <path d="M36 33 Q39 28 42 33" {...s} />
        </g>
      );
    case 'sleepy':
      return (
        <g>
          <path d="M22 32 Q25 35 28 32" {...s} />
          <path d="M36 32 Q39 35 42 32" {...s} />
          <text x="46" y="20" fontSize="8" fontWeight="700" fill={INK}>z</text>
        </g>
      );
    case 'shades':
      return (
        <g fill={INK}>
          <rect x="18" y="28" width="12" height="7" rx="2" />
          <rect x="34" y="28" width="12" height="7" rx="2" />
          <rect x="29" y="29.5" width="6" height="2" />
          <rect x="20" y="29" width="4" height="1.6" fill="#fff" opacity="0.6" />
        </g>
      );
    case 'glasses':
      return (
        <g>
          <circle cx="25" cy="32" r="5.5" fill="#fff" fillOpacity="0.35" stroke={INK} strokeWidth="1.8" />
          <circle cx="39" cy="32" r="5.5" fill="#fff" fillOpacity="0.35" stroke={INK} strokeWidth="1.8" />
          <path d="M30.5 32 L33.5 32" stroke={INK} strokeWidth="1.8" />
          <circle cx="25" cy="32" r="1.8" fill={INK} />
          <circle cx="39" cy="32" r="1.8" fill={INK} />
        </g>
      );
  }
}

function MouthPart({ mouth }: { mouth: Mouth }) {
  switch (mouth) {
    case 'grin':
      return <path d="M25 40 Q32 48 39 40 Z" fill="#7f1d1d" />;
    case 'laugh':
      return (
        <g>
          <path d="M23 39 Q32 52 41 39 Z" fill="#7f1d1d" />
          <path d="M25 39.5 L39 39.5 L38 41.5 L26 41.5 Z" fill="#fff" />
        </g>
      );
    case 'tongue':
      return (
        <g>
          <path d="M25 40 Q32 46 39 40" stroke={INK} strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <path d="M30 42.5 Q30 49 33.5 49 Q37 49 36.5 42.5 Z" fill="#f43f5e" />
        </g>
      );
    case 'smirk':
      return <path d="M26 43 Q33 46 39 40" stroke={INK} strokeWidth="2.2" fill="none" strokeLinecap="round" />;
    case 'shock':
      return <ellipse cx="32" cy="43" rx="3.2" ry="4.2" fill="#7f1d1d" />;
    case 'flat':
      return <path d="M27 43 L37 43" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />;
  }
}

function Extras({ extras, hairColor }: { extras: Extra[]; hairColor: string }) {
  return (
    <>
      {extras.includes('beard') && <path d="M13 36 Q16 56 32 56 Q48 56 51 36 Q46 46 32 46 Q18 46 13 36 Z" fill={hairColor} />}
      {extras.includes('mustache') && (
        <path d="M22 40 Q27 35 32 39 Q37 35 42 40 Q37 38.5 32 41 Q27 38.5 22 40 Z" fill={HAIR.black} />
      )}
      {extras.includes('blush') && (
        <g fill="#fb7185" opacity="0.45">
          <ellipse cx="19" cy="39" rx="3.5" ry="2.2" />
          <ellipse cx="45" cy="39" rx="3.5" ry="2.2" />
        </g>
      )}
      {extras.includes('freckles') && (
        <g fill="#b45309" opacity="0.6">
          {[[20, 37], [23, 39], [18, 40], [44, 37], [41, 39], [46, 40]].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="0.9" />
          ))}
        </g>
      )}
    </>
  );
}

function PresetSvg({ recipe }: { recipe: Recipe }) {
  const { bg, skin, hair, hairColor, eyes, mouth, extras = [] } = recipe;
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="32" fill={bg} />
      <HairBack hair={hair} color={hairColor} />
      <circle cx="12.5" cy="35" r="4" fill={skin} />
      <circle cx="51.5" cy="35" r="4" fill={skin} />
      <circle cx="32" cy="34" r="20" fill={skin} />
      <Extras extras={extras.filter((e) => e === 'beard')} hairColor={hairColor} />
      <HairFront hair={hair} color={hairColor} />
      <EyesPart eyes={eyes} />
      <MouthPart mouth={mouth} />
      <Extras extras={extras.filter((e) => e !== 'beard')} hairColor={hairColor} />
    </svg>
  );
}

function BotSvg() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="32" fill="#cbd5e1" />
      <path d="M32 8 L32 15" stroke="#475569" strokeWidth="2.5" />
      <circle cx="32" cy="7" r="3" fill="#ef4444" />
      <rect x="14" y="15" width="36" height="32" rx="9" fill="#64748b" />
      <rect x="19" y="22" width="26" height="13" rx="6" fill="#0f172a" />
      <circle cx="26" cy="28.5" r="3" fill="#22d3ee" />
      <circle cx="38" cy="28.5" r="3" fill="#22d3ee" />
      <path d="M25 41 L39 41" stroke="#e2e8f0" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="2 3" />
    </svg>
  );
}

function initialsSvg(name: string) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="32" fill="#94a3b8" />
      <text x="32" y="41" textAnchor="middle" fontSize="26" fontWeight="800" fill="#fff">
        {name.slice(0, 1).toUpperCase()}
      </text>
    </svg>
  );
}

export function Avatar({
  avatar,
  picture,
  isBot = false,
  name = '',
  size = 28,
}: {
  avatar: string | null;
  picture?: string | null;
  isBot?: boolean;
  name?: string;
  size?: number;
}) {
  const [broken, setBroken] = useState(false);
  let inner;
  if (isBot) inner = <BotSvg />;
  else if (picture && !broken)
    inner = <img src={picture} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} draggable={false} />;
  else if (avatar && avatar in AVATARS) inner = <PresetSvg recipe={AVATARS[avatar as AvatarId]} />;
  else inner = initialsSvg(name || '?');
  return (
    <span className="avatar" style={{ width: size, height: size }} title={name || undefined}>
      {inner}
    </span>
  );
}
