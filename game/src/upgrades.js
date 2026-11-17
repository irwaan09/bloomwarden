// The level-up upgrade pool: each entry is one meaningful choice. The world keeps
// the player's `mods` (multipliers and counts); apply() changes them, and the
// renderer draws each choice as a card with its icon, name and one-line effect.
import { shuffle } from './random.js';

export const UPGRADE_DEFS = [
  {
    id: 'spread', name: 'Bloom Fan', icon: 'fan', max: 3,
    desc: '+1 pollen shot, fanned wide',
    apply(mods) { mods.projectiles += 1; },
  },
  {
    id: 'rapid', name: 'Rapidbloom', icon: 'bolt', max: 3,
    desc: 'Fire 20% faster',
    apply(mods) { mods.fireInterval *= 0.8; },
  },
  {
    id: 'pierce', name: 'Piercing Pollen', icon: 'pierce', max: 2,
    desc: 'Shots pass through +1 enemy',
    apply(mods) { mods.pierce += 1; },
  },
  {
    id: 'thorn', name: 'Thorn Aura', icon: 'thorn', max: 2,
    desc: 'Thorns wound nearby blight',
    apply(mods) { mods.thornDps += 6; mods.thornRadius += 24; },
  },
  {
    id: 'swift', name: 'Swiftroots', icon: 'boot', max: 3,
    desc: 'Move 12% faster',
    apply(mods) { mods.speed *= 1.12; },
  },
  {
    id: 'magnet', name: 'Magnetbloom', icon: 'magnet', max: 3,
    desc: 'Pull shards from much further',
    apply(mods) { mods.pickupRadius *= 1.6; },
  },
  {
    id: 'heart', name: 'Heartseed', icon: 'heart', max: 2,
    desc: '+1 max heart, and heal 1 now',
    apply(mods, world) {
      mods.maxHp += 1;
      world.player.hp = Math.min(mods.maxHp, world.player.hp + 1);
    },
  },
  {
    id: 'nova', name: 'Seed Nova', icon: 'nova', max: 2,
    desc: 'A ring of seeds bursts out every 6s',
    apply(mods) { mods.novaCount += 8; mods.novaInterval = Math.max(3.5, mods.novaInterval - 1); },
  },
];

export const FALLBACK_UPGRADE = {
  id: 'sunburst', name: 'Sunburst', icon: 'sun', max: 99,
  desc: 'Heal 1 heart and +250 score',
  apply(mods, world) {
    world.player.hp = Math.min(mods.maxHp, world.player.hp + 1);
    world.state.score += 250;
  },
};

/** The player's starting modifiers; upgrades change these. */
export function createMods() {
  return {
    projectiles: 1,
    fireInterval: 0.26,
    pierce: 0,
    thornDps: 0,
    thornRadius: 0,
    speed: 300,
    pickupRadius: 64,
    maxHp: 3,
    novaCount: 0,
    novaInterval: 6,
  };
}

/**
 * Roll three distinct upgrades the player has not maxed yet. When everything is
 * maxed, the fallback is offered instead.
 */
export function rollChoices(random, taken) {
  const open = UPGRADE_DEFS.filter((def) => (taken[def.id] || 0) < def.max);
  shuffle(random, open);
  const choices = open.slice(0, 3);
  while (choices.length < 3) choices.push(FALLBACK_UPGRADE);
  return choices;
}
