import React, { useRef, useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Dimensions,
  SafeAreaView,
  PanResponder,
  Animated,
  Modal,
  AppState,
} from 'react-native';
import Svg, { Polygon, Text as SvgText } from 'react-native-svg';
import {
  BlackHoleIcon,
  WormholeIcon,
  OverloadIcon,
  RewindIcon,
  HexaCoreIcon,
  SoundOnIcon,
  SoundOffIcon,
  VibrationOnIcon,
  VibrationOffIcon,
  HomeIcon,
} from './components/PowerUpIcons';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ── Ses Motoru ─────────────────────────────────────────────────────────────────
const SFX = {
  spawn: require('./assets/sfx/spawn.wav'),
  error: require('./assets/sfx/error.wav'),
  merge: require('./assets/sfx/merge.wav'),
  upgrade: require('./assets/sfx/upgrade.wav'),
};

async function initAudio() {
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: false,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });
  } catch (_) { }
}

async function playSound(type) {
  if (useStore?.getState()?.soundEnabled === false) return;
  const source = SFX[type];
  if (!source) return;
  try {
    const { sound } = await Audio.Sound.createAsync(source, { volume: 0.75 });
    await sound.playAsync();
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.didJustFinish) sound.unloadAsync();
    });
  } catch (_) { }
}

// Yer değiştirme (swap) için hafif swoosh sesi
async function playSwapSound() {
  if (useStore?.getState()?.soundEnabled === false) return;
  const source = SFX.spawn;
  if (!source) return;
  try {
    const { sound } = await Audio.Sound.createAsync(source, {
      volume: 0.5,
      rate: 0.68,
      shouldCorrectPitch: false,
    });
    await sound.playAsync();
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.didJustFinish) sound.unloadAsync();
    });
  } catch (_) { }
}

// Kombo zinciri için yükselen pitch/hız ile merge sesi
async function playMergeWithRate(rate = 1.0) {
  if (useStore?.getState()?.soundEnabled === false) return;
  const source = SFX.merge;
  if (!source) return;
  try {
    const { sound } = await Audio.Sound.createAsync(source, {
      volume: Math.min(0.75 + (rate - 1.0) * 0.4, 1.0),
      rate,
      shouldCorrectPitch: false,
    });
    await sound.playAsync();
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.didJustFinish) sound.unloadAsync();
    });
  } catch (_) { }
}

// Titreşim-güvenli sarmalayıcı: hapticsEnabled false ise çalışmaz
const safeHaptic = {
  impact:       (style) => { if (useStore?.getState()?.hapticsEnabled !== false) Haptics.impactAsync(style); },
  notification: (type)  => { if (useStore?.getState()?.hapticsEnabled !== false) Haptics.notificationAsync(type); },
};

// ── Renk Paleti ───────────────────────────────────────────────────────────────
const C = {
  bg: '#08041a',
  hexEmpty: '#0f0b24',
  hexStroke: '#6633cc',
  hexGlow: '#1c0f3a',
  // index = log2(value) - 1  →  2→0, 4→1, 8→2, 16→3, ...
  // Sadece koyu dolgu; parlak stroke nodeStrokeArr'dan gelir
  nodeFill: [
    '#061e3a', // 2  – derin camgöbeği
    '#063320', // 4  – derin zümrüt
    '#2e2200', // 8  – derin kehribar
    '#2e1000', // 16 – derin turuncu
    '#2e0808', // 32 – derin kırmızı
    '#2a0028', // 64 – derin fuşya
    '#150040', // 128 – derin mor
    '#001840', // 256 – derin mavi
    '#002a28', // 512 – derin teal
    '#2a1c00', // 1024 – derin altın
    '#200038', // 2048+ – derin kozmik mor
  ],
  nodeStroke: '#6633cc',
  nodeText: '#ffffff',
  btnBg: '#0e0a22',
  btnBorder: '#7744cc',
  btnText: '#bb99ff',
  btnDisabledBorder: '#2a2050',
  btnDisabledText: '#3d3070',
  titlePrimary: '#bb99ff',
  econCredits: '#dd99ff',
  econSep: '#4a3888',
  modalBorder: '#8855cc',
  modalTitle: '#6644aa',
  modalAmount: '#dd99ff',
  modalOverlay: 'rgba(4,2,18,0.90)',
};

// ── Geometri ──────────────────────────────────────────────────────────────────
const COLS = 4;
const ROWS = 4;
const H_PADDING = 20;
const SQRT3 = Math.sqrt(3);
const STROKE_W = 1.2;
const GAP = 8;
const AVAILABLE = SCREEN_WIDTH - H_PADDING * 2;
// 4 sütun için genişlik: 3.5 * COL_STEP + HEX_W = 4.5 * SQRT3 * HEX_R + 3.5 * GAP
const HEX_R = Math.floor((AVAILABLE - 3.5 * GAP) / (4.5 * SQRT3));
const HEX_W = SQRT3 * HEX_R;
const HEX_H = 2 * HEX_R;
const COL_STEP = HEX_W + GAP;
const ROW_STEP = HEX_R * 1.5 + GAP;
const SVG_W = 3.5 * COL_STEP + HEX_W + 1;
const SVG_H = (ROWS - 1) * ROW_STEP + HEX_H + 1;
const DRAW_R = HEX_R - STROKE_W / 2;

// Önizleme hex boyutları (footer için)
const PREVIEW_R = Math.round(HEX_R * 0.74);
const PREVIEW_W = Math.round(SQRT3 * PREVIEW_R);
const PREVIEW_H = Math.round(2 * PREVIEW_R);
const PREVIEW_DRAW_R = PREVIEW_R - STROKE_W / 2;

function hexPoints(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(3)},${(cy + r * Math.sin(a)).toFixed(3)}`);
  }
  return pts.join(' ');
}

function buildCells() {
  const arr = [];
  for (let row = 0; row < ROWS; row++) {
    const ox = row % 2 === 1 ? COL_STEP / 2 : 0;
    for (let col = 0; col < COLS; col++) {
      arr.push({
        cx: col * COL_STEP + HEX_W / 2 + ox,
        cy: row * ROW_STEP + HEX_R,
        id: `${row}-${col}`,
      });
    }
  }
  return arr;
}

const CELLS = buildCells();

// ── Duyarlı yazı boyutları ────────────────────────────────────────────────────
const RFS = {
  title: Math.round(SCREEN_WIDTH * 0.076),
  econCredit: Math.round(SCREEN_WIDTH * 0.042),
  econIncome: Math.round(SCREEN_WIDTH * 0.034),
  btnMain: Math.round(SCREEN_WIDTH * 0.031),
  float: Math.round(SCREEN_WIDTH * 0.029),
  mTitle: Math.round(SCREEN_WIDTH * 0.024),
  mAmount: Math.round(SCREEN_WIDTH * 0.112),
  mSub: Math.round(SCREEN_WIDTH * 0.027),
  mClose: Math.round(SCREEN_WIDTH * 0.022),
};

// ── Yardımcı fonksiyonlar ─────────────────────────────────────────────────────
// tol: eşik çarpanı (node sürükleme için 1.5, preview drop için 1.9)
function nearestCell(x, y, skip, tol = 1.5) {
  let best = -1;
  let bestD = Infinity;
  CELLS.forEach(({ cx, cy }, i) => {
    if (i === skip) return;
    const d = Math.hypot(x - cx, y - cy);
    if (d < bestD) { bestD = d; best = i; }
  });
  return bestD <= HEX_R * tol ? best : -1;
}

function formatNum(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 100_000) return (n / 1000).toFixed(0) + 'K';
  // ≤99 999 → ham sayı (2048, 4096, 16384, 65536 hepsi sığar)
  return String(Math.floor(n));
}

// Bir node'un saniye başı pasif geliri: value / 2
function nodeIncome(value) {
  if (!value || typeof value !== 'number' || isNaN(value)) return 1;
  return Math.max(1, Math.floor(value / 2));
}

// Değere göre dolgu rengi: log2(value) - 1 indeks
function nodeColor(value) {
  if (!value || typeof value !== 'number' || isNaN(value)) return C.nodeFill[0];
  const idx = Math.max(0, Math.floor(Math.log2(value)) - 1);
  return C.nodeFill[Math.min(idx, C.nodeFill.length - 1)];
}

// Her değer için parlak neon stroke rengi (dolguyla eşleşen ama parlak ton)
const NODE_STROKE_ARR = [
  '#00b4ff', // 2   – neon camgöbeği
  '#00ff88', // 4   – neon zümrüt
  '#ffcc00', // 8   – neon kehribar
  '#ff8800', // 16  – neon turuncu
  '#ff3355', // 32  – neon kırmızı
  '#ff00cc', // 64  – neon fuşya
  '#aa44ff', // 128 – neon mor
  '#4499ff', // 256 – neon mavi
  '#00ffe0', // 512 – neon teal
  '#ffdd00', // 1024 – neon altın
  '#ee44ff', // 2048+ – neon kozmik
];

function nodeStrokeColor(value) {
  if (!value || typeof value !== 'number' || isNaN(value)) return NODE_STROKE_ARR[0];
  const idx = Math.max(0, Math.floor(Math.log2(value)) - 1);
  return NODE_STROKE_ARR[Math.min(idx, NODE_STROKE_ARR.length - 1)];
}

// ── Prestij sabitleri ─────────────────────────────────────────────────────────
const PRESTIGE_UPGRADES = {
  dataFlow: {
    name: 'Veri Akışı',
    desc: 'Pasif geliri kalıcı olarak +%10 artırır (yığılır)',
    costs: [5, 15, 35, 75, 150],
    maxLevel: 5,
  },
  richStart: {
    name: 'Zengin Başlangıç',
    desc: 'Her yeni oyuna +500 ekstra kredi ile başla',
    costs: [10, 30, 70],
    maxLevel: 3,
  },
  advancedNode: {
    name: 'Gelişmiş Düğüm',
    desc: 'Dock\'taki başlangıç taşlarının seviyesi artar',
    costs: [8, 20, 50],
    maxLevel: 3,
  },
};

// advancedNode seviyesine göre sonraki spawn değeri
// Level 0: 60% → 2, 40% → 4
// Level 1: 30% → 2, 40% → 4, 30% → 8
// Level 2: 10% → 2, 40% → 4, 30% → 8, 20% → 16
// Level 3: 20% → 4, 40% → 8, 30% → 16, 10% → 32
function pickNextValue() {
  let level = 0;
  try { level = useStore?.getState()?.prestigeUpgrades?.advancedNode ?? 0; } catch (_) { }
  const TABLES = [
    [2, 2, 2, 2, 2, 2, 4, 4, 4, 4],
    [2, 2, 2, 4, 4, 4, 4, 8, 8, 8],
    [2, 4, 4, 4, 4, 8, 8, 8, 16, 16],
    [4, 4, 4, 4, 8, 8, 8, 16, 16, 32],
  ];
  const table = TABLES[Math.min(level, TABLES.length - 1)];
  return table[Math.floor(Math.random() * table.length)];
}

// Tahta skorunu HexaCore'a dönüştür (1 HexaCore = 100 skor)
function scoreToHexaCore(cells) {
  const total = cells.reduce((s, c) => (c ? s + c.value : s), 0);
  return Math.max(1, Math.floor(total / 100));
}

// Game Over: grid TAMAMEN dolu VE Kara Delik için HexaCore (5🔮) yetersizse
function checkGameOver(cells, hexaCore = Infinity) {
  if (cells.some((c) => c === null)) return false;
  return hexaCore < POWER_HC_COST.blackhole; // 5 🔮
}

// ── Hex komşuluk (odd-r offset: tek satırlar sağa kaymış) ─────────────────────
function hexNeighborIndices(cellIdx) {
  const row = Math.floor(cellIdx / COLS);
  const col = cellIdx % COLS;
  const isOdd = row % 2 === 1;
  // [dRow, dCol] çiftleri: üst-sol, üst-sağ, sol, sağ, alt-sol, alt-sağ
  const dirs = isOdd
    ? [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0], [1, 1]]
    : [[-1, -1], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 0]];
  return dirs
    .map(([dr, dc]) => [row + dr, col + dc])
    .filter(([r, c]) => r >= 0 && r < ROWS && c >= 0 && c < COLS)
    .map(([r, c]) => r * COLS + c);
}

// ── Zincirleme birleşme motoru — Fermuar (Zipper) + Yıldız (Star) hibrit ─────
//
// • Tek komşu eşleşmesi   → TRAVELLING: mevcut node komşuya ATLAR (hücre değişir)
// • Çoklu komşu eşleşmesi → STAR: hepsi merkeze uçar, merkez yerinde kalır
//
// Her step: { cleared[{fromIdx,toIdx,value}], fromIdx, toIdx, mergedAt, waveIdx, travel }
// fromIdx/toIdx: animasyonun tam nereden nereye gittiğini açıkça belirtir.
function runChainMerge(cells, startIdx) {
  const cur = [...cells];
  const steps = [];
  let pos = startIdx;
  const id = Date.now() + Math.random();

  while (true) {
    if (!cur[pos]) break;
    const val = cur[pos].value;
    const matching = hexNeighborIndices(pos).filter((ni) => cur[ni]?.value === val);
    if (matching.length === 0) break;

    if (matching.length === 1) {
      // ── TRAVELLING: tek eşleşme → node hedefe ATLAR ──────────────────────
      const dest = matching[0];
      // fromIdx=pos (silinen kaynak), toIdx=dest (yeni katlanma noktası)
      const stepCleared = [{ fromIdx: pos, toIdx: dest, value: val }];
      cur[pos] = null;
      cur[dest] = { value: val * 2 };
      steps.push({
        cleared: stepCleared,
        fromIdx: pos,
        toIdx: dest,
        mergedAt: dest,
        waveIdx: steps.length,
        travel: true,
      });
      pos = dest;
    } else {
      // ── STAR: çoklu eşleşme → hepsi merkeze gelir, merkez yerinde ─────────
      const stepCleared = matching.map((ni) => ({ fromIdx: ni, toIdx: pos, value: val }));
      matching.forEach((ni) => { cur[ni] = null; });
      cur[pos] = { value: val * 2 };
      steps.push({
        cleared: stepCleared,
        fromIdx: pos,  // merkez değişmez
        toIdx: pos,
        mergedAt: pos,
        waveIdx: steps.length,
        travel: false,
      });
      // pos değişmez; döngü yeni değerle devam eder
    }
  }

  const allCleared = steps.flatMap((s) => s.cleared);
  return { cells: cur, steps, cleared: allCleared, chainDepth: steps.length, mergedAt: pos, id };
}

// ── Power-up sabitleri ────────────────────────────────────────────────────────
// Sabit HexaCore maliyetleri — krediden bağımsız
const UNDO_COSTS = [1, 3, 10, 25]; // Zamanı Geri Sar katlanarak artar
const POWER_HC_COST = { blackhole: 5, wormhole: 3, overload: 10 };
const POWER_DEFS = [
  { id: 'blackhole', Icon: BlackHoleIcon, short: 'KARA DELİK',    hcCost: 5,  defaultColor: '#aa44ff' },
  { id: 'wormhole',  Icon: WormholeIcon,  short: 'SOLUCAN DELİĞİ', hcCost: 3,  defaultColor: '#00ffe0' },
  { id: 'overload',  Icon: OverloadIcon,  short: 'AŞIRI YÜKLE',   hcCost: 10, defaultColor: '#ffdd00' },
  { id: 'rewind',    Icon: RewindIcon,    short: 'GERİ SAR',       hcCost: 0,  defaultColor: '#ff3355' },
];

// Undo için anlık oyun durumu snapshot'ı
function makeSnap(s) {
  return {
    cells: [...s.cells],
    credits: s.credits,
    uretMaliyeti: s.uretMaliyeti,
    nextPieces: [...s.nextPieces],
    selectedPieceIdx: s.selectedPieceIdx,
    lockedCells: { ...s.lockedCells },
  };
}

// Her hamle sonrası kilit sayacını azalt
function decrementLocks(lockedCells) {
  const next = {};
  Object.entries(lockedCells).forEach(([k, v]) => {
    if (v > 1) next[k] = v - 1;
    // v === 1: kilit kalktı, ekleme
  });
  return next;
}

// ── Zustand Store ──────────────────────────────────────────────────────────────
const useStore = create(
  persist(
    (set, get) => ({
      cells: Array(ROWS * COLS).fill(null),
      credits: 50,
      uretMaliyeti: 10,
      lastLogin: Date.now(),
      offlineEarned: null,
      offlineCapReached: false,
      tickId: 0,
      nextPieces: [pickNextValue(), pickNextValue()],
      selectedPieceIdx: 0,
      gameOver: false,
      lastChainEvent: null,
      // ── Power-up state ──────────────────────────────────────────────────────
      activePowerUp: null,        // 'blackhole' | 'wormhole' | 'overload' | 'rewind' | null
      wormholeFirstIdx: null,     // wormhole için ilk seçilen hücre
      lockedCells: {},            // { [cellIdx]: kalan hamle sayısı }
      undoCostIdx: 0,             // UNDO_COSTS dizisindeki pozisyon
      previousState: null,        // son hamle öncesi snapshot (undo için)
      lastOverloadEvent: null,    // { cellIdx, exploded, id }
      // ── Prestij state ───────────────────────────────────────────────────────
      hexaCore: 50,               // kalıcı prestij para birimi (başlangıç hediyesi)
      prestigeUpgrades: { dataFlow: 0, richStart: 0, advancedNode: 0 },
      // ── Navigasyon + Global Ayarlar ─────────────────────────────────────────
      currentScreen: 'MENU',     // 'MENU' | 'GAME'
      soundEnabled: true,
      hapticsEnabled: true,
      labOpen: false,             // prestij marketi modalı

      setScreen:      (screen) => set({ currentScreen: screen }),
      toggleSound:    () => set((s) => ({ soundEnabled: !s.soundEnabled })),
      toggleHaptics:  () => set((s) => ({ hapticsEnabled: !s.hapticsEnabled })),
      setLabOpen:     (v) => set({ labOpen: v }),

      addCredits: (amount) => set((s) => ({ credits: s.credits + amount })),

      selectPiece: (idx) => set({ selectedPieceIdx: idx }),

      calculateOffline: () => {
        const { lastLogin, cells, prestigeUpgrades } = get();
        const MAX_SEC = 4 * 60 * 60;
        const elapsed = Math.floor((Date.now() - lastLogin) / 1000);
        if (elapsed < 1) return;
        const effective = Math.min(elapsed, MAX_SEC);
        const capReached = elapsed >= MAX_SEC;
        const mult = 1 + 0.1 * (prestigeUpgrades?.dataFlow ?? 0);
        const ips = cells.reduce((s, c) => (c ? s + nodeIncome(c.value) : s), 0);
        const earned = Math.floor(effective * ips * mult);
        if (earned >= 10) {
          set({ offlineEarned: earned, offlineCapReached: capReached, lastLogin: Date.now() });
        } else if (earned > 0) {
          set((s) => ({ credits: s.credits + earned, offlineCapReached: false, lastLogin: Date.now() }));
        } else {
          set({ lastLogin: Date.now() });
        }
      },

      collectOffline: () => {
        const { offlineEarned } = get();
        set((s) => ({
          credits: s.credits + (offlineEarned ?? 0),
          offlineEarned: null,
          offlineCapReached: false,
          lastLogin: Date.now(),
        }));
      },

      tickIncome: () => {
        const { cells, prestigeUpgrades } = get();
        const mult = 1 + 0.1 * (prestigeUpgrades?.dataFlow ?? 0);
        const income = cells.reduce((s, c) => (c ? s + nodeIncome(c.value) : s), 0);
        const boosted = Math.floor(income * mult);
        set((s) => ({
          credits: boosted > 0 ? s.credits + boosted : s.credits,
          lastLogin: Date.now(),
          tickId: s.tickId + 1,
        }));
      },

      // Seçili parçayı rastgele boş hücreye yerleştirir
      buyNode: () => {
        const { cells, nextPieces, selectedPieceIdx } = get();
        const empty = cells.reduce((a, c, i) => (c === null ? [...a, i] : a), []);
        if (!empty.length) return false;
        const pieceIdx = selectedPieceIdx ?? 0;
        const valueToPlace = nextPieces[pieceIdx];
        const idx = empty[Math.floor(Math.random() * empty.length)];
        const placed = [...cells];
        placed[idx] = { value: valueToPlace };
        const cr = runChainMerge(placed, idx);
        const newPieces = [...nextPieces];
        newPieces[pieceIdx] = pickNextValue();
        set({
          cells: cr.cells,
          nextPieces: newPieces,
          selectedPieceIdx: pieceIdx === 0 ? 1 : 0,
          gameOver: checkGameOver(cr.cells, s.hexaCore),
          lastChainEvent: cr.steps.length > 0
            ? { steps: cr.steps, cleared: cr.cleared, finalMergedAt: cr.mergedAt, chainDepth: cr.chainDepth, id: cr.id }
            : null,
        });
        return true;
      },

      // Seçili parçayı belirli bir boş hücreye yerleştirir
      spawnAtCell: (cellIdx) => {
        const { cells, nextPieces, selectedPieceIdx } = get();
        if (cells[cellIdx] !== null) return false;
        const pieceIdx = selectedPieceIdx ?? 0;
        const valueToPlace = nextPieces[pieceIdx];
        const placed = [...cells];
        placed[cellIdx] = { value: valueToPlace };
        const cr = runChainMerge(placed, cellIdx);
        const newPieces = [...nextPieces];
        newPieces[pieceIdx] = pickNextValue();
        set({
          cells: cr.cells,
          nextPieces: newPieces,
          selectedPieceIdx: pieceIdx === 0 ? 1 : 0,
          gameOver: checkGameOver(cr.cells, s.hexaCore),
          lastChainEvent: cr.steps.length > 0
            ? { steps: cr.steps, cleared: cr.cleared, finalMergedAt: cr.mergedAt, chainDepth: cr.chainDepth, id: cr.id }
            : null,
        });
        return true;
      },

      // Preview alanından direkt sürüklenerek bırakma:
      //  • Boş hücre              → yerleştir + zincir
      //  • Aynı değerli dolu hücre → merge (dock taşı + board taşı) + zincir
      //  • Farklı değerli dolu     → GEÇERSİZ, snap
      spawnFromPreview: (pieceIdx, cellIdx) => {
        const s = get();
        if (s.lockedCells[cellIdx]) return { ok: false, locked: true };
        const snap = makeSnap(s);
        const valueToPlace = s.nextPieces[pieceIdx];
        const existing = s.cells[cellIdx];

        // Farklı değerli dolu hücre → yasak
        if (existing !== null && existing.value !== valueToPlace) {
          return { ok: false, wrongValue: true };
        }

        const newPieces = [...s.nextPieces];
        newPieces[pieceIdx] = pickNextValue();
        const working = [...s.cells];

        if (existing !== null && existing.value === valueToPlace) {
          // Aynı değerli merge: dock taşı board taşına uçar → 2x değer
          working[cellIdx] = { value: valueToPlace * 2 };
          const cr = runChainMerge(working, cellIdx);
          const step0 = {
            cleared: [{ fromIdx: -1, toIdx: cellIdx, value: valueToPlace }],
            fromIdx: -1, toIdx: cellIdx,
            mergedAt: cellIdx, waveIdx: 0, travel: true,
          };
          const allSteps = [step0, ...cr.steps.map((st, i) => ({ ...st, waveIdx: i + 1 }))];
          const allCleared = [step0.cleared[0], ...cr.cleared];
          set({
            cells: cr.cells,
            nextPieces: newPieces,
            selectedPieceIdx: pieceIdx === 0 ? 1 : 0,
          gameOver: checkGameOver(cr.cells, s.hexaCore),
            lockedCells: decrementLocks(s.lockedCells),
            previousState: snap,
            lastChainEvent: {
              steps: allSteps, cleared: allCleared,
              finalMergedAt: cr.mergedAt, chainDepth: allSteps.length, id: cr.id,
            },
          });
          return { ok: true, merged: true };
        }

        // Boş hücre → normal yerleştir
        working[cellIdx] = { value: valueToPlace };
        const cr = runChainMerge(working, cellIdx);
        set({
          cells: cr.cells,
          nextPieces: newPieces,
          selectedPieceIdx: pieceIdx === 0 ? 1 : 0,
          gameOver: checkGameOver(cr.cells, s.hexaCore),
          lockedCells: decrementLocks(s.lockedCells),
          previousState: snap,
          lastChainEvent: cr.steps.length > 0
            ? { steps: cr.steps, cleared: cr.cleared, finalMergedAt: cr.mergedAt, chainDepth: cr.chainDepth, id: cr.id }
            : null,
        });
        return { ok: true };
      },

      // Sürükle-bırak:
      //  • Boş hücre          → GEÇERSİZ, taş geri döner (snap)
      //  • Dolu, aynı değer   → Direkt birleştir (MERGE) + zincir kontrol
      //  • Dolu, farklı değer → Yer değiştir (SWAP) + her iki konumdan zincir kontrol
      resolveDrop: (fromIdx, toIdx) => {
        const s = get();
        const { cells, lockedCells } = s;
        if (fromIdx === toIdx) return { result: 'snap' };
        const src = cells[fromIdx];
        const dst = cells[toIdx];
        if (!src) return { result: 'snap' };
        // Kilitli hücrelere dokunma yasak
        if (lockedCells[fromIdx] || lockedCells[toIdx]) return { result: 'snap' };

        // Boş hücreye bırakma artık yasak — taş yerine geri döner
        if (!dst) return { result: 'snap' };

        const snap = makeSnap(s);

        if (dst.value === src.value) {
          const merged = [...cells];
          merged[fromIdx] = null;
          merged[toIdx] = { value: dst.value * 2 };
          const cr = runChainMerge(merged, toIdx);
          const step0 = {
            cleared: [{ fromIdx, toIdx, value: src.value }],
            fromIdx, toIdx, mergedAt: toIdx, waveIdx: 0, travel: true,
          };
          const allSteps = [step0, ...cr.steps.map((st, i) => ({ ...st, waveIdx: i + 1 }))];
          const allCleared = [step0.cleared[0], ...cr.cleared];
          set({
            cells: cr.cells,
          gameOver: checkGameOver(cr.cells, s.hexaCore),
            lockedCells: decrementLocks(lockedCells),
            previousState: snap,
            lastChainEvent: {
              steps: allSteps, cleared: allCleared,
              finalMergedAt: cr.mergedAt, chainDepth: allSteps.length, id: cr.id,
            },
          });
          return { result: 'merged', chainDepth: allSteps.length };
        }

        // Farklı değer → Yer değiştir (Swap)
        const swapped = [...cells];
        swapped[toIdx] = src;
        swapped[fromIdx] = dst;
        const chain1 = runChainMerge(swapped, toIdx);
        const chain2 = runChainMerge(chain1.cells, fromIdx);
        const allSteps = [
          ...chain1.steps,
          ...chain2.steps.map((st, i) => ({ ...st, waveIdx: chain1.steps.length + i })),
        ];
        const allCleared = [...chain1.cleared, ...chain2.cleared];
        const totalDepth = allSteps.length;
        const primaryMergedAt = chain1.steps.length >= chain2.steps.length ? chain1.mergedAt : chain2.mergedAt;
        set({
          cells: chain2.cells,
          gameOver: checkGameOver(chain2.cells, s.hexaCore),
          lockedCells: decrementLocks(lockedCells),
          previousState: snap,
          lastChainEvent: allSteps.length > 0
            ? { steps: allSteps, cleared: allCleared, finalMergedAt: primaryMergedAt, chainDepth: totalDepth, id: chain1.id }
            : null,
        });
        return { result: 'swapped', chainDepth: totalDepth };
      },

      // ── Power-up aksiyonları ────────────────────────────────────────────────
      activatePowerUp: (type) => {
        const { activePowerUp } = get();
        // Aynı butona tekrar bas → iptal
        set({
          activePowerUp: activePowerUp === type ? null : type,
          wormholeFirstIdx: null,
        });
      },

      cancelPowerUp: () => set({ activePowerUp: null, wormholeFirstIdx: null }),

      // Kara Delik: hücreyi sil + 3 hamle kilitle
      applyBlackHole: (cellIdx) => {
        const s = get();
        if (!s.cells[cellIdx] || s.lockedCells[cellIdx]) return { ok: false };
        const cost = POWER_HC_COST.blackhole;
        if (s.hexaCore < cost) return { ok: false, noHC: true };
        const snap = makeSnap(s);
        const newCells = [...s.cells];
        newCells[cellIdx] = null;
        set({
          cells: newCells,
          hexaCore: s.hexaCore - cost,
          lockedCells: { ...s.lockedCells, [cellIdx]: 3 },
          previousState: snap,
          activePowerUp: null,
          gameOver: checkGameOver(newCells, s.hexaCore - cost),
          lastChainEvent: null,
        });
        return { ok: true };
      },

      // Solucan Deliği: 2 hücreyi seç → komşuluksuz swap + zincir x2 bonus
      applyWormhole: (cellIdx) => {
        const s = get();
        if (!s.cells[cellIdx] || s.lockedCells[cellIdx]) return { ok: false };
        if (s.wormholeFirstIdx === null) {
          set({ wormholeFirstIdx: cellIdx });
          return { ok: 'first' };
        }
        if (s.wormholeFirstIdx === cellIdx) {
          set({ wormholeFirstIdx: null });
          return { ok: 'deselect' };
        }
        const first = s.wormholeFirstIdx;
        if (s.lockedCells[first]) return { ok: false };
        const cost = POWER_HC_COST.wormhole;
        if (s.hexaCore < cost) return { ok: false, noHC: true };
        const snap = makeSnap(s);
        const swapped = [...s.cells];
        swapped[cellIdx] = s.cells[first];
        swapped[first] = s.cells[cellIdx];
        const chain1 = runChainMerge(swapped, cellIdx);
        const chain2 = runChainMerge(chain1.cells, first);
        const allSteps = [
          ...chain1.steps,
          ...chain2.steps.map((st, i) => ({ ...st, waveIdx: chain1.steps.length + i })),
        ];
        const allCleared = [...chain1.cleared, ...chain2.cleared];
        const totalDepth = allSteps.length;
        const chainTriggered = totalDepth > 0;
        // Zincir tetiklenirse bonus HexaCore (derinlik * 1)
        const bonusHC = chainTriggered ? Math.min(totalDepth, 5) : 0;
        const primaryMergedAt = chain1.steps.length >= chain2.steps.length ? chain1.mergedAt : chain2.mergedAt;
        set({
          cells: chain2.cells,
          hexaCore: s.hexaCore - cost + bonusHC,
          lockedCells: decrementLocks(s.lockedCells),
          previousState: snap,
          activePowerUp: null,
          wormholeFirstIdx: null,
          gameOver: checkGameOver(chain2.cells, s.hexaCore),
          lastChainEvent: allSteps.length > 0
            ? { steps: allSteps, cleared: allCleared, finalMergedAt: primaryMergedAt, chainDepth: totalDepth, id: chain1.id }
            : null,
        });
        return { ok: true, chainTriggered, bonusCredits };
      },

      // Aşırı Yükleme: %70 bir üst seviye, %30 patlama
      applyOverload: (cellIdx) => {
        const s = get();
        if (!s.cells[cellIdx] || s.lockedCells[cellIdx]) return { ok: false };
        const cost = POWER_HC_COST.overload;
        if (s.hexaCore < cost) return { ok: false, noHC: true };
        const snap = makeSnap(s);
        const id = Date.now() + Math.random();
        if (Math.random() < 0.7) {
          // Başarı: bir üst seviye + zincir kontrol
          const boosted = [...s.cells];
          boosted[cellIdx] = { value: s.cells[cellIdx].value * 2 };
          const cr = runChainMerge(boosted, cellIdx);
          set({
            cells: cr.cells,
            hexaCore: s.hexaCore - cost,
            lockedCells: decrementLocks(s.lockedCells),
            previousState: snap,
            activePowerUp: null,
            gameOver: checkGameOver(cr.cells, s.hexaCore - cost),
            lastChainEvent: cr.steps.length > 0
              ? { steps: cr.steps, cleared: cr.cleared, finalMergedAt: cr.mergedAt, chainDepth: cr.chainDepth, id: cr.id }
              : null,
            lastOverloadEvent: { cellIdx, exploded: false, id },
          });
          return { ok: true, exploded: false };
        } else {
          // Patlama: hücre yok olur
          const exploded = [...s.cells];
          exploded[cellIdx] = null;
          set({
            cells: exploded,
            hexaCore: s.hexaCore - cost,
            lockedCells: decrementLocks(s.lockedCells),
            previousState: snap,
            activePowerUp: null,
            gameOver: checkGameOver(exploded, s.hexaCore - cost),
            lastChainEvent: null,
            lastOverloadEvent: { cellIdx, exploded: true, id },
          });
          return { ok: true, exploded: true };
        }
      },

      // Zamanı Geri Sar: son hamleyi geri al (katlanarak artan HexaCore maliyeti)
      applyRewind: () => {
        const s = get();
        if (!s.previousState) return { ok: false };
        const costIdx = Math.min(s.undoCostIdx, UNDO_COSTS.length - 1);
        const cost = UNDO_COSTS[costIdx];
        if (s.hexaCore < cost) return { ok: false, noHC: true };
        set({
          ...s.previousState,
          hexaCore: s.hexaCore - cost, // mevcut hexaCore'dan düş (geri alınan state'inkinden değil)
          undoCostIdx: costIdx + 1,
          previousState: null,
          activePowerUp: null,
          wormholeFirstIdx: null,
          lastChainEvent: null,
          lastOverloadEvent: null,
          gameOver: false,
        });
        return { ok: true };
      },

      // Oyun bitti: HexaCore topla, sonra sıfırla
      collectPrestigeAndReset: () => {
        const { cells, prestigeUpgrades } = get();
        const earned = scoreToHexaCore(cells);
        const richStart = prestigeUpgrades?.richStart ?? 0;
        const startCredits = 50 + 500 * richStart;
        set((s) => ({
          hexaCore: s.hexaCore + earned,
          cells: Array(ROWS * COLS).fill(null),
          credits: startCredits,
          uretMaliyeti: 10,
          nextPieces: [pickNextValue(), pickNextValue()],
          selectedPieceIdx: 0,
          gameOver: false,
          offlineEarned: null,
          offlineCapReached: false,
          lastLogin: Date.now(),
          activePowerUp: null,
          wormholeFirstIdx: null,
          lockedCells: {},
          undoCostIdx: 0,
          previousState: null,
          lastOverloadEvent: null,
        }));
      },

      // Prestij yükseltme satın al
      buyPrestigeUpgrade: (id) => {
        const { hexaCore, prestigeUpgrades } = get();
        const def = PRESTIGE_UPGRADES[id];
        if (!def) return { ok: false };
        const curLevel = prestigeUpgrades?.[id] ?? 0;
        if (curLevel >= def.maxLevel) return { ok: false, maxed: true };
        const cost = def.costs[curLevel];
        if (hexaCore < cost) return { ok: false, noCredits: true };
        set((s) => ({
          hexaCore: s.hexaCore - cost,
          prestigeUpgrades: { ...s.prestigeUpgrades, [id]: curLevel + 1 },
        }));
        return { ok: true };
      },

      resetGame: () => {
        const { prestigeUpgrades } = get();
        const richStart = prestigeUpgrades?.richStart ?? 0;
        set({
          cells: Array(ROWS * COLS).fill(null),
          credits: 50 + 500 * richStart,
          uretMaliyeti: 10,
          nextPieces: [pickNextValue(), pickNextValue()],
          selectedPieceIdx: 0,
          gameOver: false,
          offlineEarned: null,
          offlineCapReached: false,
          lastLogin: Date.now(),
          activePowerUp: null,
          wormholeFirstIdx: null,
          lockedCells: {},
          undoCostIdx: 0,
          previousState: null,
          lastOverloadEvent: null,
        });
      },
    }),
    {
      name: 'hexanode-storage-v9',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        cells: s.cells,
        credits: s.credits,
        uretMaliyeti: s.uretMaliyeti,
        lastLogin: s.lastLogin,
        nextPieces: s.nextPieces,
        selectedPieceIdx: s.selectedPieceIdx,
        gameOver: s.gameOver,
        lockedCells: s.lockedCells,
        undoCostIdx: s.undoCostIdx,
        hexaCore: s.hexaCore,
        prestigeUpgrades: s.prestigeUpgrades,
        soundEnabled: s.soundEnabled,
        hapticsEnabled: s.hapticsEnabled,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) return;
        const expectedSize = ROWS * COLS;
        const wrongSize = state?.cells?.length !== expectedSize;
        const hasBadCells = state?.cells?.some(
          (c) => c !== null && (typeof c.value !== 'number' || isNaN(c.value))
        );
        if (wrongSize || hasBadCells) {
          setTimeout(() => useStore.getState().resetGame(), 0);
        } else {
          setTimeout(() => useStore.getState().calculateOffline(), 0);
        }
      },
    }
  )
);

// ── AnimatedPressable ─────────────────────────────────────────────────────────
function AnimatedPressable({ onPress, style, children, activeOpacity = 1 }) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn = useCallback(() =>
    Animated.spring(scale, { toValue: 0.94, speed: 60, bounciness: 2, useNativeDriver: true }).start()
    , [scale]);
  const pressOut = useCallback(() =>
    Animated.spring(scale, { toValue: 1, speed: 45, bounciness: 8, useNativeDriver: true }).start()
    , [scale]);
  return (
    <TouchableOpacity onPress={onPress} onPressIn={pressIn} onPressOut={pressOut} activeOpacity={activeOpacity}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </TouchableOpacity>
  );
}

// ── EconDisplay ───────────────────────────────────────────────────────────────
function EconDisplay({ onOpenLab }) {
  const credits = useStore((s) => s.credits);
  const hexaCore = useStore((s) => s.hexaCore);
  const cells = useStore((s) => s.cells);
  const prestigeUpgrades = useStore((s) => s.prestigeUpgrades);

  const mult = 1 + 0.1 * (prestigeUpgrades?.dataFlow ?? 0);
  const baseIncome = cells.reduce((sum, cell) => (cell ? sum + nodeIncome(cell.value) : sum), 0);
  const incomePerSec = Math.floor(baseIncome * mult);

  return (
    <View style={styles.econCol}>
      <View style={styles.econRow}>
        <Text style={styles.econCredits}>{formatNum(credits)} ✦</Text>
        <Text style={styles.econSep}>  ·  </Text>
        <Text style={styles.econIncome}>+{formatNum(incomePerSec)}/sn</Text>
      </View>
      <TouchableOpacity style={styles.hexaCoreRow} onPress={onOpenLab} activeOpacity={0.75}>
        <HexaCoreIcon size={13} color="#aa44ff" />
        <Text style={styles.hexaCoreText}> {hexaCore}  HexaCore</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── FloatingText ──────────────────────────────────────────────────────────────
function FloatingText({ x, y, text, onDone, textStyle }) {
  const transY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0.72)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(transY, { toValue: -(HEX_R * 1.5), duration: 1100, useNativeDriver: false }),
      Animated.sequence([
        Animated.delay(200),
        Animated.timing(opacity, { toValue: 0, duration: 900, useNativeDriver: false }),
      ]),
    ]).start(onDone);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.nodeAbs,
        {
          left: x - 48, top: y - HEX_R * 0.35,
          width: 96, alignItems: 'center',
          transform: [{ translateY: transY }],
          opacity, zIndex: 200,
        },
      ]}
    >
      <Text style={[styles.floatText, textStyle]}>{text}</Text>
    </Animated.View>
  );
}

// ── FloatingTextsLayer ────────────────────────────────────────────────────────
function FloatingTextsLayer() {
  const cells = useStore((s) => s.cells);
  const tickId = useStore((s) => s.tickId);
  const [floats, setFloats] = useState([]);
  const lastTickRef = useRef(-1);

  useEffect(() => {
    if (tickId === 0 || tickId === lastTickRef.current) return;
    lastTickRef.current = tickId;

    const spawned = [];
    cells.forEach((cell, idx) => {
      if (!cell) return;
      const income = nodeIncome(cell.value);
      const { cx, cy } = CELLS[idx];
      spawned.push({ id: `${tickId}-${idx}`, x: cx, y: cy, text: `+${formatNum(income)}` });
    });
    if (spawned.length > 0) setFloats((prev) => [...prev, ...spawned]);
  }, [tickId, cells]);

  const removeFloat = useCallback((id) => {
    setFloats((prev) => prev.filter((f) => f.id !== id));
  }, []);

  return (
    <>
      {floats.map((f) => (
        <FloatingText key={f.id} x={f.x} y={f.y} text={f.text} onDone={() => removeFloat(f.id)} />
      ))}
    </>
  );
}

// ── NodeHex — SVG hex görsel ───────────────────────────────────────────────────
function NodeHex({ value }) {
  const safeVal = (value && typeof value === 'number' && !isNaN(value)) ? value : 2;
  const fill = nodeColor(safeVal);
  const stroke = nodeStrokeColor(safeVal);
  const ncx = HEX_W / 2;
  const ncy = HEX_R;
  const label = formatNum(safeVal);
  // Karakter sayısına göre font kademeli olarak küçülür — tek satırda sığması garanti
  const fs = label.length <= 2 ? Math.round(HEX_R * 0.44)
    : label.length === 3 ? Math.round(HEX_R * 0.38)
      : label.length === 4 ? Math.round(HEX_R * 0.32)
        : label.length === 5 ? Math.round(HEX_R * 0.27)
          : Math.round(HEX_R * 0.23); // 6+ karakter (100K, 1M vb.)

  return (
    <Svg width={HEX_W} height={HEX_H} viewBox={`0 0 ${HEX_W} ${HEX_H}`}>
      {/* İç dolgu */}
      <Polygon
        points={hexPoints(ncx, ncy, DRAW_R)}
        fill={fill}
        stroke={stroke}
        strokeWidth={STROKE_W * 1.6}
        strokeLinejoin="miter"
      />
      {/* Değer etiketi */}
      <SvgText
        x={ncx} y={ncy + fs * 0.36}
        textAnchor="middle"
        fontSize={fs}
        fill={C.nodeText}
        fontWeight="600"
      >
        {label}
      </SvgText>
    </Svg>
  );
}

// ── DraggableNode ─────────────────────────────────────────────────────────────
function DraggableNode({ cellIndex, value, isDragging, justMerged, isLocked, onDragStart, onDragEnd, onMergedAtIdx }) {
  const { cx, cy } = CELLS[cellIndex];

  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const mergeScale = useRef(new Animated.Value(justMerged ? 0.68 : 1)).current;
  const mergeGlow = useRef(new Animated.Value(justMerged ? 1 : 0)).current;
  const mountScale = useRef(new Animated.Value(0.45)).current;
  const mountOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(mountScale, { toValue: 1, speed: 22, bounciness: 16, useNativeDriver: false }),
      Animated.timing(mountOpacity, { toValue: 1, duration: 110, useNativeDriver: false }),
    ]).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!justMerged) return;
    Animated.spring(mergeScale, { toValue: 1, speed: 16, bounciness: 16, useNativeDriver: false }).start();
    Animated.timing(mergeGlow, { toValue: 0, duration: 650, useNativeDriver: false }).start(() => {
      if (mounted.current) onMergedAtIdx(null);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cbRef = useRef({ onDragStart, onDragEnd, onMergedAtIdx, isLocked });
  cbRef.current = { onDragStart, onDragEnd, onMergedAtIdx, isLocked };

  const snapBack = useCallback(() => {
    Animated.spring(pan, { toValue: { x: 0, y: 0 }, tension: 150, friction: 10, useNativeDriver: false })
      .start(({ finished }) => { if (finished) pan.setValue({ x: 0, y: 0 }); });
  }, [pan]);

  const hardReset = useCallback(() => {
    pan.stopAnimation();
    pan.setValue({ x: 0, y: 0 });
    scaleAnim.stopAnimation();
    scaleAnim.setValue(1);
  }, [pan, scaleAnim]);

  const panResponder = useRef(
    PanResponder.create({
      // Board Lock: tahtadaki taşlar sürüklenemez (sadece Dock'tan sürükleme var)
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: () => false,

      onPanResponderGrant: () => {
        if (cbRef.current.isLocked) return;
        pan.stopAnimation();
        pan.flattenOffset();
        pan.setValue({ x: 0, y: 0 });
        Animated.spring(scaleAnim, { toValue: 1.14, speed: 50, useNativeDriver: false }).start();
        cbRef.current.onDragStart(cellIndex);
      },

      onPanResponderMove: Animated.event(
        [null, { dx: pan.x, dy: pan.y }],
        { useNativeDriver: false }
      ),

      onPanResponderRelease: (_, gs) => {
        Animated.spring(scaleAnim, { toValue: 1, speed: 50, useNativeDriver: false }).start();
        const dropX = cx + gs.dx;
        const dropY = cy + gs.dy;
        const targetIdx = nearestCell(dropX, dropY, cellIndex);

        if (targetIdx === -1) {
          snapBack();
          cbRef.current.onDragEnd();
          return;
        }

        const res = useStore.getState().resolveDrop(cellIndex, targetIdx);

        if (res.result === 'moved') {
          hardReset();
          // Zincir varsa DyingNodesLayer sesi/animasyonu yönetir
          cbRef.current.onDragEnd();
        } else if (res.result === 'merged') {
          hardReset();
          // Direkt birleşme: orta şiddet haptik; ses DyingNodesLayer'dan gelir
          safeHaptic.impact(Haptics.ImpactFeedbackStyle.Medium);
          cbRef.current.onDragEnd();
        } else if (res.result === 'swapped') {
          hardReset();
          // Yer değiştirme: swoosh ses + hafif haptik + pulse
          playSwapSound();
          safeHaptic.impact(Haptics.ImpactFeedbackStyle.Light);
          Animated.sequence([
            Animated.spring(scaleAnim, { toValue: 1.20, speed: 90, bounciness: 4, useNativeDriver: false }),
            Animated.spring(scaleAnim, { toValue: 1, speed: 40, bounciness: 10, useNativeDriver: false }),
          ]).start();
          cbRef.current.onDragEnd();
        } else {
          snapBack();
          cbRef.current.onDragEnd();
        }
      },

      onPanResponderTerminate: () => {
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: false }).start();
        snapBack();
        cbRef.current.onDragEnd();
      },
    })
  ).current;

  return (
    <Animated.View
      style={[
        styles.nodeAbs,
        {
          left: cx - HEX_W / 2,
          top: cy - HEX_R,
          width: HEX_W,
          height: HEX_H,
          zIndex: isDragging ? 100 : 1,
          elevation: isDragging ? 20 : 1,
          opacity: mountOpacity,
          transform: [
            { translateX: pan.x },
            { translateY: pan.y },
            { scale: scaleAnim },
            { scale: mountScale },
          ],
        },
      ]}
      {...panResponder.panHandlers}
    >
      <Animated.View style={{ flex: 1, transform: [{ scale: mergeScale }] }}>
        <NodeHex value={value} />
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { opacity: mergeGlow }]}
        >
          <Svg width={HEX_W} height={HEX_H} viewBox={`0 0 ${HEX_W} ${HEX_H}`}>
            <Polygon
              points={hexPoints(HEX_W / 2, HEX_R, DRAW_R + 6)}
              fill="none"
              stroke={nodeStrokeColor(value)}
              strokeWidth={5}
              strokeLinejoin="miter"
            />
          </Svg>
        </Animated.View>
        {/* Kilitli hücre overlay */}
        {isLocked > 0 && (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.lockedOverlay]}>
            <Text style={styles.lockedIcon}>⛓</Text>
            <Text style={styles.lockedCount}>{isLocked}</Text>
          </View>
        )}
      </Animated.View>
    </Animated.View>
  );
}

// ── GameOverModal ─────────────────────────────────────────────────────────────
function GameOverModal({ visible, onOpenLab }) {
  const collectPrestigeAndReset = useStore((s) => s.collectPrestigeAndReset);
  const cells = useStore((s) => s.cells);
  const best = cells.reduce((max, c) => (c && c.value > max ? c.value : max), 0);
  const earned = scoreToHexaCore(cells);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.82)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const glowLoopRef = useRef(null);

  useEffect(() => {
    if (visible) {
      // fadeAnim ve scaleAnim: useNativeDriver false (borderColor JS-side olduğundan tutarlı olmalı)
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 320, useNativeDriver: false }),
        Animated.spring(scaleAnim, { toValue: 1, speed: 12, bounciness: 10, useNativeDriver: false }),
      ]).start();
      // glowAnim loopunu ayrı başlat (farklı driver karışmasın)
      glowLoopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 1200, useNativeDriver: false }),
          Animated.timing(glowAnim, { toValue: 0.3, duration: 1200, useNativeDriver: false }),
        ])
      );
      glowLoopRef.current.start();
    } else {
      glowLoopRef.current?.stop();
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.82);
      glowAnim.setValue(0);
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible) return null;

  const glowBorder = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(140,30,220,0.45)', 'rgba(200,60,255,0.95)'],
  });
  const glowShadow = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [4, 14],
  });

  return (
    <Modal visible transparent statusBarTranslucent onRequestClose={() => {}}>
      {/* Karanlık overlay */}
      <Animated.View style={[styles.goOverlay, { opacity: fadeAnim }]}>
        {/* Modal kutu */}
        <Animated.View style={[
          styles.goBox,
          {
            transform: [{ scale: scaleAnim }],
            borderColor: glowBorder,
            shadowRadius: glowShadow,
          },
        ]}>
          {/* Başlık şeridi */}
          <View style={styles.goTitleBlock}>
            <Text style={styles.goTitleSub}>// AĞAZ SİSTEM RAPORU</Text>
            <Text style={styles.goTitle}>SİSTEM KİLİTLENDİ</Text>
          </View>

          {/* Kırmızı çizgi */}
          <View style={styles.goLine} />

          {/* Skor satırı */}
          <View style={styles.goScoreRow}>
            <View style={styles.goScoreCell}>
              <Text style={styles.goScoreLbl}>EN YÜKSEK</Text>
              <Text style={styles.goScoreVal}>{formatNum(best)}</Text>
            </View>
            <View style={styles.goScoreDivider} />
            <View style={styles.goScoreCell}>
              <Text style={styles.goScoreLbl}>ÇIKARILAN</Text>
              {/* HexaCore miktarı — SVG ikon ile */}
              <View style={styles.goHcRow}>
                <Text style={styles.goHcNum}>+{earned}</Text>
                <HexaCoreIcon size={22} color="#cc66ff" />
              </View>
            </View>
          </View>

          <View style={styles.goLine} />

          {/* Buton sırası */}
          <View style={styles.goBtnRow}>
            <TouchableOpacity
              style={styles.goRestartBtn}
              onPress={() => {
                safeHaptic.impact(Haptics.ImpactFeedbackStyle.Heavy);
                collectPrestigeAndReset();
              }}
              activeOpacity={0.82}
            >
              <Text style={styles.goRestartTxt}>YENİDEN BAŞLAT</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.goLabBtn}
              onPress={() => {
                safeHaptic.impact(Haptics.ImpactFeedbackStyle.Light);
                onOpenLab();
              }}
              activeOpacity={0.82}
            >
              <Text style={styles.goLabTxt}>LABORATUVAR</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

// ── LabModal — Prestij Yükseltme Marketi ─────────────────────────────────────
function LabModal({ visible, onClose }) {
  const hexaCore = useStore((s) => s.hexaCore);
  const prestigeUpgrades = useStore((s) => s.prestigeUpgrades);
  const buyPrestigeUpgrade = useStore((s) => s.buyPrestigeUpgrade);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(60)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, speed: 16, bounciness: 8, useNativeDriver: true }),
      ]).start();
    } else {
      fadeAnim.setValue(0);
      slideAnim.setValue(60);
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible) return null;

  const UPGRADE_ROWS = [
    { id: 'dataFlow', ...PRESTIGE_UPGRADES.dataFlow },
    { id: 'richStart', ...PRESTIGE_UPGRADES.richStart },
    { id: 'advancedNode', ...PRESTIGE_UPGRADES.advancedNode },
  ];

  return (
    <Modal visible transparent statusBarTranslucent onRequestClose={onClose}>
      <Animated.View style={[styles.modalOverlay, { opacity: fadeAnim }]}>
        <Animated.View style={[styles.labBox, { transform: [{ translateY: slideAnim }] }]}>
          {/* Başlık */}
          <Text style={styles.labTitle}>L A B O R A T U V A R</Text>
          <View style={styles.labHexaCoreRow}>
            <HexaCoreIcon size={20} color="#cc66ff" />
            <Text style={styles.labHexaCoreNum}> {hexaCore}</Text>
            <Text style={styles.labHexaCoreLabel}>  HexaCore</Text>
          </View>
          <View style={styles.goDivider} />

          {/* Yükseltmeler */}
          {UPGRADE_ROWS.map((upg) => {
            const curLevel = prestigeUpgrades?.[upg.id] ?? 0;
            const isMaxed = curLevel >= upg.maxLevel;
            const cost = isMaxed ? null : upg.costs[curLevel];
            const canAfford = !isMaxed && hexaCore >= cost;

            return (
              <View key={upg.id} style={styles.labUpgRow}>
                <View style={styles.labUpgInfo}>
                  <View style={styles.labUpgTitleRow}>
                    <Text style={styles.labUpgName}>{upg.name}</Text>
                    <Text style={styles.labUpgLevel}>
                      {isMaxed ? 'MAX' : `Lv ${curLevel}/${upg.maxLevel}`}
                    </Text>
                  </View>
                  <Text style={styles.labUpgDesc}>{upg.desc}</Text>
                </View>
                <TouchableOpacity
                  style={[
                    styles.labUpgBtn,
                    isMaxed && styles.labUpgBtnMaxed,
                    !canAfford && !isMaxed && styles.labUpgBtnDim,
                  ]}
                  disabled={isMaxed}
                  onPress={() => {
                    const res = buyPrestigeUpgrade(upg.id);
                    if (res.ok) safeHaptic.impact(Haptics.ImpactFeedbackStyle.Medium);
                    else safeHaptic.notification(Haptics.NotificationFeedbackType.Error);
                  }}
                  activeOpacity={0.75}
                >
                  {isMaxed ? (
                    <Text style={styles.labUpgBtnTxt}>✓</Text>
                  ) : (
                    <View style={styles.labCostRow}>
                      <Text style={[styles.labUpgBtnTxt, !canAfford && { opacity: 0.45 }]}>{cost}</Text>
                      <HexaCoreIcon size={12} color={canAfford ? '#dd88ff' : '#443355'} />
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            );
          })}

          <TouchableOpacity style={[styles.btn, { marginTop: 18 }]} onPress={onClose} activeOpacity={0.85}>
            <Text style={styles.btnText}>K A P A T</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

// ── DyingNode — zincir sonucu silinen taşın animasyonu ────────────────────────
// fullTravel=true  → Fermuar adımı: tam hedefe (%100) uçar, scale 0.5, 200ms
// fullTravel=false → Yıldız adımı: %55 merkeze uçar, scale 0.22, 270ms
function DyingNode({ cellIdx, value, targetIdx, onDone, fullTravel = false }) {
  const { cx, cy } = CELLS[cellIdx];
  const { cx: tcx, cy: tcy } = CELLS[targetIdx];
  const dx = tcx - cx;
  const dy = tcy - cy;

  const transX = useRef(new Animated.Value(0)).current;
  const transY = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    const frac = fullTravel ? 1.0 : 0.55;   // tam hedefe git
    const endScale = fullTravel ? 0.5 : 0.22;
    const dur = fullTravel ? 200 : 270;
    Animated.parallel([
      Animated.timing(transX, { toValue: dx * frac, duration: dur, useNativeDriver: false }),
      Animated.timing(transY, { toValue: dy * frac, duration: dur, useNativeDriver: false }),
      Animated.timing(scaleAnim, { toValue: endScale, duration: dur, useNativeDriver: false }),
      Animated.timing(opacity, { toValue: 0, duration: dur - 30, useNativeDriver: false }),
    ]).start(onDone);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.nodeAbs,
        {
          left: cx - HEX_W / 2,
          top: cy - HEX_R,
          width: HEX_W,
          height: HEX_H,
          zIndex: 50,
          opacity,
          transform: [
            { translateX: transX },
            { translateY: transY },
            { scale: scaleAnim },
          ],
        },
      ]}
    >
      <NodeHex value={value} />
    </Animated.View>
  );
}

// ── DyingNodesLayer — tüm zincir VFX + ses yönetimi ──────────────────────────
const COMBO_TEXT_STYLE = {
  fontSize: Math.round(SCREEN_WIDTH * 0.048),
  color: '#ffdd00',
  fontWeight: '800',
  letterSpacing: 1,
};

// ── ExplosionNode: Aşırı Yükleme patlaması için kırmızı patlama efekti ────────
function ExplosionNode({ cellIdx, onDone }) {
  const { cx, cy } = CELLS[cellIdx];
  const scale = useRef(new Animated.Value(0.4)).current;
  const opacity = useRef(new Animated.Value(0.9)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(scale, { toValue: 2.6, duration: 400, useNativeDriver: false }),
      Animated.timing(opacity, { toValue: 0, duration: 370, useNativeDriver: false }),
    ]).start(onDone);
  }, []);
  const size = HEX_W * 1.1;
  return (
    <Animated.View pointerEvents="none" style={{
      position: 'absolute',
      left: cx - size / 2,
      top: cy - HEX_R * 1.1,
      width: size, height: size,
      zIndex: 90, opacity,
      transform: [{ scale }],
    }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Polygon
          points={hexPoints(size / 2, size * 0.47, DRAW_R * 0.85)}
          fill="#ff2200" stroke="#ffaa00" strokeWidth={3}
        />
      </Svg>
    </Animated.View>
  );
}

// ── ExplosionLayer: lastOverloadEvent'e göre patlama render eder ─────────────
function ExplosionLayer() {
  const lastOverloadEvent = useStore((s) => s.lastOverloadEvent);
  const [activeExplosions, setActiveExplosions] = useState([]);
  const seenId = useRef(null);
  useEffect(() => {
    if (!lastOverloadEvent || lastOverloadEvent.id === seenId.current) return;
    if (!lastOverloadEvent.exploded) return; // Başarılı yükseltme = farklı efekt
    seenId.current = lastOverloadEvent.id;
    const uid = lastOverloadEvent.id;
    setActiveExplosions((prev) => [...prev, { ...lastOverloadEvent, uid }]);
  }, [lastOverloadEvent]);
  return (
    <>
      {activeExplosions.map((ev) => (
        <ExplosionNode
          key={ev.uid}
          cellIdx={ev.cellIdx}
          onDone={() => setActiveExplosions((prev) => prev.filter((x) => x.uid !== ev.uid))}
        />
      ))}
    </>
  );
}

// onMerge(mergedAt): birleşme merkezi hücresi için parent'a bildirim (glow için)
// Her step ~180ms arayla sırayla oynatılır → fermuar/domino animasyonu
function DyingNodesLayer({ onMerge }) {
  const lastChainEvent = useStore((s) => s.lastChainEvent);
  const [dyingNodes, setDyingNodes] = useState([]);
  const [comboFloats, setComboFloats] = useState([]);
  const lastIdRef = useRef(null);

  useEffect(() => {
    if (!lastChainEvent || lastChainEvent.id === lastIdRef.current) return;
    lastIdRef.current = lastChainEvent.id;

    const { steps, finalMergedAt, chainDepth, id } = lastChainEvent;
    // Eski format desteği (steps yoksa)
    if (!steps || steps.length === 0) return;

    const STEP_DELAY = 185; // ms — her adım arası gecikme

    steps.forEach((step, stepIdx) => {
      setTimeout(() => {
        // Bu adımın DyingNode'larını oluştur
        // fromIdx/toIdx: animasyonun nereden nereye gittiğini kesin olarak belirtir
        const batch = step.cleared
          .filter((item) => item.fromIdx >= 0) // fromIdx=-1 = dock taşı, animasyona gerek yok
          .map((item, i) => ({
            id: `dying-${id}-${stepIdx}-${i}`,
            cellIdx: item.fromIdx,
            targetIdx: item.toIdx,
            value: item.value,
            fullTravel: step.travel === true,
          }));
        if (batch.length > 0) {
          setDyingNodes((prev) => [...prev, ...batch]);
        }

        // Bu adımın birleşme merkezine glow bildir
        if (onMerge) onMerge(step.mergedAt);

        // Yükselen pitch ile merge sesi
        playMergeWithRate(Math.min(1.0 + stepIdx * 0.13, 1.65));
        safeHaptic.impact(Haptics.ImpactFeedbackStyle.Medium);
      }, stepIdx * STEP_DELAY);
    });

    // ×N KOMBO yazısı — son adımdan 80ms sonra göster
    if (chainDepth >= 2) {
      const lastMergedAt = finalMergedAt ?? steps[steps.length - 1]?.mergedAt;
      if (lastMergedAt != null) {
        setTimeout(() => {
          const { cx, cy } = CELLS[lastMergedAt];
          setComboFloats((prev) => [
            ...prev,
            { id: `combo-${id}`, x: cx, y: cy, text: `×${chainDepth} KOMBO` },
          ]);
        }, (steps.length - 1) * STEP_DELAY + 80);
      }
    }
  }, [lastChainEvent]); // eslint-disable-line react-hooks/exhaustive-deps

  const removeDying = useCallback((nodeId) => {
    setDyingNodes((prev) => prev.filter((d) => d.id !== nodeId));
  }, []);

  const removeCombo = useCallback((floatId) => {
    setComboFloats((prev) => prev.filter((f) => f.id !== floatId));
  }, []);

  return (
    <>
      {dyingNodes.map((d) => (
        <DyingNode
          key={d.id}
          cellIdx={d.cellIdx}
          value={d.value}
          targetIdx={d.targetIdx}
          fullTravel={d.fullTravel}
          onDone={() => removeDying(d.id)}
        />
      ))}
      {comboFloats.map((f) => (
        <FloatingText
          key={f.id}
          x={f.x}
          y={f.y}
          text={f.text}
          textStyle={COMBO_TEXT_STYLE}
          onDone={() => removeCombo(f.id)}
        />
      ))}
    </>
  );
}

// ── HexGrid ───────────────────────────────────────────────────────────────────
function HexGrid({ onGridMeasure, isDragActive }) {
  const cells = useStore((s) => s.cells);
  const activePowerUp = useStore((s) => s.activePowerUp);
  const wormholeFirstIdx = useStore((s) => s.wormholeFirstIdx);
  const lockedCells = useStore((s) => s.lockedCells);
  const applyBlackHole = useStore((s) => s.applyBlackHole);
  const applyWormhole = useStore((s) => s.applyWormhole);
  const applyOverload = useStore((s) => s.applyOverload);

  const [draggingIdx, setDraggingIdx] = useState(null);
  const [mergedCellIdx, setMergedCellIdx] = useState(null);
  const gridViewRef = useRef(null);

  const handleDragStart = useCallback((idx) => setDraggingIdx(idx), []);
  const handleDragEnd = useCallback(() => setDraggingIdx(null), []);
  const handleChainMerge = useCallback((mergedAt) => setMergedCellIdx(mergedAt), []);

  // Power-up aktifken dolu hücreye dokunma
  const handlePowerUpCellTap = useCallback((idx) => {
    if (activePowerUp === 'blackhole') applyBlackHole(idx);
    else if (activePowerUp === 'wormhole') applyWormhole(idx);
    else if (activePowerUp === 'overload') applyOverload(idx);
  }, [activePowerUp, applyBlackHole, applyWormhole, applyOverload]);

  const needsPowerTap = activePowerUp === 'blackhole' || activePowerUp === 'wormhole' || activePowerUp === 'overload';

  // Grid'in ekrandaki mutlak konumunu ölç ve App'e bildir
  const measureGrid = useCallback(() => {
    if (!gridViewRef.current || !onGridMeasure) return;
    gridViewRef.current.measure((_fx, _fy, _w, _h, px, py) => {
      onGridMeasure(px, py);
    });
  }, [onGridMeasure]);

  return (
    <View ref={gridViewRef} onLayout={measureGrid} style={{ width: SVG_W, height: SVG_H }}>
      <Svg
        width={SVG_W} height={SVG_H}
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        style={StyleSheet.absoluteFill}
      >
        {CELLS.map(({ cx, cy, id }) => (
          <Polygon
            key={`glow-${id}`}
            points={hexPoints(cx, cy, DRAW_R + 4)}
            fill={C.hexGlow}
            stroke="none"
            opacity={0.8}
          />
        ))}
        {CELLS.map(({ cx, cy, id }) => (
          <Polygon
            key={id}
            points={hexPoints(cx, cy, DRAW_R)}
            fill={C.hexEmpty}
            stroke={C.hexStroke}
            strokeWidth={1.4}
            strokeLinejoin="miter"
            opacity={0.95}
          />
        ))}
        {/* Preview drag aktifken boş hücreler hafifçe parlar */}
        {isDragActive && cells.map((cell, idx) => {
          if (cell !== null) return null;
          const { cx, cy } = CELLS[idx];
          return (
            <Polygon
              key={`hint-${idx}`}
              points={hexPoints(cx, cy, DRAW_R - 1)}
              fill="#2a1050"
              stroke="#9944ff"
              strokeWidth={1.5}
              opacity={0.55}
            />
          );
        })}
        {/* Wormhole ilk seçim vurgusu */}
        {wormholeFirstIdx !== null && CELLS[wormholeFirstIdx] && (() => {
          const { cx, cy } = CELLS[wormholeFirstIdx];
          return (
            <Polygon
              key="wormhole-first"
              points={hexPoints(cx, cy, DRAW_R + 5)}
              fill="none"
              stroke="#00eeff"
              strokeWidth={3}
              opacity={0.9}
            />
          );
        })()}
      </Svg>

      {cells.map((cell, idx) =>
        cell ? (
          <DraggableNode
            key={`n-${idx}`}
            cellIndex={idx}
            value={cell.value}
            isDragging={draggingIdx === idx}
            justMerged={mergedCellIdx === idx}
            isLocked={lockedCells[idx] || 0}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onMergedAtIdx={setMergedCellIdx}
          />
        ) : null
      )}

      {/* Power-up aktifken dolu hücrelerin üstüne şeffaf dokunma alanı */}
      {needsPowerTap && cells.map((cell, idx) => {
        if (!cell) return null;
        const { cx, cy } = CELLS[idx];
        const isWFirst = wormholeFirstIdx === idx;
        return (
          <TouchableOpacity
            key={`pu-tap-${idx}`}
            activeOpacity={0.55}
            onPress={() => handlePowerUpCellTap(idx)}
            style={{
              position: 'absolute',
              left: cx - HEX_W / 2,
              top: cy - HEX_R,
              width: HEX_W,
              height: HEX_H,
              zIndex: 200,
              borderRadius: 5,
              backgroundColor: isWFirst ? 'rgba(0,238,255,0.18)' : 'rgba(160,80,255,0.15)',
            }}
          />
        );
      })}

      <DyingNodesLayer onMerge={handleChainMerge} />
      <ExplosionLayer />
    </View>
  );
}

// ── PowerUpBtn — tek bir yetenek butonu (kırmızı flaş desteği) ──────────────
function PowerUpBtn({ def, cost, isActive, canAfford, canUse, onPress }) {
  // Border animasyonu: tıklanınca kırmızı flaş → mat griye geri dön
  const borderAnim = useRef(new Animated.Value(0)).current;
  const flashRef   = useRef(null);

  const triggerFlash = useCallback(() => {
    flashRef.current?.stop();
    borderAnim.setValue(1);
    flashRef.current = Animated.timing(borderAnim, {
      toValue: 0,
      duration: 220,
      useNativeDriver: false,
    });
    flashRef.current.start();
  }, [borderAnim]);

  const handleTap = useCallback(() => {
    if (!canUse) {
      safeHaptic.notification(Haptics.NotificationFeedbackType.Error);
      playSound('error');
      triggerFlash();
      return;
    }
    onPress(def.id);
  }, [canUse, onPress, def.id, triggerFlash]);

  const iconSize   = Math.round(SCREEN_WIDTH * 0.062);
  // İkon rengi: aktifse beyaz, yetmiyorsa %50 opak asıl renk, yetiyorsa asıl renk
  const iconColor  = isActive ? '#ffffff' : def.defaultColor;
  const iconOpacity = canAfford ? 1 : 0.45;

  // Border rengi: flaş sırasında kırmızı, normal durumda canAfford'a göre
  const animBorderColor = borderAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [
      isActive ? '#cc44ff' : (canAfford ? '#4422aa' : '#444455'),
      '#ff3355',
    ],
  });

  const costColor   = canAfford ? '#ffffff' : '#ff3355';
  const hcIconColor = canAfford ? '#aa44ff' : '#ff3355';

  return (
    <TouchableOpacity onPress={handleTap} activeOpacity={0.75}>
      <Animated.View style={[
        styles.powerBtn,
        isActive && styles.powerBtnActive,
        { borderColor: animBorderColor },
      ]}>
        <View style={{ opacity: iconOpacity }}>
          <def.Icon size={iconSize} color={iconColor} />
        </View>
        <View style={styles.powerCostRow}>
          <Text style={[styles.powerCost, { color: costColor }]}>{cost}</Text>
          <HexaCoreIcon size={11} color={hcIconColor} />
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

// ── PowerUpBar ────────────────────────────────────────────────────────────────
function PowerUpBar() {
  const activePowerUp  = useStore((s) => s.activePowerUp);
  const activatePowerUp = useStore((s) => s.activatePowerUp);
  const applyRewind    = useStore((s) => s.applyRewind);
  const cancelPowerUp  = useStore((s) => s.cancelPowerUp);
  const hexaCore       = useStore((s) => s.hexaCore);
  const undoCostIdx    = useStore((s) => s.undoCostIdx);
  const previousState  = useStore((s) => s.previousState);

  const hcCosts = {
    blackhole: POWER_HC_COST.blackhole,
    wormhole:  POWER_HC_COST.wormhole,
    overload:  POWER_HC_COST.overload,
    rewind:    UNDO_COSTS[Math.min(undoCostIdx, UNDO_COSTS.length - 1)],
  };

  const handlePress = useCallback((id) => {
    if (id === 'rewind') {
      applyRewind();
      return;
    }
    if (activePowerUp === id) cancelPowerUp();
    else activatePowerUp(id);
  }, [activePowerUp, activatePowerUp, cancelPowerUp, applyRewind]);

  return (
    <View style={styles.powerBar}>
      {POWER_DEFS.map((p) => {
        const cost      = hcCosts[p.id];
        const canAfford = hexaCore >= cost;
        const canUse    = p.id === 'rewind' ? !!previousState && canAfford : canAfford;
        return (
          <PowerUpBtn
            key={p.id}
            def={p}
            cost={cost}
            isActive={activePowerUp === p.id}
            canAfford={canAfford}
            canUse={canUse}
            onPress={handlePress}
          />
        );
      })}
    </View>
  );
}

// ── PiecePreview — önizleme hex, doğrudan sürüklenebilir ─────────────────────
// canDrag=false ise taş soluk/kırmızımsı görünür; sürüklenirse hata sesi çalar
function PiecePreview({ value, pieceIdx, canDrag, onDragStart, onDragMove, onDragEnd }) {
  const liftAnim = useRef(new Animated.Value(1)).current;

  // Her render'da güncel değerlere erişmek için ref — PanResponder closure tuzağını önler
  const cbRef = useRef({ value, pieceIdx, canDrag, onDragStart, onDragMove, onDragEnd });
  cbRef.current = { value, pieceIdx, canDrag, onDragStart, onDragMove, onDragEnd };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 4 || Math.abs(gs.dy) > 4,

      onPanResponderGrant: (evt, gs) => {
        const { canDrag: cd, pieceIdx: pi, value: val, onDragStart: ds } = cbRef.current;
        if (!cd) {
          safeHaptic.notification(Haptics.NotificationFeedbackType.Error);
          playSound('error');
          return;
        }
        Animated.spring(liftAnim, { toValue: 1.18, speed: 60, useNativeDriver: false }).start();
        ds(pi, val, gs.moveX, gs.moveY);
      },

      onPanResponderMove: (evt, gs) => {
        cbRef.current.onDragMove(gs.moveX, gs.moveY);
      },

      onPanResponderRelease: (evt, gs) => {
        Animated.spring(liftAnim, { toValue: 1, speed: 50, useNativeDriver: false }).start();
        cbRef.current.onDragEnd(gs.moveX, gs.moveY);
      },

      onPanResponderTerminate: () => {
        Animated.spring(liftAnim, { toValue: 1, speed: 50, useNativeDriver: false }).start();
        cbRef.current.onDragEnd(-9999, -9999);
      },
    })
  ).current;

  const fill = canDrag ? nodeColor(value) : '#2a1020';
  const stroke = canDrag ? nodeStrokeColor(value) : '#662233';
  const cx = PREVIEW_W / 2;
  const cy = PREVIEW_R;
  const label = formatNum(value);
  const fs = label.length <= 2 ? Math.round(PREVIEW_R * 0.44) : Math.round(PREVIEW_R * 0.35);
  const pad = 10;

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={{ transform: [{ scale: liftAnim }], opacity: canDrag ? 1 : 0.45 }}
    >
      <Svg
        width={PREVIEW_W + pad * 2}
        height={PREVIEW_H + pad * 2}
        viewBox={`${-pad} ${-pad} ${PREVIEW_W + pad * 2} ${PREVIEW_H + pad * 2}`}
      >
        {/* Sürüklenebilir hint halkası */}
        <Polygon
          points={hexPoints(cx, cy, PREVIEW_DRAW_R + 7)}
          fill="none"
          stroke={stroke}
          strokeWidth={1.5}
          opacity={0.35}
        />
        {/* Dolgu */}
        <Polygon
          points={hexPoints(cx, cy, PREVIEW_DRAW_R)}
          fill={fill}
          stroke={stroke}
          strokeWidth={STROKE_W * 1.6}
          strokeLinejoin="miter"
        />
        {/* Değer etiketi */}
        <SvgText
          x={cx} y={cy + fs * 0.36}
          textAnchor="middle"
          fontSize={fs}
          fill={C.nodeText}
          fontWeight="600"
        >
          {label}
        </SvgText>
      </Svg>
    </Animated.View>
  );
}

// ── MainMenu ────────────────────────────────────────────────────────────────────
function MainMenu() {
  const hexaCore      = useStore((s) => s.hexaCore);
  const setScreen     = useStore((s) => s.setScreen);
  const setLabOpen    = useStore((s) => s.setLabOpen);
  const soundEnabled  = useStore((s) => s.soundEnabled);
  const hapticsEnabled = useStore((s) => s.hapticsEnabled);
  const toggleSound   = useStore((s) => s.toggleSound);
  const toggleHaptics = useStore((s) => s.toggleHaptics);

  // Başlık için animasyonlu parlama
  const glowAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1800, useNativeDriver: false }),
        Animated.timing(glowAnim, { toValue: 0, duration: 1800, useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const titleGlow = glowAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: ['#7722cc', '#dd66ff'],
  });

  const handlePlay = () => {
    safeHaptic.impact(Haptics.ImpactFeedbackStyle.Medium);
    setScreen('GAME');
  };

  const handleLab = () => {
    safeHaptic.impact(Haptics.ImpactFeedbackStyle.Light);
    setScreen('GAME');
    setLabOpen(true);
  };

  const handleToggleSound = () => {
    safeHaptic.impact(Haptics.ImpactFeedbackStyle.Light);
    toggleSound();
  };

  const handleToggleHaptics = () => {
    // Haptik kapat/aç için — kapatmadan önce son bir titreşim ver
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleHaptics();
  };

  return (
    <SafeAreaView style={menuStyles.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* ── Üst: Logo + HexaCore ─────────────────────────────────────── */}
      <View style={menuStyles.topSection}>
        <View style={menuStyles.logoWrap}>
          {/* Arka plan dekor çizgisi */}
          <View style={menuStyles.logoDividerTop} />
          <Animated.Text style={[menuStyles.logoText, { color: titleGlow }]}>
            HEXANODE
          </Animated.Text>
          <Text style={menuStyles.logoSub}>DARK NEON PROTOCOL</Text>
          <View style={menuStyles.logoDividerBot} />
        </View>

        <View style={menuStyles.hcRow}>
          <HexaCoreIcon size={20} color="#aa44ff" />
          <Text style={menuStyles.hcVal}>{hexaCore}</Text>
          <Text style={menuStyles.hcLabel}> HexaCore</Text>
        </View>
      </View>

      {/* ── Orta: Ana Butonlar ───────────────────────────────────────── */}
      <View style={menuStyles.midSection}>
        <TouchableOpacity style={menuStyles.playBtn} onPress={handlePlay} activeOpacity={0.82}>
          <View style={menuStyles.playBtnInner}>
            <Text style={menuStyles.playBtnText}>SİSTEME GİRİŞ</Text>
            <Text style={menuStyles.playBtnSub}>O Y N A</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={menuStyles.labBtn} onPress={handleLab} activeOpacity={0.82}>
          <Text style={menuStyles.labBtnText}>LABORATUVAR</Text>
          <View style={menuStyles.labBtnHcRow}>
            <HexaCoreIcon size={14} color="#aa44ff" />
            <Text style={menuStyles.labBtnSub}> Prestij Marketi</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* ── Alt: Ayarlar ─────────────────────────────────────────────── */}
      <View style={menuStyles.bottomSection}>
        <Text style={menuStyles.settingsLabel}>A Y A R L A R</Text>
        <View style={menuStyles.toggleRow}>

          {/* Ses Toggleu */}
          <TouchableOpacity
            style={[menuStyles.toggleBtn, soundEnabled && menuStyles.toggleBtnOn]}
            onPress={handleToggleSound}
            activeOpacity={0.78}
          >
            {soundEnabled
              ? <SoundOnIcon size={30} color="#aa44ff" />
              : <SoundOffIcon size={30} color="#444455" />}
            <Text style={[menuStyles.toggleLabel, soundEnabled ? menuStyles.toggleLabelOn : menuStyles.toggleLabelOff]}>
              {soundEnabled ? 'SES AÇIK' : 'SES KAPALI'}
            </Text>
          </TouchableOpacity>

          {/* Titreşim Toggleu */}
          <TouchableOpacity
            style={[menuStyles.toggleBtn, hapticsEnabled && menuStyles.toggleBtnOn]}
            onPress={handleToggleHaptics}
            activeOpacity={0.78}
          >
            {hapticsEnabled
              ? <VibrationOnIcon size={30} color="#aa44ff" />
              : <VibrationOffIcon size={30} color="#444455" />}
            <Text style={[menuStyles.toggleLabel, hapticsEnabled ? menuStyles.toggleLabelOn : menuStyles.toggleLabelOff]}>
              {hapticsEnabled ? 'TİTREŞİM AÇIK' : 'TİTREŞİM KAPALI'}
            </Text>
          </TouchableOpacity>

        </View>
      </View>
    </SafeAreaView>
  );
}

// ── App ────────────────────────────────────────────────────────────────────────
export default function App() {
  const collectOffline    = useStore((s) => s.collectOffline);
  const cells             = useStore((s) => s.cells);
  const credits           = useStore((s) => s.credits);
  const uretMaliyeti      = useStore((s) => s.uretMaliyeti);
  const offlineEarned     = useStore((s) => s.offlineEarned);
  const offlineCapReached = useStore((s) => s.offlineCapReached);
  const nextPieces        = useStore((s) => s.nextPieces);
  const gameOver          = useStore((s) => s.gameOver);
  // Navigasyon + Lab (store'dan)
  const currentScreen     = useStore((s) => s.currentScreen);
  const setScreen         = useStore((s) => s.setScreen);
  const labOpen           = useStore((s) => s.labOpen);
  const setLabOpen        = useStore((s) => s.setLabOpen);
  const handleOpenLab     = useCallback(() => setLabOpen(true), [setLabOpen]);
  const handleCloseLab    = useCallback(() => setLabOpen(false), [setLabOpen]);

  // Sürükleme ghost durumu
  const [ghost, setGhost] = useState({ active: false, value: null, pieceIdx: null, x: 0, y: 0 });
  const dragPieceIdxRef = useRef(null);
  const gridAbsPos = useRef({ x: 0, y: 0 });

  // Menüye dön (onay olmadan; üstte küçük buton)
  const handleGoMenu = useCallback(() => {
    safeHaptic.impact(Haptics.ImpactFeedbackStyle.Light);
    setScreen('MENU');
  }, [setScreen]);

  const modalVisible = offlineEarned != null && offlineEarned > 0;
  const canDrag = true; // TEST: kredi sınırı kapalı

  useEffect(() => { initAudio(); }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      useStore.getState().tickIncome();
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const appState = useRef(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        useStore.getState().calculateOffline();
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, []);

  const handleCollect = useCallback(() => { collectOffline(); }, [collectOffline]);

  const handleGridMeasure = useCallback((px, py) => {
    gridAbsPos.current = { x: px, y: py };
  }, []);

  // Preview parçasından sürükleme başladı
  const handlePreviewDragStart = useCallback((pieceIdx, value, absX, absY) => {
    dragPieceIdxRef.current = pieceIdx;
    setGhost({ active: true, value, pieceIdx, x: absX, y: absY });
  }, []);

  // Parmak hareket etti
  const handlePreviewDragMove = useCallback((absX, absY) => {
    setGhost((prev) => ({ ...prev, x: absX, y: absY }));
  }, []);

  // Parmak bırakıldı → hedef hücre bul → yerleştir
  const handlePreviewDragEnd = useCallback((absX, absY) => {
    const pi = dragPieceIdxRef.current;
    setGhost({ active: false, value: null, pieceIdx: null, x: 0, y: 0 });
    if (absX < 0 || pi === null) return;
    const relX = absX - gridAbsPos.current.x;
    const relY = absY - gridAbsPos.current.y;
    // Hem boş hem dolu hücrelere bırakılabilir (tolerans: 1.9x)
    const cellIdx = nearestCell(relX, relY, -1, 1.9);
    if (cellIdx === -1) return;
    const result = useStore.getState().spawnFromPreview(pi, cellIdx);
    if (result.ok) {
      safeHaptic.impact(Haptics.ImpactFeedbackStyle.Medium);
      playSound(result.merged ? 'merge' : 'spawn');
    } else {
      // wrongValue, locked veya başka geçersiz durum → hata
      safeHaptic.notification(Haptics.NotificationFeedbackType.Error);
      playSound('error');
    }
  }, []);

  // Ana Menü ekranını göster
  if (currentScreen === 'MENU') return <MainMenu />;

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Çevrimdışı Kazanç Modalı */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={handleCollect}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>AĞ ÇALIŞMAYA DEVAM ETTİ</Text>
            <Text style={styles.modalAmount}>+ {formatNum(offlineEarned ?? 0)} ✦</Text>
            {offlineCapReached && (
              <Text style={styles.offlineCapNote}>
                Maksimum kapasiteye ulaşıldı (4 Saat)
              </Text>
            )}
            <AnimatedPressable style={styles.btn} onPress={handleCollect} activeOpacity={0.9}>
              <Text style={styles.btnText}>T O P L A</Text>
            </AnimatedPressable>
          </View>
        </View>
      </Modal>

      {/* Oyun Bitti Modalı */}
      <GameOverModal visible={gameOver} onOpenLab={handleOpenLab} />

      {/* Prestij Market Modalı */}
      <LabModal visible={labOpen} onClose={handleCloseLab} />

      {/* Başlık */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <TouchableOpacity
            style={styles.homeBtn}
            onPress={handleGoMenu}
            activeOpacity={0.75}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <HomeIcon size={22} color="#aa44ff" />
          </TouchableOpacity>
          <Text style={styles.titleMain}>HEXANODE</Text>
        </View>
        <EconDisplay onOpenLab={handleOpenLab} />
      </View>

      {/* Oyun Alanı */}
      <View style={styles.gridWrapper}>
        <HexGrid onGridMeasure={handleGridMeasure} isDragActive={ghost.active} />
      </View>

      {/* Footer — Sürüklenebilir parça önizlemeleri + Power-up çubuğu */}
      <View style={styles.footer}>
        <Text style={styles.nextLabel}>S O N R A K İ  —  S Ü R Ü K L E</Text>
        <View style={styles.piecesRow}>
          {(nextPieces ?? [2, 4]).map((val, i) => (
            <PiecePreview
              key={i}
              pieceIdx={i}
              value={val}
              canDrag={canDrag}
              onDragStart={handlePreviewDragStart}
              onDragMove={handlePreviewDragMove}
              onDragEnd={handlePreviewDragEnd}
            />
          ))}
        </View>
        {!canDrag && (
          <Text style={styles.noCreditsHint}>
            Yeterli kredi yok — bekle
          </Text>
        )}
        <PowerUpBar />
      </View>

      {/* Sürükleme ghost — parmağın biraz üzerinde yüzer */}
      {ghost.active && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: ghost.x - HEX_W / 2,
            top: ghost.y - HEX_R * 2.4,
            width: HEX_W,
            height: HEX_H,
            zIndex: 999,
            elevation: 30,
          }}
        >
          <NodeHex value={ghost.value} />
        </View>
      )}
    </SafeAreaView>
  );
}

// ── Stiller ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
  },
  header: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 28,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  homeBtn: {
    padding: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3a1a6a',
    backgroundColor: '#12062a',
  },
  titleMain: {
    color: C.titlePrimary,
    fontSize: RFS.title,
    fontWeight: '100',
    letterSpacing: 13,
    opacity: 0.95,
  },
  econRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    minWidth: 220,
    justifyContent: 'center',
  },
  econCredits: {
    color: C.econCredits,
    fontSize: RFS.econCredit,
    fontWeight: '200',
    letterSpacing: 1.5,
  },
  econSep: {
    color: C.econSep,
    fontSize: RFS.econIncome,
    marginHorizontal: 4,
  },
  econIncome: {
    color: '#8866cc',
    fontSize: RFS.econIncome,
    fontWeight: '200',
    letterSpacing: 1,
  },
  gridWrapper: {
    flex: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeAbs: {
    position: 'absolute',
  },
  floatText: {
    color: '#cc99ff',
    fontSize: RFS.float,
    fontWeight: '300',
    letterSpacing: 0.5,
  },
  footer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 18,
    gap: 14,
  },
  nextPiecesBlock: {
    alignItems: 'center',
    gap: 8,
  },
  nextLabel: {
    color: '#7755aa',
    fontSize: Math.round(SCREEN_WIDTH * 0.020),
    fontWeight: '300',
    letterSpacing: 2,
  },
  noCreditsHint: {
    color: '#cc4455',
    fontSize: Math.round(SCREEN_WIDTH * 0.025),
    fontWeight: '300',
    letterSpacing: 1,
    marginTop: 4,
    opacity: 0.85,
  },
  piecesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  btn: {
    paddingHorizontal: 44,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: C.btnBorder,
    backgroundColor: C.btnBg,
    borderRadius: 9,
    shadowColor: '#7a55cc',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 5,
  },
  btnText: {
    color: C.btnText,
    fontSize: RFS.btnMain,
    fontWeight: '300',
    letterSpacing: 3.5,
  },
  btnDisabled: {
    borderColor: C.btnDisabledBorder,
    shadowOpacity: 0,
    elevation: 0,
    opacity: 0.45,
  },
  btnTextDisabled: {
    color: C.btnDisabledText,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: C.modalOverlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBox: {
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.modalBorder,
    borderRadius: 18,
    paddingHorizontal: 32,
    paddingTop: 40,
    paddingBottom: 36,
    alignItems: 'center',
    width: SCREEN_WIDTH - 60,
    shadowColor: '#7a50d0',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 24,
    elevation: 10,
  },
  modalTitle: {
    color: C.modalTitle,
    fontSize: RFS.mTitle,
    letterSpacing: 4,
    fontWeight: '300',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalAmount: {
    color: C.modalAmount,
    fontSize: RFS.mAmount,
    fontWeight: '100',
    letterSpacing: 2,
    marginBottom: 10,
  },
  offlineCapNote: {
    color: '#7755aa',
    fontSize: Math.round(SCREEN_WIDTH * 0.026),
    fontWeight: '300',
    letterSpacing: 1,
    marginBottom: 26,
    textAlign: 'center',
    opacity: 0.75,
  },
  gameOverSub: {
    color: '#6644aa',
    fontSize: RFS.mSub,
    fontWeight: '200',
    letterSpacing: 1.5,
    marginBottom: 20,
    textAlign: 'center',
  },
  gameOverBest: {
    color: '#cc88ff',
    fontSize: Math.round(SCREEN_WIDTH * 0.18),
    fontWeight: '100',
    letterSpacing: 4,
  },
  gameOverBestLabel: {
    color: '#6644aa',
    fontSize: Math.round(SCREEN_WIDTH * 0.022),
    fontWeight: '200',
    letterSpacing: 3,
    marginTop: 4,
  },
  // ── Game Over Cyberpunk Modal ─────────────────────────────────────────────
  // ── Game Over siberpunk modal ────────────────────────────────────────────
  goOverlay: {
    flex: 1,
    backgroundColor: 'rgba(4, 4, 10, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  goBox: {
    width: '85%',
    maxWidth: 400,
    backgroundColor: '#0f0b24',
    borderWidth: 2,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#aa44ff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    elevation: 24,
  },
  goTitleBlock: {
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 14,
    alignItems: 'center',
    backgroundColor: '#160930',
  },
  goTitleSub: {
    color: '#664488',
    fontSize: Math.round(SCREEN_WIDTH * 0.024),
    fontWeight: '300',
    letterSpacing: 2,
    marginBottom: 6,
    fontFamily: undefined,
  },
  goTitle: {
    color: '#ff2266',
    fontSize: Math.round(SCREEN_WIDTH * 0.052),
    fontWeight: '700',
    letterSpacing: 3,
    textAlign: 'center',
  },
  goLine: {
    height: 1,
    backgroundColor: '#2a0a55',
    marginHorizontal: 0,
  },
  goScoreRow: {
    flexDirection: 'row',
    paddingVertical: 20,
    paddingHorizontal: 12,
  },
  goScoreCell: {
    flex: 1,
    alignItems: 'center',
  },
  goScoreLbl: {
    color: '#6644aa',
    fontSize: Math.round(SCREEN_WIDTH * 0.022),
    fontWeight: '300',
    letterSpacing: 2,
    marginBottom: 6,
  },
  goScoreVal: {
    color: '#cc88ff',
    fontSize: Math.round(SCREEN_WIDTH * 0.13),
    fontWeight: '200',
    letterSpacing: 2,
    lineHeight: Math.round(SCREEN_WIDTH * 0.15),
  },
  goScoreDivider: {
    width: 1,
    backgroundColor: '#2a0a55',
    marginVertical: 4,
  },
  goHcRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  goHcNum: {
    color: '#dd88ff',
    fontSize: Math.round(SCREEN_WIDTH * 0.1),
    fontWeight: '300',
    lineHeight: Math.round(SCREEN_WIDTH * 0.12),
  },
  goBtnRow: {
    flexDirection: 'row',
    padding: 16,
    gap: 10,
  },
  goRestartBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#ff2266',
    backgroundColor: 'rgba(255,34,102,0.12)',
    alignItems: 'center',
  },
  goRestartTxt: {
    color: '#ff4488',
    fontSize: Math.round(SCREEN_WIDTH * 0.028),
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  goLabBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#7733cc',
    backgroundColor: 'rgba(100,30,200,0.15)',
    alignItems: 'center',
  },
  goLabTxt: {
    color: '#aa66ff',
    fontSize: Math.round(SCREEN_WIDTH * 0.028),
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  // (eski goLabBtnText artık kullanılmıyor — uyumluluk için boş bırak)
  goLabBtnText: {},
  goDivider: {
    width: '80%',
    height: 1,
    backgroundColor: '#3a1060',
    marginVertical: 12,
  },
  // ── Lab Modal ─────────────────────────────────────────────────────────────
  labBox: {
    backgroundColor: '#090118',
    borderWidth: 1.5,
    borderColor: '#3a1a70',
    borderRadius: 18,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 24,
    width: SCREEN_WIDTH - 40,
    shadowColor: '#7733cc',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 22,
    elevation: 14,
  },
  labTitle: {
    color: '#aa66ff',
    fontSize: Math.round(SCREEN_WIDTH * 0.04),
    fontWeight: '200',
    letterSpacing: 5,
    textAlign: 'center',
    marginBottom: 8,
  },
  labHexaCoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  labHexaCoreNum: {
    color: '#dd88ff',
    fontSize: Math.round(SCREEN_WIDTH * 0.046),
    fontWeight: '300',
  },
  labHexaCoreLabel: {
    color: '#7755aa',
    fontSize: Math.round(SCREEN_WIDTH * 0.028),
    fontWeight: '200',
  },
  labUpgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e0840',
  },
  labUpgInfo: {
    flex: 1,
    marginRight: 12,
  },
  labUpgTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  labUpgName: {
    color: '#cc88ff',
    fontSize: Math.round(SCREEN_WIDTH * 0.032),
    fontWeight: '300',
    letterSpacing: 0.5,
  },
  labUpgLevel: {
    color: '#9955cc',
    fontSize: Math.round(SCREEN_WIDTH * 0.025),
    fontWeight: '200',
  },
  labUpgDesc: {
    color: '#7755aa',
    fontSize: Math.round(SCREEN_WIDTH * 0.024),
    fontWeight: '200',
    lineHeight: Math.round(SCREEN_WIDTH * 0.034),
  },
  labUpgBtn: {
    minWidth: Math.round(SCREEN_WIDTH * 0.18),
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#7733cc',
    backgroundColor: '#1a0535',
    alignItems: 'center',
  },
  labUpgBtnMaxed: {
    borderColor: '#334',
    backgroundColor: '#0f0f1a',
  },
  labUpgBtnDim: {
    borderColor: '#3a1570',
  },
  labUpgBtnTxt: {
    color: '#dd88ff',
    fontSize: Math.round(SCREEN_WIDTH * 0.028),
    fontWeight: '300',
  },
  labCostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  // ── EconDisplay genişletilmiş ─────────────────────────────────────────────
  econCol: {
    alignItems: 'center',
    gap: 4,
  },
  hexaCoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a0a55',
    backgroundColor: '#0e0228',
    gap: 4,
  },
  hexaCoreText: {
    color: '#9955cc',
    fontSize: Math.round(SCREEN_WIDTH * 0.026),
    fontWeight: '200',
    letterSpacing: 1,
  },
  // ── Power-up çubuğu ────────────────────────────────────────────────────────
  powerBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    gap: 10,
  },
  powerBtn: {
    width: Math.round(SCREEN_WIDTH * 0.165),
    height: Math.round(SCREEN_WIDTH * 0.165),
    borderRadius: Math.round(SCREEN_WIDTH * 0.083),
    borderWidth: 1.5,
    // borderColor: animasyonla kontrol edildiği için burada yok
    backgroundColor: '#1a0838',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7733cc',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  powerBtnActive: {
    backgroundColor: '#2a0860',
    shadowColor: '#cc44ff',
    shadowOpacity: 0.7,
    shadowRadius: 12,
    elevation: 8,
  },
  powerIcon: {
    fontSize: Math.round(SCREEN_WIDTH * 0.055),
    lineHeight: Math.round(SCREEN_WIDTH * 0.065),
  },
  powerCost: {
    color: '#9966cc',
    fontSize: Math.round(SCREEN_WIDTH * 0.022),
    fontWeight: '200',
    letterSpacing: 0.5,
    marginTop: 1,
  },
  powerCostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  powerCostGem: {
    fontSize: Math.round(SCREEN_WIDTH * 0.022),
    lineHeight: Math.round(SCREEN_WIDTH * 0.028),
    marginLeft: 1,
  },
  powerCostActive: {
    color: '#ddaaff',
    fontWeight: '300',
  },
  powerCostDim: {
    color: '#333355',
    opacity: 0.6,
  },
  // ── Kilitli hücre overlay ─────────────────────────────────────────────────
  lockedOverlay: {
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.68)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedIcon: {
    fontSize: Math.round(SCREEN_WIDTH * 0.048),
    lineHeight: Math.round(SCREEN_WIDTH * 0.056),
  },
  lockedCount: {
    color: '#ff4455',
    fontSize: Math.round(SCREEN_WIDTH * 0.028),
    fontWeight: '300',
    marginTop: 1,
  },
});

// ── MainMenu Stilleri ────────────────────────────────────────────────────────
const menuStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
    justifyContent: 'space-between',
    paddingHorizontal: Math.round(SCREEN_WIDTH * 0.06),
    paddingVertical: Math.round(SCREEN_WIDTH * 0.06),
  },
  // ── Üst: Logo ────────────────────────────────────────────────────────────
  topSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Math.round(SCREEN_WIDTH * 0.04),
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: 18,
  },
  logoDividerTop: {
    width: Math.round(SCREEN_WIDTH * 0.55),
    height: 1,
    backgroundColor: '#3a1a6a',
    marginBottom: 16,
  },
  logoText: {
    fontSize: Math.round(SCREEN_WIDTH * 0.145),
    fontWeight: '100',
    letterSpacing: Math.round(SCREEN_WIDTH * 0.018),
    textShadowColor: '#aa44ff',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
  },
  logoSub: {
    color: '#4a2a7a',
    fontSize: Math.round(SCREEN_WIDTH * 0.028),
    fontWeight: '300',
    letterSpacing: 5,
    marginTop: 6,
  },
  logoDividerBot: {
    width: Math.round(SCREEN_WIDTH * 0.55),
    height: 1,
    backgroundColor: '#3a1a6a',
    marginTop: 16,
  },
  hcRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0f0625',
    borderWidth: 1,
    borderColor: '#2a1050',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  hcVal: {
    color: '#dd88ff',
    fontSize: Math.round(SCREEN_WIDTH * 0.042),
    fontWeight: '300',
    letterSpacing: 1,
  },
  hcLabel: {
    color: '#6644aa',
    fontSize: Math.round(SCREEN_WIDTH * 0.030),
    fontWeight: '200',
    letterSpacing: 2,
  },
  // ── Orta: Butonlar ───────────────────────────────────────────────────────
  midSection: {
    alignItems: 'center',
    gap: 14,
    paddingVertical: Math.round(SCREEN_WIDTH * 0.06),
  },
  playBtn: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#9944ff',
    backgroundColor: '#1a0535',
    overflow: 'hidden',
    shadowColor: '#aa44ff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 14,
    elevation: 8,
  },
  playBtnInner: {
    alignItems: 'center',
    paddingVertical: Math.round(SCREEN_WIDTH * 0.055),
  },
  playBtnText: {
    color: '#ffffff',
    fontSize: Math.round(SCREEN_WIDTH * 0.052),
    fontWeight: '300',
    letterSpacing: 7,
  },
  playBtnSub: {
    color: '#7733cc',
    fontSize: Math.round(SCREEN_WIDTH * 0.028),
    fontWeight: '200',
    letterSpacing: 10,
    marginTop: 4,
  },
  labBtn: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3a1a6a',
    backgroundColor: '#0f0625',
    alignItems: 'center',
    paddingVertical: Math.round(SCREEN_WIDTH * 0.038),
    shadowColor: '#6600aa',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  labBtnText: {
    color: '#cc88ff',
    fontSize: Math.round(SCREEN_WIDTH * 0.040),
    fontWeight: '200',
    letterSpacing: 6,
  },
  labBtnHcRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
  },
  labBtnSub: {
    color: '#5533aa',
    fontSize: Math.round(SCREEN_WIDTH * 0.026),
    fontWeight: '200',
    letterSpacing: 2,
  },
  // ── Alt: Ayarlar ─────────────────────────────────────────────────────────
  bottomSection: {
    alignItems: 'center',
    paddingBottom: Math.round(SCREEN_WIDTH * 0.02),
  },
  settingsLabel: {
    color: '#3a1a6a',
    fontSize: Math.round(SCREEN_WIDTH * 0.022),
    fontWeight: '300',
    letterSpacing: 6,
    marginBottom: 14,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 16,
  },
  toggleBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#222233',
    backgroundColor: '#0b0520',
    gap: 6,
  },
  toggleBtnOn: {
    borderColor: '#4a1a8a',
    backgroundColor: '#120835',
  },
  toggleLabel: {
    fontSize: Math.round(SCREEN_WIDTH * 0.022),
    fontWeight: '300',
    letterSpacing: 2,
  },
  toggleLabelOn: {
    color: '#8844cc',
  },
  toggleLabelOff: {
    color: '#333355',
  },
});
