// The screenshot scenes behind ?shot=start|play|levelup|end|win. Each one plays the
// real rules forward from a fresh world, steered by an autopilot, so the frame is
// what a real game looks like and the same seed always gives the same frame.
// The skilled pilot kites, aims at the nearest blight and gathers shards; the
// careless pilot walks into trouble, so the end scene is a real defeat.
import { FIELD, STEP } from './config.js';
import { ENEMY_KIND } from './config.js';
import {
  EVENT_LEVELUP, EVENT_OVER, EVENT_WIN,
} from './world.js';
import { SCREEN_LEVELUP, SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 45;
const END_LIMIT_SECONDS = 600;
const WIN_LIMIT_SECONDS = 900;

function countActive(pool) {
  let n = 0;
  for (const item of pool) if (item.active) n += 1;
  return n;
}

function nearest(state, pool, kind) {
  const p = state.player;
  let best = null;
  let bestD = Infinity;
  for (const item of pool) {
    if (!item.active) continue;
    if (kind !== undefined && item.kind !== kind) continue;
    const d = (item.x - p.x) * (item.x - p.x) + (item.y - p.y) * (item.y - p.y);
    if (d < bestD) { bestD = d; best = item; }
  }
  return best ? { item: best, dist: Math.sqrt(bestD) } : null;
}

/** The skilled pilot's move: flee what is too close, gather shards, orbit the foe. */
function skilledMove(state) {
  const p = state.player;
  const threat = nearest(state, state.enemies);
  const shard = nearest(state, state.pickups, 0);
  let mx = 0;
  let my = 0;
  if (threat && threat.dist < 110) {
    mx = (p.x - threat.item.x) / threat.dist;
    my = (p.y - threat.item.y) / threat.dist;
  } else if (shard && shard.dist < 280) {
    mx = (shard.item.x - p.x) / shard.dist;
    my = (shard.item.y - p.y) / shard.dist;
  } else if (threat) {
    const want = 230;
    const tx = (threat.item.x - p.x) / threat.dist;
    const ty = (threat.item.y - p.y) / threat.dist;
    if (threat.dist > want + 50) { mx = tx; my = ty; }
    else if (threat.dist < want - 50) { mx = -tx; my = -ty; }
    else { mx = -ty; my = tx; } // orbit
  } else {
    const cx = FIELD.width / 2 - p.x;
    const cy = FIELD.height / 2 - p.y;
    const d = Math.hypot(cx, cy) || 1;
    if (d > 60) { mx = cx / d; my = cy / d; }
  }
  // Sidestep an orb that is about to arrive.
  const orb = nearest(state, state.orbs);
  if (orb && orb.dist < 90) {
    const ox = orb.item.vx;
    const oy = orb.item.vy;
    const len = Math.hypot(ox, oy) || 1;
    mx += -oy / len * 0.9;
    my += ox / len * 0.9;
  }
  const len = Math.hypot(mx, my) || 1;
  // Stay inside the field.
  if (p.x < 60) mx += 0.6;
  if (p.x > FIELD.width - 60) mx -= 0.6;
  if (p.y < 60) my += 0.6;
  if (p.y > FIELD.height - 60) my -= 0.6;
  const n = Math.hypot(mx, my) || 1;
  return { x: mx / n, y: my / n, _len: len };
}

function skilledAim(state) {
  const p = state.player;
  const threat = nearest(state, state.enemies);
  if (threat) return { seen: true, x: threat.item.x, y: threat.item.y };
  return { seen: true, x: p.x, y: p.y - 100 };
}

function anyEnemyNear(state, range) {
  const found = nearest(state, state.enemies);
  return found !== null && found.dist < range;
}

/** The careless pilot: drifts toward the nearest blight and never fires. */
function carelessMove(state) {
  const p = state.player;
  const threat = nearest(state, state.enemies);
  if (!threat) return { x: 0, y: 0 };
  return {
    x: (threat.item.x - p.x) / threat.dist,
    y: (threat.item.y - p.y) / threat.dist,
  };
}

function handleLevelUps(world) {
  while (world.state.levelUps > 0 && world.state.choices.length === 0) {
    world.rollLevelUp();
    world.applyChoice(0);
  }
}

/**
 * Set `world` to the named scene and return the screen to draw over it and the
 * best score to show. Names: start, play, levelup, end, win (anything else is start).
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'levelup' && name !== 'end' && name !== 'win') {
    for (let index = 0; index < START_SECONDS / STEP; index += 1) {
      world.step(STEP, { x: 0, y: 0 }, { seen: false, x: 0, y: 0 }, false, true);
    }
    return { screen: SCREEN_TITLE, best: 0 };
  }

  if (name === 'win') {
    // A strong build, so the run reaches the final boss in reasonable time.
    const mods = world.state.mods;
    mods.projectiles = 3;
    mods.fireInterval = 0.1;
    mods.pierce = 2;
    mods.thornDps = 14;
    mods.thornRadius = 90;
    mods.speed = 330;
    mods.pickupRadius = 160;
    mods.novaCount = 12;
    mods.novaInterval = 4;
  }

  const limit = name === 'end' ? END_LIMIT_SECONDS : name === 'win' ? WIN_LIMIT_SECONDS : PLAY_SECONDS;
  const skilled = name !== 'end';
  // The end pilot fights recklessly first (walks at the blight while firing), so
  // the defeat carries a real score, then gives up dodging and is overrun.
  let recklessUntil = name === 'end' ? 20 : 0;
  for (let index = 0; index < limit / STEP; index += 1) {
    const elapsed = index * STEP;
    let move;
    let aim;
    let firing;
    if (name === 'end' && elapsed < recklessUntil) {
      const threat = nearest(world.state, world.state.enemies);
      move = threat
        ? { x: (threat.item.x - world.state.player.x) / threat.dist, y: (threat.item.y - world.state.player.y) / threat.dist }
        : { x: 0, y: 0 };
      aim = skilledAim(world.state);
      firing = anyEnemyNear(world.state, 560);
    } else if (name === 'end') {
      move = carelessMove(world.state);
      aim = { seen: false, x: 0, y: 0 };
      firing = false;
    } else {
      move = skilledMove(world.state);
      aim = skilledAim(world.state);
      firing = anyEnemyNear(world.state, 560);
    }
    const events = world.step(STEP, move, aim, firing, false);
    if (events & EVENT_WIN) return { screen: SCREEN_WIN, best: world.state.score };
    if (events & EVENT_OVER) return { screen: SCREEN_OVER, best: world.state.score };
    if (events & EVENT_LEVELUP) {
      if (name === 'levelup') {
        world.rollLevelUp();
        return { screen: SCREEN_LEVELUP, best: world.state.score };
      }
      handleLevelUps(world);
    }
    // The play shot waits for a busy mid-wave frame: several blight on screen
    // and shots flying, never a between-wave lull.
    if (name === 'play' && elapsed > 10 && world.state.waveState === 'fighting'
      && countActive(world.state.enemies) >= 5 && countActive(world.state.bullets) >= 1) {
      return { screen: SCREEN_PLAY, best: world.state.score };
    }
  }
  if (name === 'levelup') {
    // No level-up arrived in the window: force one by topping the XP up.
    world.state.xp = 999;
    world.step(STEP, { x: 0, y: 0 }, { seen: false, x: 0, y: 0 }, false, false);
    world.rollLevelUp();
    return { screen: SCREEN_LEVELUP, best: world.state.score };
  }
  if (name === 'end') {
    // Still alive after the whole window: walk into the blight until it ends.
    for (let index = 0; index < END_LIMIT_SECONDS / STEP; index += 1) {
      const events = world.step(STEP, carelessMove(world.state), { seen: false, x: 0, y: 0 }, false, false);
      if (events & EVENT_OVER) break;
    }
    return { screen: SCREEN_OVER, best: world.state.score };
  }
  const over = world.state.player.hp <= 0;
  return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
}

export { ENEMY_KIND };
