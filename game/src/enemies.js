// Enemy kinds, the wave director that queues them, and each kind's steering.
// No drawing and no browser in here: the world owns the pools and the collisions,
// this file only decides what spawns and how it moves.
import { ENEMY, ENEMY_KIND, FIELD, WAVE } from './config.js';
import { pick, range, shuffle } from './random.js';

export const EVENT_SHOOT = 1;
export const EVENT_SUMMON = 2;

/** Spawn weights per wave: a kind joins once its firstWave is reached. */
function mixFor(wave) {
  const mix = [{ kind: ENEMY_KIND.MOTE, weight: 10 }];
  if (wave >= 2) mix.push({ kind: ENEMY_KIND.CRAWLER, weight: 6 });
  if (wave >= 3) mix.push({ kind: ENEMY_KIND.SPITTER, weight: 4 });
  if (wave >= 4) mix.push({ kind: ENEMY_KIND.SPLITTER, weight: 3 });
  return mix;
}

function weightedKind(random, mix) {
  let total = 0;
  for (const entry of mix) total += entry.weight;
  let roll = random() * total;
  for (const entry of mix) {
    roll -= entry.weight;
    if (roll <= 0) return entry.kind;
  }
  return ENEMY_KIND.MOTE;
}

/**
 * The wave director: builds one wave's spawn queue and hands kinds out on a timer.
 * Boss waves open with the boss, then trickle motes while it lives.
 */
export function createDirector(wave, random) {
  const bossWave = WAVE.bossWaves.includes(wave);
  const queue = [];
  if (bossWave) {
    queue.push(ENEMY_KIND.BOSS);
    const trickle = 4 + wave;
    for (let i = 0; i < trickle; i += 1) queue.push(ENEMY_KIND.MOTE);
  } else {
    const count = WAVE.baseCount + WAVE.perWave * wave;
    const mix = mixFor(wave);
    for (let i = 0; i < count; i += 1) queue.push(weightedKind(random, mix));
    shuffle(random, queue);
  }
  let timer = 0.15;
  return {
    wave,
    total: queue.length,
    spawned: 0,
    get remaining() {
      return queue.length - this.spawned;
    },
    get done() {
      return this.spawned >= queue.length;
    },
    /** A kind to spawn this step, or null. */
    next(dt) {
      if (this.spawned >= queue.length) return null;
      timer -= dt;
      if (timer > 0) return null;
      timer = Math.max(
        WAVE.spawnIntervalMin,
        WAVE.spawnInterval - WAVE.spawnIntervalPerWave * (wave - 1),
      );
      this.spawned += 1;
      return queue[this.spawned - 1];
    },
  };
}

function edgePoint(random, margin) {
  const side = Math.floor(random() * 4);
  if (side === 0) return { x: range(random, margin, FIELD.width - margin), y: -margin };
  if (side === 1) return { x: range(random, margin, FIELD.width - margin), y: FIELD.height + margin };
  if (side === 2) return { x: -margin, y: range(random, margin, FIELD.height - margin) };
  return { x: FIELD.width + margin, y: range(random, margin, FIELD.height - margin) };
}

/** Fill a pooled enemy slot with a fresh enemy of `kind` at the field's edge. */
export function spawnEnemy(slot, kind, wave, random) {
  const def = ENEMY[kind];
  const at = edgePoint(random, 30);
  slot.active = true;
  slot.kind = kind;
  slot.x = at.x;
  slot.y = at.y;
  slot.maxHp = def.hp + (kind === ENEMY_KIND.BOSS ? 0 : Math.floor(wave / 3));
  if (kind === ENEMY_KIND.BOSS && wave >= 10) slot.maxHp = 165;
  slot.hp = slot.maxHp;
  slot.speed = def.speed + wave * 3;
  slot.radius = def.radius;
  slot.score = def.score;
  slot.xp = def.xp;
  slot.flash = 0;
  slot.shootTimer = range(random, 1.2, 2.2);
  slot.summonTimer = 5;
  slot.chargeTimer = 6;
  slot.mode = 'chase';
  slot.modeTimer = 0;
  slot.zigPhase = random() * Math.PI * 2;
  slot.hitCooldown = 0;
  return slot;
}

/**
 * Steer one enemy for a step. Returns EVENT_SHOOT (with an angle on the enemy) or
 * EVENT_SUMMON (the boss wants motes), or 0. The world turns those into orbs and
 * spawns; this file never touches the pools.
 */
export function steerEnemy(enemy, player, dt, random) {
  if (enemy.flash > 0) enemy.flash -= dt;
  if (enemy.hitCooldown > 0) enemy.hitCooldown -= dt;
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = dx / dist;
  const ny = dy / dist;

  if (enemy.kind === ENEMY_KIND.MOTE) {
    enemy.x += nx * enemy.speed * dt;
    enemy.y += ny * enemy.speed * dt;
    return 0;
  }
  if (enemy.kind === ENEMY_KIND.CRAWLER) {
    // Zigzag: a sideways sine on top of the chase.
    enemy.zigPhase += dt * 5;
    const side = Math.sin(enemy.zigPhase);
    enemy.x += (nx * enemy.speed + -ny * side * enemy.speed * 0.7) * dt;
    enemy.y += (ny * enemy.speed + nx * side * enemy.speed * 0.7) * dt;
    return 0;
  }
  if (enemy.kind === ENEMY_KIND.SPITTER) {
    const def = ENEMY[ENEMY_KIND.SPITTER];
    if (dist > def.keepDistance + 40) {
      enemy.x += nx * enemy.speed * dt;
      enemy.y += ny * enemy.speed * dt;
    } else if (dist < def.keepDistance - 60) {
      enemy.x -= nx * enemy.speed * 0.6 * dt;
      enemy.y -= ny * enemy.speed * 0.6 * dt;
    }
    enemy.shootTimer -= dt;
    if (enemy.shootTimer <= 0 && dist < def.shootRange) {
      enemy.shootTimer = def.shootInterval * range(random, 0.85, 1.15);
      enemy.shootAngle = Math.atan2(dy, dx);
      return EVENT_SHOOT;
    }
    return 0;
  }
  if (enemy.kind === ENEMY_KIND.SPLITTER) {
    enemy.x += nx * enemy.speed * dt;
    enemy.y += ny * enemy.speed * dt;
    return 0;
  }
  // Boss: slow chase, radial bursts, summons, and a telegraphed charge.
  const def = ENEMY[ENEMY_KIND.BOSS];
  enemy.modeTimer -= dt;
  if (enemy.mode === 'telegraph') {
    if (enemy.modeTimer <= 0) {
      enemy.mode = 'charge';
      enemy.modeTimer = 0.55;
      const d = Math.hypot(player.x - enemy.x, player.y - enemy.y) || 1;
      enemy.chargeX = (player.x - enemy.x) / d;
      enemy.chargeY = (player.y - enemy.y) / d;
    }
    return 0;
  }
  if (enemy.mode === 'charge') {
    enemy.x += enemy.chargeX * enemy.speed * 6.5 * dt;
    enemy.y += enemy.chargeY * enemy.speed * 6.5 * dt;
    if (enemy.modeTimer <= 0) enemy.mode = 'chase';
    return 0;
  }
  enemy.x += nx * enemy.speed * dt;
  enemy.y += ny * enemy.speed * dt;
  enemy.shootTimer -= dt;
  if (enemy.shootTimer <= 0) {
    enemy.shootTimer = def.shootInterval;
    enemy.shootAngle = -1; // radial burst: the world reads -1 as "all round"
    return EVENT_SHOOT;
  }
  enemy.summonTimer -= dt;
  if (enemy.summonTimer <= 0) {
    enemy.summonTimer = def.summonInterval;
    return EVENT_SUMMON;
  }
  enemy.chargeTimer -= dt;
  if (enemy.chargeTimer <= 0 && dist < 520) {
    enemy.chargeTimer = def.chargeInterval;
    enemy.mode = 'telegraph';
    enemy.modeTimer = 0.6;
  }
  return 0;
}

/** Where a split enemy's children appear. */
export function splitPoint(enemy, random) {
  const angle = random() * Math.PI * 2;
  return { x: enemy.x + Math.cos(angle) * 18, y: enemy.y + Math.sin(angle) * 18 };
}

export { pick };
