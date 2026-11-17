// Bloomwarden — every tuning number and colour in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to the
// window, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The last wave: beating its boss wins the game. */
export const LAST_WAVE = 10;

export const PLAYER = {
  radius: 16,
  speed: 300,
  maxHp: 3,
  fireInterval: 0.26,
  bulletSpeed: 640,
  bulletDamage: 1,
  bulletRadius: 5,
  invulnerable: 1.2,
  pickupRadius: 64,
};

export const BULLET = { radius: 5, speed: 640, damage: 1, life: 1.1 };

/** Enemy kinds, by the wave they first appear in. */
export const ENEMY_KIND = { MOTE: 0, CRAWLER: 1, SPITTER: 2, SPLITTER: 3, BOSS: 4 };

export const ENEMY = {
  [ENEMY_KIND.MOTE]: {
    name: 'Blight Mote', hp: 1, speed: 72, radius: 12, score: 10, xp: 1, firstWave: 1,
  },
  [ENEMY_KIND.CRAWLER]: {
    name: 'Thorncrawler', hp: 2, speed: 128, radius: 13, score: 15, xp: 2, firstWave: 2,
  },
  [ENEMY_KIND.SPITTER]: {
    name: 'Spore Spitter', hp: 2, speed: 82, radius: 14, score: 20, xp: 2, firstWave: 3,
    shootInterval: 2.4, shootRange: 420, keepDistance: 280, orbSpeed: 175,
  },
  [ENEMY_KIND.SPLITTER]: {
    name: 'Bloom Splitter', hp: 3, speed: 62, radius: 16, score: 25, xp: 3, firstWave: 4,
  },
  [ENEMY_KIND.BOSS]: {
    name: 'Blightheart', hp: 95, speed: 46, radius: 46, score: 500, xp: 20, firstWave: 5,
    shootInterval: 3.0, summonInterval: 6.0, chargeInterval: 8.0,
  },
};

/** Wave make-up: how many enemies a wave holds, and how fast they arrive. */
export const WAVE = {
  baseCount: 5,
  perWave: 3,
  spawnInterval: 0.72,
  spawnIntervalMin: 0.22,
  spawnIntervalPerWave: 0.05,
  clearBonus: 100,
  bossWaves: [5, 10],
};

/** Experience shards to fill the next level. */
export function xpNeeded(level) {
  return 5 + level * 4;
}

/** Pooled entity caps: nothing allocates after boot. */
export const POOL = { enemies: 96, bullets: 128, orbs: 64, pickups: 96, particles: 320, floaters: 24 };

export const PICKUP = {
  shard: { radius: 7, value: 1 },
  sundew: { radius: 11, dropChance: 0.045, heal: 1 },
  bombseed: { radius: 11, dropChance: 0.02, damage: 3 },
};

export const PALETTE = {
  backdrop: '#0b1a14',
  field: '#10251d',
  fieldEdge: '#0d1f18',
  foliage: '#1d3a2a',
  foliageLight: '#2c5240',
  bloom: '#ffd76a',
  bloomSoft: '#ffe9a8',
  player: '#ffc85c',
  playerDark: '#e09a2b',
  leaf: '#5ec98a',
  leafDark: '#2f7d4f',
  blight: '#b678f0',
  blightDark: '#7a3fc0',
  blightPale: '#d9b8ff',
  thorn: '#e5534b',
  orb: '#e08aff',
  text: '#f2f7ee',
  muted: '#9db8a6',
  panel: '#122b20',
  panelEdge: '#2c5240',
  danger: '#ff6b5e',
  xp: '#ffd76a',
  hp: '#ff8fa3',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'bloomwarden.best';
