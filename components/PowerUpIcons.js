import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';

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
