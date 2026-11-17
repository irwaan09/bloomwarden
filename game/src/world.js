// Bloomwarden's rules and state, with no drawing and no browser in it: the player,
// bullets, enemies, orbs, pickups, particles, waves and levels. step() advances one
// fixed step and returns what happened as bit flags, so the caller can react (sound,
// screens) without the world knowing about screens or sound. Pools are allocated
// once, at boot; nothing here allocates after createWorld returns.
import {
  BULLET, ENEMY, ENEMY_KIND, FIELD, LAST_WAVE, PICKUP, PLAYER, POOL, WAVE, xpNeeded,
} from './config.js';
import { createDirector, EVENT_SHOOT as ENEMY_SHOOT, EVENT_SUMMON, spawnEnemy, splitPoint, steerEnemy } from './enemies.js';
import { createMods, rollChoices } from './upgrades.js';
import { range } from './random.js';

export const EVENT_SHOOT = 1;
export const EVENT_ENEMY_DIE = 2;
export const EVENT_HIT = 4;
export const EVENT_PICKUP = 8;
export const EVENT_HEAL = 16;
export const EVENT_LEVELUP = 32;
export const EVENT_WAVE_CLEAR = 64;
export const EVENT_OVER = 128;
export const EVENT_WIN = 256;
export const EVENT_BOSS = 512;
export const EVENT_BOMB = 1024;

const PICKUP_SHARD = 0;
const PICKUP_SUNDEW = 1;
const PICKUP_BOMB = 2;

function overlaps(ax, ay, ar, bx, by, br) {
  const dx = ax - bx;
  const dy = ay - by;
  const r = ar + br;
  return dx * dx + dy * dy < r * r;
}

export function createWorld(random) {
  const player = {
    x: FIELD.width / 2, y: FIELD.height / 2, hp: PLAYER.maxHp,
    aimX: FIELD.width / 2, aimY: FIELD.height / 3, fireTimer: 0,
    invulnerable: 0, novaTimer: 4, moving: false,
  };
  const mods = createMods();
  const taken = {};
  const bullets = [];
  const orbs = [];
  const enemies = [];
  const pickups = [];
  const particles = [];
  const floaters = [];
  for (let i = 0; i < POOL.bullets; i += 1) bullets.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, pierce: 0, hit: [] });
  for (let i = 0; i < POOL.orbs; i += 1) orbs.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, radius: 8 });
  for (let i = 0; i < POOL.enemies; i += 1) {
    enemies.push({
      active: false, kind: 0, x: 0, y: 0, hp: 1, maxHp: 1, speed: 0, radius: 10,
      score: 0, xp: 0, flash: 0, shootTimer: 0, summonTimer: 0, chargeTimer: 0,
      mode: 'chase', modeTimer: 0, zigPhase: 0, shootAngle: 0, chargeX: 0, chargeY: 0,
      auraAcc: 0, hitCooldown: 0,
    });
  }
  for (let i = 0; i < POOL.pickups; i += 1) pickups.push({ active: false, kind: 0, x: 0, y: 0, vx: 0, vy: 0, value: 0, radius: 7, life: 0 });
  for (let i = 0; i < POOL.particles; i += 1) particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 3, color: '#fff', drag: 0 });
  for (let i = 0; i < POOL.floaters; i += 1) floaters.push({ active: false, x: 0, y: 0, text: '', life: 0, maxLife: 1, color: '#fff' });

  const state = {
    player, mods, taken,
    bullets, orbs, enemies, pickups, particles, floaters,
    score: 0, kills: 0, wave: 0, waveState: 'banner', waveTimer: 1.6,
    xp: 0, level: 1, levelUps: 0, choices: [],
    time: 0, shake: 0, director: null, boss: null,
    stats: { shots: 0, hits: 0, kills: 0, wavesCleared: 0 },
  };

  function free(pool) {
    for (let i = 0; i < pool.length; i += 1) if (!pool[i].active) return pool[i];
    return null;
  }

  function burst(x, y, color, count, speed, size) {
    for (let i = 0; i < count; i += 1) {
      const p = free(particles);
      if (!p) return;
      const angle = random() * Math.PI * 2;
      const sp = speed * (0.4 + random() * 0.8);
      p.active = true;
      p.x = x; p.y = y;
      p.vx = Math.cos(angle) * sp;
      p.vy = Math.sin(angle) * sp;
      p.maxLife = 0.35 + random() * 0.45;
      p.life = p.maxLife;
      p.size = (size || 3) * (0.6 + random() * 0.8);
      p.color = color;
      p.drag = 2.2;
    }
  }

  function floater(x, y, text, color) {
    const f = free(floaters);
    if (!f) return;
    f.active = true;
    f.x = x; f.y = y;
    f.text = text;
    f.maxLife = 0.9;
    f.life = f.maxLife;
    f.color = color;
  }

  function dropPickup(x, y, kind, value) {
    const p = free(pickups);
    if (!p) return;
    const angle = random() * Math.PI * 2;
    p.active = true;
    p.kind = kind;
    p.x = x; p.y = y;
    p.vx = Math.cos(angle) * 60;
    p.vy = Math.sin(angle) * 60;
    p.value = value;
    p.radius = kind === PICKUP_SHARD ? PICKUP.shard.radius : 11;
    p.life = 14;
  }

  function dropLoot(enemy) {
    const shards = enemy.xp;
    for (let i = 0; i < shards; i += 1) dropPickup(enemy.x, enemy.y, PICKUP_SHARD, 1);
    const roll = random();
    if (roll < PICKUP.sundew.dropChance) dropPickup(enemy.x, enemy.y, PICKUP_SUNDEW, 1);
    else if (roll < PICKUP.sundew.dropChance + PICKUP.bombseed.dropChance) dropPickup(enemy.x, enemy.y, PICKUP_BOMB, 1);
  }

  function killEnemy(enemy, award) {
    enemy.active = false;
    burst(enemy.x, enemy.y, enemy.kind === ENEMY_KIND.BOSS ? '#d9b8ff' : '#b678f0', enemy.kind === ENEMY_KIND.BOSS ? 60 : 14, 240, 4);
    if (award) {
      state.score += enemy.score;
      state.kills += 1;
      state.stats.kills += 1;
      floater(enemy.x, enemy.y - 10, `+${enemy.score}`, '#ffd76a');
      dropLoot(enemy);
    }
    if (enemy.kind === ENEMY_KIND.SPLITTER) {
      for (let i = 0; i < 2; i += 1) {
        const slot = free(enemies);
        if (!slot) break;
        const at = splitPoint(enemy, random);
        spawnEnemy(slot, ENEMY_KIND.MOTE, state.wave, random);
        slot.x = at.x;
        slot.y = at.y;
      }
    }
    if (enemy.kind === ENEMY_KIND.BOSS) {
      state.boss = null;
      state.shake = Math.min(1, state.shake + 0.7);
      burst(enemy.x, enemy.y, '#ffd76a', 40, 320, 5);
    }
  }

  function hurtPlayer() {
    if (player.invulnerable > 0 || player.hp <= 0) return 0;
    player.hp -= 1;
    player.invulnerable = PLAYER.invulnerable;
    state.shake = Math.min(1, state.shake + 0.55);
    burst(player.x, player.y, '#ff8fa3', 18, 260, 4);
    return player.hp <= 0 ? EVENT_OVER : EVENT_HIT;
  }

  function damageEnemy(enemy, amount, events) {
    enemy.hp -= amount;
    enemy.flash = 0.12;
    state.stats.hits += 1;
    if (enemy.hp <= 0) {
      const wasBoss = enemy.kind === ENEMY_KIND.BOSS;
      const wave = state.wave;
      killEnemy(enemy, true);
      events |= EVENT_ENEMY_DIE;
      if (wasBoss && wave >= LAST_WAVE) events |= EVENT_WIN;
      return events;
    }
    return events;
  }

  function fireBullet(angle, speed, damage, pierce) {
    const b = free(bullets);
    if (!b) return;
    b.active = true;
    b.x = player.x + Math.cos(angle) * 22;
    b.y = player.y + Math.sin(angle) * 22;
    b.vx = Math.cos(angle) * speed;
    b.vy = Math.sin(angle) * speed;
    b.life = BULLET.life;
    b.pierce = pierce;
    b.hit.length = 0;
    state.stats.shots += 1;
  }

  function shootVolley(aimAngle) {
    const n = mods.projectiles;
    for (let i = 0; i < n; i += 1) {
      const offset = (i - (n - 1) / 2) * 0.14;
      fireBullet(aimAngle + offset, BULLET.speed, BULLET.damage, mods.pierce);
    }
    burst(player.x + Math.cos(aimAngle) * 24, player.y + Math.sin(aimAngle) * 24, '#ffe9a8', 3, 120, 2.5);
  }

  function startWave(wave) {
    state.wave = wave;
    state.director = createDirector(wave, random);
    state.waveState = 'banner';
    state.waveTimer = 1.6;
    if (WAVE.bossWaves.includes(wave)) state.boss = null;
  }

  function reset() {
    player.x = FIELD.width / 2;
    player.y = FIELD.height / 2;
    player.hp = PLAYER.maxHp;
    player.invulnerable = 0;
    player.fireTimer = 0;
    player.novaTimer = 4;
    Object.assign(mods, createMods());
    for (const key of Object.keys(taken)) delete taken[key];
    for (const pool of [bullets, orbs, enemies, pickups, particles, floaters]) {
      for (const item of pool) item.active = false;
    }
    state.score = 0;
    state.kills = 0;
    state.wave = 0;
    state.waveState = 'banner';
    state.waveTimer = 1.6;
    state.xp = 0;
    state.level = 1;
    state.levelUps = 0;
    state.choices = [];
    state.time = 0;
    state.shake = 0;
    state.director = null;
    state.boss = null;
    state.stats.shots = 0;
    state.stats.hits = 0;
    state.stats.kills = 0;
    state.stats.wavesCleared = 0;
  }

  function anyEnemyAlive() {
    for (const e of enemies) if (e.active) return true;
    return false;
  }

  function nearestEnemy(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const e of enemies) {
      if (!e.active) continue;
      const d = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  /**
   * One fixed step. `move` is a normalized vector, `aim` a field point, `firing`
   * whether the player holds fire. With `harmless` set (the title screen's
   * backdrop) motes drift and nothing touches the player and nothing scores.
   * Returns event flags for the caller (sound, screens).
   */
  function step(dt, move, aim, firing, harmless) {
    let events = 0;
    state.time += dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 1.6);

    if (harmless) {
      // Attract mode: a few motes drift across the garden behind the title.
      state.waveTimer -= dt;
      if (state.waveTimer <= 0) {
        state.waveTimer = 1.4;
        let count = 0;
        for (const e of enemies) if (e.active) count += 1;
        if (count < 8) {
          const slot = free(enemies);
          if (slot) spawnEnemy(slot, ENEMY_KIND.MOTE, 1, random);
        }
      }
      for (const e of enemies) {
        if (!e.active) continue;
        e.x += Math.cos(e.zigPhase) * 20 * dt;
        e.y += 26 * dt;
        e.zigPhase += dt;
        if (e.y > FIELD.height + 40) e.active = false;
      }
      updateParticles(dt);
      return 0;
    }

    // --- waves ---
    if (state.waveState === 'banner') {
      state.waveTimer -= dt;
      if (state.waveTimer <= 0) {
        state.waveState = 'fighting';
        if (state.wave === 0) startWave(1);
      }
    } else if (state.waveState === 'fighting') {
      const kind = state.director ? state.director.next(dt) : null;
      if (kind !== null) {
        const slot = free(enemies);
        if (slot) {
          spawnEnemy(slot, kind, state.wave, random);
          if (kind === ENEMY_KIND.BOSS) {
            state.boss = slot;
            events |= EVENT_BOSS;
          }
        }
      }
      if (state.director && state.director.done && !anyEnemyAlive()) {
        state.waveState = 'clear';
        state.waveTimer = 1.4;
        state.stats.wavesCleared += 1;
        const bonus = WAVE.clearBonus * state.wave;
        state.score += bonus;
        floater(FIELD.width / 2, FIELD.height / 2 - 60, `Wave clear  +${bonus}`, '#ffd76a');
        events |= EVENT_WAVE_CLEAR;
      }
    } else if (state.waveState === 'clear') {
      state.waveTimer -= dt;
      if (state.waveTimer <= 0) {
        if (state.wave >= LAST_WAVE) {
          events |= EVENT_WIN;
        } else {
          startWave(state.wave + 1);
        }
      }
    }

    // --- player ---
    if (player.invulnerable > 0) player.invulnerable = Math.max(0, player.invulnerable - dt);
    const speed = mods.speed;
    player.x = Math.min(FIELD.width - 20, Math.max(20, player.x + move.x * speed * dt));
    player.y = Math.min(FIELD.height - 20, Math.max(20, player.y + move.y * speed * dt));
    player.moving = move.x !== 0 || move.y !== 0;

    let aimAngle;
    if (aim.seen) {
      aimAngle = Math.atan2(aim.y - player.y, aim.x - player.x);
      player.aimX = aim.x;
      player.aimY = aim.y;
    } else {
      const target = nearestEnemy(player.x, player.y);
      if (target) {
        aimAngle = Math.atan2(target.y - player.y, target.x - player.x);
        player.aimX = target.x;
        player.aimY = target.y;
      } else {
        aimAngle = -Math.PI / 2;
      }
    }

    player.fireTimer -= dt;
    if (firing && player.fireTimer <= 0) {
      player.fireTimer = mods.fireInterval;
      shootVolley(aimAngle);
      events |= EVENT_SHOOT;
    }

    // Thorn aura: wounds blight that gets close.
    if (mods.thornDps > 0) {
      for (const e of enemies) {
        if (!e.active) continue;
        if (overlaps(e.x, e.y, e.radius, player.x, player.y, mods.thornRadius)) {
          e.auraAcc += mods.thornDps * dt;
          if (e.auraAcc >= 1) {
            e.auraAcc -= 1;
            events = damageEnemy(e, 1, events);
          }
        }
      }
    }

    // Nova: a ring of seeds every few seconds.
    if (mods.novaCount > 0) {
      player.novaTimer -= dt;
      if (player.novaTimer <= 0) {
        player.novaTimer = mods.novaInterval;
        for (let i = 0; i < mods.novaCount; i += 1) {
          fireBullet((i / mods.novaCount) * Math.PI * 2, BULLET.speed * 0.8, BULLET.damage, mods.pierce);
        }
        burst(player.x, player.y, '#ffd76a', 12, 200, 3);
        events |= EVENT_SHOOT;
      }
    }

    // --- bullets ---
    for (const b of bullets) {
      if (!b.active) continue;
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.life <= 0 || b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20) {
        b.active = false;
        continue;
      }
      for (const e of enemies) {
        if (!e.active || b.hit.includes(e)) continue;
        if (overlaps(b.x, b.y, BULLET.radius, e.x, e.y, e.radius)) {
          b.hit.push(e);
          burst(b.x, b.y, '#ffe9a8', 4, 140, 2.5);
          events = damageEnemy(e, BULLET.damage, events);
          if (b.hit.length > b.pierce) {
            b.active = false;
            break;
          }
        }
      }
    }

    // --- enemies ---
    for (const e of enemies) {
      if (!e.active) continue;
      const ev = steerEnemy(e, player, dt, random);
      if (ev === ENEMY_SHOOT) {
        if (e.shootAngle === -1) {
          // Boss radial burst.
          for (let i = 0; i < 10; i += 1) {
            const orb = free(orbs);
            if (!orb) break;
            const angle = (i / 10) * Math.PI * 2;
            orb.active = true;
            orb.x = e.x + Math.cos(angle) * (e.radius + 6);
            orb.y = e.y + Math.sin(angle) * (e.radius + 6);
            orb.vx = Math.cos(angle) * 150;
            orb.vy = Math.sin(angle) * 150;
            orb.life = 5;
            orb.radius = 8;
          }
        } else {
          const orb = free(orbs);
          if (orb) {
            orb.active = true;
            orb.x = e.x + Math.cos(e.shootAngle) * (e.radius + 6);
            orb.y = e.y + Math.sin(e.shootAngle) * (e.radius + 6);
            orb.vx = Math.cos(e.shootAngle) * ENEMY[ENEMY_KIND.SPITTER].orbSpeed;
            orb.vy = Math.sin(e.shootAngle) * ENEMY[ENEMY_KIND.SPITTER].orbSpeed;
            orb.life = 6;
            orb.radius = 8;
          }
        }
      } else if (ev === EVENT_SUMMON) {
        for (let i = 0; i < 3; i += 1) {
          const slot = free(enemies);
          if (!slot) break;
          spawnEnemy(slot, ENEMY_KIND.MOTE, state.wave, random);
          slot.x = e.x + range(random, -60, 60);
          slot.y = e.y + range(random, -60, 60);
        }
      }
      // Contact with the player.
      if (overlaps(e.x, e.y, e.radius, player.x, player.y, PLAYER.radius)) {
        events |= hurtPlayer();
        if (events & EVENT_OVER) break;
      }
    }
    if (events & EVENT_OVER) {
      updateParticles(dt);
      return events;
    }

    // --- orbs ---
    for (const o of orbs) {
      if (!o.active) continue;
      o.life -= dt;
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      if (o.life <= 0 || o.x < -20 || o.x > FIELD.width + 20 || o.y < -20 || o.y > FIELD.height + 20) {
        o.active = false;
        continue;
      }
      if (overlaps(o.x, o.y, o.radius, player.x, player.y, PLAYER.radius)) {
        o.active = false;
        events |= hurtPlayer();
        if (events & EVENT_OVER) break;
      }
    }
    if (events & EVENT_OVER) {
      updateParticles(dt);
      return events;
    }

    // --- pickups ---
    for (const p of pickups) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      const dx = player.x - p.x;
      const dy = player.y - p.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist < mods.pickupRadius) {
        const pull = 340 * dt;
        p.x += (dx / dist) * pull;
        p.y += (dy / dist) * pull;
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 1 - 2 * dt;
        p.vy *= 1 - 2 * dt;
      }
      if (dist < PLAYER.radius + p.radius + 4) {
        p.active = false;
        if (p.kind === PICKUP_SHARD) {
          state.xp += p.value;
          events |= EVENT_PICKUP;
          while (state.xp >= xpNeeded(state.level)) {
            state.xp -= xpNeeded(state.level);
            state.level += 1;
            state.levelUps += 1;
            events |= EVENT_LEVELUP;
          }
        } else if (p.kind === PICKUP_SUNDEW) {
          player.hp = Math.min(mods.maxHp, player.hp + PICKUP.sundew.heal);
          floater(player.x, player.y - 24, '+1', '#ff8fa3');
          events |= EVENT_HEAL;
        } else if (p.kind === PICKUP_BOMB) {
          events |= EVENT_BOMB;
          state.shake = Math.min(1, state.shake + 0.6);
          for (const e of enemies) {
            if (!e.active) continue;
            events = damageEnemy(e, PICKUP.bombseed.damage, events);
          }
        }
      }
    }

    updateParticles(dt);
    return events;
  }

  function updateParticles(dt) {
    for (const p of particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - p.drag * dt;
      p.vy *= 1 - p.drag * dt;
    }
    for (const f of floaters) {
      if (!f.active) continue;
      f.life -= dt;
      f.y -= 34 * dt;
      if (f.life <= 0) f.active = false;
    }
  }

  /** Roll the next level-up's three choices (or the fallback when maxed). */
  function rollLevelUp() {
    state.choices = rollChoices(random, taken);
    return state.choices;
  }

  /** Apply a rolled choice by index; returns the applied definition. */
  function applyChoice(index) {
    const def = state.choices[index];
    if (!def) return null;
    taken[def.id] = (taken[def.id] || 0) + 1;
    def.apply(mods, { player, state });
    state.levelUps -= 1;
    state.choices = [];
    return def;
  }

  reset();
  return { state, reset, step, rollLevelUp, applyChoice, nearestEnemy };
}
