import React from 'react';
import Svg, { Path, Circle, Line, G } from 'react-native-svg';

// ── HexaCore (prestij para birimi) ikonu ─────────────────────────────────────
export const HexaCoreIcon = ({ size = 16, color = '#aa44ff' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 2l9 4.9V17L12 22l-9-4.9V7z"
      fill={color} fillOpacity="0.22"
      stroke={color} strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round"
    />
    <Path d="M12 2v20" stroke={color} strokeWidth="1.2" strokeOpacity="0.45" />
    <Path d="M3 7l9 5.5"  stroke={color} strokeWidth="1.2" strokeOpacity="0.45" />
    <Path d="M21 7l-9 5.5" stroke={color} strokeWidth="1.2" strokeOpacity="0.45" />
  </Svg>
);

// ── Kara Delik: kesikli daireler + merkez dolgu ───────────────────────────────
export const BlackHoleIcon = ({ size = 32, color = '#aa44ff' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth="1.8" strokeDasharray="4 4" />
    <Circle cx="12" cy="12" r="6"  stroke={color} strokeWidth="1.5" strokeDasharray="2 4" />
    <Circle cx="12" cy="12" r="2.5" fill={color} />
  </Svg>
);

// ── Solucan Deliği: iki daire + üst/alt eğri yollar ──────────────────────────
export const WormholeIcon = ({ size = 32, color = '#00ffe0' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="5"  cy="12" r="3" stroke={color} strokeWidth="1.8" />
    <Circle cx="19" cy="12" r="3" stroke={color} strokeWidth="1.8" />
    <Path
      d="M5 9c4-6 10-6 14 0"
      stroke={color} strokeWidth="1.5"
      strokeLinecap="round" strokeDasharray="4 3"
    />
    <Path
      d="M5 15c4 6 10 6 14 0"
      stroke={color} strokeWidth="1.5"
      strokeLinecap="round" strokeDasharray="4 3"
    />
  </Svg>
);

// ── Aşırı Yükleme: şimşek / yıldırım bolt ─────────────────────────────────────
export const OverloadIcon = ({ size = 32, color = '#ffdd00' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"
      fill={color} fillOpacity="0.22"
      stroke={color} strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round"
    />
  </Svg>
);

// ── Zamanı Geri Sar: saat + ok + saat ibreleri ────────────────────────────────
export const RewindIcon = ({ size = 32, color = '#ff3355' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"
      stroke={color} strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round"
    />
    <Path
      d="M3 3v5h5"
      stroke={color} strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round"
    />
    <Path
      d="M12 7v5l4 2"
      stroke={color} strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round"
    />
  </Svg>
);

// ── Ses Açık: hoparlör + dalgalar ─────────────────────────────────────────────
export const SoundOnIcon = ({ size = 28, color = '#aa44ff' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M11 5L6 9H2v6h4l5 4V5z"
      fill={color} fillOpacity="0.25"
      stroke={color} strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round"
    />
    <Path d="M15.54 8.46a5 5 0 0 1 0 7.07" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    <Path d="M19.07 4.93a10 10 0 0 1 0 14.14" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeOpacity="0.6" />
  </Svg>
);

// ── Ses Kapalı: hoparlör + çarpı ──────────────────────────────────────────────
export const SoundOffIcon = ({ size = 28, color = '#444455' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M11 5L6 9H2v6h4l5 4V5z"
      fill={color} fillOpacity="0.2"
      stroke={color} strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round"
    />
    <Line x1="23" y1="9" x2="17" y2="15" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    <Line x1="17" y1="9" x2="23" y2="15" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
  </Svg>
);

// ── Titreşim Açık: telefon + titreşim çizgileri ────────────────────────────────
export const VibrationOnIcon = ({ size = 28, color = '#aa44ff' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M6 5h12a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"
      fill={color} fillOpacity="0.18"
      stroke={color} strokeWidth="1.8"
    />
    <Path d="M2 9v6" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <Path d="M22 9v6" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <Path d="M4 11v2" stroke={color} strokeWidth="2" strokeLinecap="round" strokeOpacity="0.6" />
    <Path d="M20 11v2" stroke={color} strokeWidth="2" strokeLinecap="round" strokeOpacity="0.6" />
  </Svg>
);

// ── Titreşim Kapalı: telefon + çarpı ──────────────────────────────────────────
export const VibrationOffIcon = ({ size = 28, color = '#444455' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M6 5h12a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"
      fill={color} fillOpacity="0.15"
      stroke={color} strokeWidth="1.8"
    />
    <Line x1="9" y1="9" x2="15" y2="15" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    <Line x1="15" y1="9" x2="9" y2="15" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
  </Svg>
);

// ── Rekor Vitrini: Taç (highScore) ────────────────────────────────────────────
export const TrophyIcon = ({ size = 28, color = '#ffcc44' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M6 2h12v8a6 6 0 0 1-12 0V2z"
      fill={color} fillOpacity="0.18"
      stroke={color} strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round"
    />
    <Path d="M2 4h4v4a2 2 0 0 1-4 0V4z" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Path d="M22 4h-4v4a2 2 0 0 0 4 0V4z" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Path d="M12 16v4" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    <Path d="M8 22h8" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
  </Svg>
);

// ── Rekor Vitrini: Altıgen Nod (maxNode) ──────────────────────────────────────
export const HexNodeIcon = ({ size = 28, color = '#00ffe0' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 2l8.66 5v10L12 22l-8.66-5V7z"
      fill={color} fillOpacity="0.15"
      stroke={color} strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round"
    />
    <Path d="M12 8v8" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeOpacity="0.6" />
    <Path d="M8.27 10l7.46 4" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeOpacity="0.6" />
    <Path d="M15.73 10l-7.46 4" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeOpacity="0.6" />
  </Svg>
);

// ── Ev / Ana Menü ikonu ────────────────────────────────────────────────────────
export const HomeIcon = ({ size = 24, color = '#aa44ff' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M3 9.5L12 3l9 6.5V21a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z"
      fill={color} fillOpacity="0.18"
      stroke={color} strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round"
    />
    <Path
      d="M9 22V12h6v10"
      stroke={color} strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round"
    />
  </Svg>
);
