// Keyboard and pointer input. Held keys give a movement vector; the mouse gives an
// aim point in field coordinates; one-shot presses (start, pause, upgrade picks,
// mute) are queued as bit flags and taken once by the loop, so a press between two
// frames is never lost and never counted twice.
import { FIELD } from './config.js';

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_CHOICE_1 = 4;
export const ACTION_CHOICE_2 = 8;
export const ACTION_CHOICE_3 = 16;
export const ACTION_MUTE = 32;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const CHOICE_1 = new Set(['Digit1', 'Numpad1']);
const CHOICE_2 = new Set(['Digit2', 'Numpad2']);
const CHOICE_3 = new Set(['Digit3', 'Numpad3']);

export function createInput(canvas) {
  const keys = { up: false, down: false, left: false, right: false, fire: false };
  let mouseDown = false;
  let mouseX = FIELD.width / 2;
  let mouseY = FIELD.height / 3;
  let mouseSeen = false;
  let actions = 0;

  function toField(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / FIELD.width, rect.height / FIELD.height);
    const ox = (rect.width - FIELD.width * scale) / 2;
    const oy = (rect.height - FIELD.height * scale) / 2;
    return {
      x: (clientX - rect.left - ox) / scale,
      y: (clientY - rect.top - oy) / scale,
    };
  }

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code)) keys.up = true;
    else if (DOWN.has(event.code)) keys.down = true;
    else if (LEFT.has(event.code)) keys.left = true;
    else if (RIGHT.has(event.code)) keys.right = true;
    else if (CONFIRM.has(event.code)) {
      keys.fire = true;
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (CHOICE_1.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CHOICE_1;
    } else if (CHOICE_2.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CHOICE_2;
    } else if (CHOICE_3.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CHOICE_3;
    } else if (event.code === 'KeyM') {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) keys.up = false;
    else if (DOWN.has(event.code)) keys.down = false;
    else if (LEFT.has(event.code)) keys.left = false;
    else if (RIGHT.has(event.code)) keys.right = false;
    else if (CONFIRM.has(event.code)) keys.fire = false;
  });
  // A key released while the tab is hidden never sends keyup: let go on blur.
  window.addEventListener('blur', () => {
    keys.up = keys.down = keys.left = keys.right = keys.fire = false;
    mouseDown = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    const p = toField(event.clientX, event.clientY);
    mouseX = p.x;
    mouseY = p.y;
    mouseSeen = true;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const p = toField(event.clientX, event.clientY);
    mouseX = p.x;
    mouseY = p.y;
    mouseSeen = true;
    mouseDown = true;
    actions |= ACTION_CONFIRM;
    event.preventDefault();
  });
  window.addEventListener('pointerup', () => {
    mouseDown = false;
  });

  return {
    /** Normalized movement vector from held keys. */
    move() {
      const x = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      const y = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
      if (x === 0 && y === 0) return { x: 0, y: 0 };
      const len = Math.hypot(x, y);
      return { x: x / len, y: y / len };
    },
    /** True while the player holds fire (mouse button or Space). */
    firing() {
      return mouseDown || keys.fire;
    },
    /** Aim point in field coordinates, and whether the mouse has ever moved. */
    aim() {
      return { x: mouseX, y: mouseY, seen: mouseSeen };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** For the upgrade screen: which card (0-2) a click at field point (x, y) hits, or -1. */
    choiceAt(x, y, cards) {
      for (let i = 0; i < cards.length; i += 1) {
        const c = cards[i];
        if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) return i;
      }
      return -1;
    },
  };
}
