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

// Sonraki spawn değeri: %75 → 2, %25 → 4
function pickNextValue() {
  return Math.random() < 0.75 ? 2 : 4;
}

// Grid doluyken hiç eşleşme yoksa oyun biter
function checkGameOver(cells) {
  if (cells.some((c) => c === null)) return false;
  const values = cells.map((c) => c.value);
  return new Set(values).size === values.length;
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

      addCredits: (amount) => set((s) => ({ credits: s.credits + amount })),

      selectPiece: (idx) => set({ selectedPieceIdx: idx }),

      calculateOffline: () => {
        const { lastLogin, cells } = get();
        const MAX_SEC = 4 * 60 * 60;
        const elapsed = Math.floor((Date.now() - lastLogin) / 1000);
        if (elapsed < 1) return;
        const effective = Math.min(elapsed, MAX_SEC);
        const capReached = elapsed >= MAX_SEC;
        const ips = cells.reduce((s, c) => (c ? s + nodeIncome(c.value) : s), 0);
        const earned = Math.floor(effective * ips);
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
        const { cells } = get();
        const income = cells.reduce((s, c) => (c ? s + nodeIncome(c.value) : s), 0);
        set((s) => ({
          credits: income > 0 ? s.credits + income : s.credits,
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
          gameOver: checkGameOver(cr.cells),
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
          gameOver: checkGameOver(cr.cells),
          lastChainEvent: cr.steps.length > 0
            ? { steps: cr.steps, cleared: cr.cleared, finalMergedAt: cr.mergedAt, chainDepth: cr.chainDepth, id: cr.id }
            : null,
        });
        return true;
      },

      // Preview alanından direkt sürüklenerek bırakma
      // Kredi kontrolü burada yapılır; yetersizse { ok:false, noCredits:true }
      spawnFromPreview: (pieceIdx, cellIdx) => {
        const { cells, credits, uretMaliyeti, nextPieces } = get();
        if (cells[cellIdx] !== null) return { ok: false };
        if (credits < uretMaliyeti) return { ok: false, noCredits: true };
        const valueToPlace = nextPieces[pieceIdx];
        const placed = [...cells];
        placed[cellIdx] = { value: valueToPlace };
        const cr = runChainMerge(placed, cellIdx);
        const newPieces = [...nextPieces];
        newPieces[pieceIdx] = pickNextValue();
        set({
          cells: cr.cells,
          credits: credits - uretMaliyeti,
          uretMaliyeti: Math.ceil(uretMaliyeti * 1.08),
          nextPieces: newPieces,
          selectedPieceIdx: pieceIdx === 0 ? 1 : 0,
          gameOver: checkGameOver(cr.cells),
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
        const { cells } = get();
        if (fromIdx === toIdx) return { result: 'snap' };
        const src = cells[fromIdx];
        const dst = cells[toIdx];
        if (!src) return { result: 'snap' };

        // Boş hücreye bırakma artık yasak — taş yerine geri döner
        if (!dst) return { result: 'snap' };

        if (dst.value === src.value) {
          // Aynı değer → direkt birleştir, sonra zincir devam edebilir
          const merged = [...cells];
          merged[fromIdx] = null;
          merged[toIdx] = { value: dst.value * 2 };
          const cr = runChainMerge(merged, toIdx);
          // İlk birleşme adımını manuel olarak öne ekle (animasyon için)
          const step0 = {
            cleared: [{ fromIdx, toIdx, value: src.value }],
            fromIdx,
            toIdx,
            mergedAt: toIdx,
            waveIdx: 0,
            travel: true,
          };
          const allSteps = [step0, ...cr.steps.map((s, i) => ({ ...s, waveIdx: i + 1 }))];
          const allCleared = [step0.cleared[0], ...cr.cleared];
          set({
            cells: cr.cells,
            gameOver: checkGameOver(cr.cells),
            lastChainEvent: {
              steps: allSteps,
              cleared: allCleared,
              finalMergedAt: cr.mergedAt,
              chainDepth: allSteps.length,
              id: cr.id,
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
          ...chain2.steps.map((s, i) => ({ ...s, waveIdx: chain1.steps.length + i })),
        ];
        const allCleared = [...chain1.cleared, ...chain2.cleared];
        const totalDepth = allSteps.length;
        const primaryMergedAt = chain1.steps.length >= chain2.steps.length ? chain1.mergedAt : chain2.mergedAt;
        set({
          cells: chain2.cells,
          gameOver: checkGameOver(chain2.cells),
          lastChainEvent: allSteps.length > 0
            ? { steps: allSteps, cleared: allCleared, finalMergedAt: primaryMergedAt, chainDepth: totalDepth, id: chain1.id }
            : null,
        });
        return { result: 'swapped', chainDepth: totalDepth };
      },

      resetGame: () => {
        set({
          cells: Array(ROWS * COLS).fill(null),
          credits: 50,
          uretMaliyeti: 10,
          nextPieces: [pickNextValue(), pickNextValue()],
          selectedPieceIdx: 0,
          gameOver: false,
          offlineEarned: null,
          offlineCapReached: false,
          lastLogin: Date.now(),
        });
      },
    }),
    {
      name: 'hexanode-storage-v5',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        cells: s.cells,
        credits: s.credits,
        uretMaliyeti: s.uretMaliyeti,
        lastLogin: s.lastLogin,
        nextPieces: s.nextPieces,
        selectedPieceIdx: s.selectedPieceIdx,
        gameOver: s.gameOver,
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
function EconDisplay() {
  const credits = useStore((s) => s.credits);
  const cells = useStore((s) => s.cells);

  const incomePerSec = cells.reduce((sum, cell) => {
    if (!cell) return sum;
    return sum + nodeIncome(cell.value);
  }, 0);

  return (
    <View style={styles.econRow}>
      <Text style={styles.econCredits}>{formatNum(credits)} ✦</Text>
      <Text style={styles.econSep}>  ·  </Text>
      <Text style={styles.econIncome}>+{formatNum(incomePerSec)}/sn</Text>
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
function DraggableNode({ cellIndex, value, isDragging, justMerged, onDragStart, onDragEnd, onMergedAtIdx }) {
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

  const cbRef = useRef({ onDragStart, onDragEnd, onMergedAtIdx });
  cbRef.current = { onDragStart, onDragEnd, onMergedAtIdx };

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
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: () => {
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
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          cbRef.current.onDragEnd();
        } else if (res.result === 'swapped') {
          hardReset();
          // Yer değiştirme: swoosh ses + hafif haptik + pulse
          playSwapSound();
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
      </Animated.View>
    </Animated.View>
  );
}

// ── GameOverModal ─────────────────────────────────────────────────────────────
function GameOverModal({ visible }) {
  const resetGame = useStore((s) => s.resetGame);
  const cells = useStore((s) => s.cells);
  const best = cells.reduce((max, c) => (c && c.value > max ? c.value : max), 0);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.88)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, speed: 14, bounciness: 8, useNativeDriver: true }),
      ]).start();
    } else {
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.88);
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible) return null;

  return (
    <Modal visible transparent statusBarTranslucent onRequestClose={() => { }}>
      <Animated.View style={[styles.modalOverlay, { opacity: fadeAnim }]}>
        <Animated.View style={[styles.modalBox, { transform: [{ scale: scaleAnim }] }]}>
          <Text style={styles.modalTitle}>A Ğ   K İ L İ T L E N D İ</Text>
          <Text style={styles.gameOverSub}>Birleştirilebilecek node kalmadı</Text>
          <Text style={styles.gameOverBest}>{formatNum(best)}</Text>
          <Text style={styles.gameOverBestLabel}>en yüksek değer</Text>
          <AnimatedPressable
            style={[styles.btn, { marginTop: 28 }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              resetGame();
            }}
            activeOpacity={0.9}
          >
            <Text style={styles.btnText}>Y E N İ D E N   B A Ş L A</Text>
          </AnimatedPressable>
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
        const batch = step.cleared.map((item, i) => ({
          id: `dying-${id}-${stepIdx}-${i}`,
          cellIdx: item.fromIdx,       // animasyon başlangıç hücresi
          targetIdx: item.toIdx,       // animasyon bitiş hücresi
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
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
  const [draggingIdx, setDraggingIdx] = useState(null);
  const [mergedCellIdx, setMergedCellIdx] = useState(null);
  const gridViewRef = useRef(null);

  const handleDragStart = useCallback((idx) => setDraggingIdx(idx), []);
  const handleDragEnd = useCallback(() => setDraggingIdx(null), []);
  const handleChainMerge = useCallback((mergedAt) => setMergedCellIdx(mergedAt), []);

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
      </Svg>

      {cells.map((cell, idx) =>
        cell ? (
          <DraggableNode
            key={`n-${idx}`}
            cellIndex={idx}
            value={cell.value}
            isDragging={draggingIdx === idx}
            justMerged={mergedCellIdx === idx}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onMergedAtIdx={setMergedCellIdx}
          />
        ) : null
      )}

      <DyingNodesLayer onMerge={handleChainMerge} />
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
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
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

// ── App ────────────────────────────────────────────────────────────────────────
export default function App() {
  const collectOffline = useStore((s) => s.collectOffline);
  const cells = useStore((s) => s.cells);
  const credits = useStore((s) => s.credits);
  const uretMaliyeti = useStore((s) => s.uretMaliyeti);
  const offlineEarned = useStore((s) => s.offlineEarned);
  const offlineCapReached = useStore((s) => s.offlineCapReached);
  const nextPieces = useStore((s) => s.nextPieces);
  const gameOver = useStore((s) => s.gameOver);

  // Sürükleme ghost durumu
  const [ghost, setGhost] = useState({ active: false, value: null, pieceIdx: null, x: 0, y: 0 });
  const dragPieceIdxRef = useRef(null); // setGhost sıfırlanmadan önce pieceIdx'i saklar
  const gridAbsPos = useRef({ x: 0, y: 0 });

  const modalVisible = offlineEarned != null && offlineEarned > 0;
  const canDrag = credits >= uretMaliyeti;

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
    const pi = dragPieceIdxRef.current; // state sıfırlanmadan önce oku
    setGhost({ active: false, value: null, pieceIdx: null, x: 0, y: 0 });
    if (absX < 0 || pi === null) return; // iptal
    const relX = absX - gridAbsPos.current.x;
    const relY = absY - gridAbsPos.current.y;
    const cellIdx = nearestCell(relX, relY, -1, 1.9);
    if (cellIdx === -1) return;
    const currentCells = useStore.getState().cells;
    if (currentCells[cellIdx] !== null) return; // dolu hücre
    const result = useStore.getState().spawnFromPreview(pi, cellIdx);
    if (result.ok) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      playSound('spawn');
    } else if (result.noCredits) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      playSound('error');
    }
  }, []);

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
      <GameOverModal visible={gameOver} />

      {/* Başlık */}
      <View style={styles.header}>
        <Text style={styles.titleMain}>HEXANODE</Text>
        <EconDisplay />
      </View>

      {/* Oyun Alanı */}
      <View style={styles.gridWrapper}>
        <HexGrid onGridMeasure={handleGridMeasure} isDragActive={ghost.active} />
      </View>

      {/* Footer — Sürüklenebilir parça önizlemeleri */}
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
});
