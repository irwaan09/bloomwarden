// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between six screens: title, play, level-up,
// paused, game over and victory.
//
// ?seed=N fixes the random pattern. ?shot=start|play|levelup|end|win (with
// &seed=N) stages that scene instead of running the loop, paints it twice and
// sets window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createAudio } from './audio.js';
import { createWorld, EVENT_BOMB, EVENT_BOSS, EVENT_ENEMY_DIE, EVENT_HEAL, EVENT_HIT, EVENT_LEVELUP, EVENT_OVER, EVENT_PICKUP, EVENT_SHOOT, EVENT_WAVE_CLEAR, EVENT_WIN } from './world.js';
import {
  ACTION_CHOICE_1, ACTION_CHOICE_2, ACTION_CHOICE_3, ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, createInput,
} from './input.js';
import {
  createRenderer, SCREEN_LEVELUP, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  window.__bloomwarden = { world, get screen() { return scene.screen; } };
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  // Playtest hook: lets a test driver read the live state (score, wave, hp).
  window.__bloomwarden = { world, get screen() { return screen; } };

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.unlock();
    audio.click();
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Defend the garden.');
  }

  function endGame(won) {
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    if (won) {
      audio.win();
      announce(`Victory! Score ${world.state.score}. Best ${best}.`);
    } else {
      audio.lose();
      announce(`Game over. Score ${world.state.score}. Best ${best}.`);
    }
  }

  function openLevelUp() {
    world.rollLevelUp();
    screen = SCREEN_LEVELUP;
    audio.levelup();
    announce(`Level ${world.state.level}. Choose one of three blooms.`);
  }

  function pickUpgrade(index) {
    const def = world.applyChoice(index);
    if (!def) return;
    audio.click();
    announce(`${def.name} chosen.`);
    if (world.state.levelUps > 0) {
      openLevelUp();
    } else {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function playEvents(events) {
    if (events & EVENT_SHOOT) audio.shoot();
    if (events & EVENT_ENEMY_DIE) audio.enemyDie();
    if (events & EVENT_HIT) audio.playerHurt();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_HEAL) audio.heal();
    if (events & EVENT_BOMB) audio.enemyDie();
    if (events & EVENT_WAVE_CLEAR) audio.waveClear();
    if (events & EVENT_BOSS) audio.bossRoar();
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN) {
      if (actions & ACTION_CONFIRM) startGame();
      return;
    }
    if (screen === SCREEN_LEVELUP) {
      let choice = -1;
      if (actions & ACTION_CHOICE_1) choice = 0;
      else if (actions & ACTION_CHOICE_2) choice = 1;
      else if (actions & ACTION_CHOICE_3) choice = 2;
      else if (actions & ACTION_CONFIRM) {
        // A click (not a key) may have landed on a card: check the aim point.
        const aim = input.aim();
        choice = input.choiceAt(aim.x, aim.y, renderer.getCards());
      }
      if (choice >= 0 && choice < world.state.choices.length) pickUpgrade(choice);
      return;
    }
    if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { x: 0, y: 0 }, { seen: false, x: 0, y: 0 }, false, true);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const move = input.move();
    const aim = input.aim();
    const events = world.step(STEP, move, aim, input.firing(), false);
    playEvents(events);
    if (events & EVENT_WIN) {
      endGame(true);
      return;
    }
    if (events & EVENT_OVER) {
      endGame(false);
      return;
    }
    if (events & EVENT_LEVELUP) openLevelUp();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best);
  }

  // Leaving the tab pauses a running game rather than letting blight strike unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Bloomwarden. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
