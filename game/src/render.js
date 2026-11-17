// Drawing only: the world's state and the current screen in, pixels out. The
// 1280x720 playfield is scaled to fit the window and centred, the margin filled
// with the backdrop colour. All art is drawn with canvas shapes — no image files,
// nothing fetched. The level-up cards drawn here are also the click targets:
// getCards() returns their field-space rectangles.
import { ENEMY_KIND, FIELD, FONT, LAST_WAVE, PALETTE, xpNeeded } from './config.js';
import { createRandom } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_LEVELUP = 'levelup';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const PANEL = { width: 780, top: 150, line: 32, bottom: 76 };
const CARD = { w: 300, h: 210, gap: 24 };

function cachedLabel(prefix) {
  let value = -1;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const scoreLabel = cachedLabel('Score ');
  const bestLabel = cachedLabel('Best ');
  const waveLabel = cachedLabel('Wave ');
  const levelLabel = cachedLabel('Lv ');
  const decorRandom = createRandom(20261117);
  const tufts = [];
  for (let i = 0; i < 46; i += 1) {
    tufts.push({
      x: decorRandom() * FIELD.width,
      y: FIELD.height * 0.55 + decorRandom() * FIELD.height * 0.45,
      s: 10 + decorRandom() * 26,
      shade: decorRandom(),
      sway: decorRandom() * Math.PI * 2,
    });
  }
  const fireflies = [];
  for (let i = 0; i < 22; i += 1) {
    fireflies.push({
      x: decorRandom() * FIELD.width,
      y: decorRandom() * FIELD.height * 0.8,
      phase: decorRandom() * Math.PI * 2,
      speed: 0.4 + decorRandom() * 0.8,
    });
  }
  let cards = [];

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align, weight) {
    const key = `${weight || ''}${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight ? weight + ' ' : ''}${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.fillText(value, x, y);
  }

  function circle(x, y, r, color) {
    context.fillStyle = color;
    context.beginPath();
    context.arc(x, y, r, 0, Math.PI * 2);
    context.fill();
  }

  function drawIcon(icon, x, y, size, color) {
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = Math.max(2, size * 0.08);
    context.lineCap = 'round';
    const s = size / 2;
    if (icon === 'fan') {
      for (let i = -1; i <= 1; i += 1) {
        context.beginPath();
        context.moveTo(x, y + s * 0.7);
        context.lineTo(x + i * s * 0.8, y - s * 0.7);
        context.stroke();
      }
      circle(x, y + s * 0.7, s * 0.18, color);
    } else if (icon === 'bolt') {
      context.beginPath();
      context.moveTo(x + s * 0.3, y - s);
      context.lineTo(x - s * 0.5, y + s * 0.1);
      context.lineTo(x + s * 0.05, y + s * 0.1);
      context.lineTo(x - s * 0.3, y + s);
      context.lineTo(x + s * 0.5, y - s * 0.1);
      context.lineTo(x - s * 0.05, y - s * 0.1);
      context.closePath();
      context.fill();
    } else if (icon === 'pierce') {
      context.beginPath();
      context.moveTo(x - s, y);
      context.lineTo(x + s, y);
      context.stroke();
      context.beginPath();
      context.moveTo(x + s, y);
      context.lineTo(x + s * 0.55, y - s * 0.35);
      context.lineTo(x + s * 0.55, y + s * 0.35);
      context.closePath();
      context.fill();
      circle(x - s * 0.4, y, s * 0.32, color);
    } else if (icon === 'thorn') {
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2;
        context.beginPath();
        context.moveTo(x + Math.cos(a) * s * 0.45, y + Math.sin(a) * s * 0.45);
        context.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s);
        context.stroke();
      }
      circle(x, y, s * 0.45, color);
    } else if (icon === 'boot') {
      context.beginPath();
      context.moveTo(x - s * 0.6, y + s * 0.7);
      context.lineTo(x - s * 0.6, y - s * 0.2);
      context.lineTo(x + s * 0.2, y - s * 0.2);
      context.lineTo(x + s * 0.2, y + s * 0.3);
      context.lineTo(x + s * 0.7, y + s * 0.7);
      context.closePath();
      context.fill();
    } else if (icon === 'magnet') {
      context.beginPath();
      context.arc(x, y - s * 0.15, s * 0.7, Math.PI, 0, false);
      context.lineTo(x + s * 0.7, y + s * 0.5);
      context.lineTo(x + s * 0.25, y + s * 0.5);
      context.lineTo(x + s * 0.25, y - s * 0.15);
      context.arc(x, y - s * 0.15, s * 0.25, 0, Math.PI, true);
      context.lineTo(x - s * 0.7, y + s * 0.5);
      context.lineTo(x - s * 0.25, y + s * 0.5);
      context.closePath();
      context.fill();
    } else if (icon === 'heart') {
      context.beginPath();
      context.moveTo(x, y + s * 0.8);
      context.bezierCurveTo(x - s * 1.1, y - s * 0.1, x - s * 0.6, y - s, x, y - s * 0.3);
      context.bezierCurveTo(x + s * 0.6, y - s, x + s * 1.1, y - s * 0.1, x, y + s * 0.8);
      context.fill();
    } else if (icon === 'nova') {
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2;
        context.beginPath();
        context.moveTo(x + Math.cos(a) * s * 0.3, y + Math.sin(a) * s * 0.3);
        context.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s);
        context.stroke();
      }
      circle(x, y, s * 0.3, color);
    } else {
      // sun (fallback)
      circle(x, y, s * 0.45, color);
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2;
        context.beginPath();
        context.moveTo(x + Math.cos(a) * s * 0.6, y + Math.sin(a) * s * 0.6);
        context.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s);
        context.stroke();
      }
    }
  }

  function drawBackground(time) {
    const grad = context.createLinearGradient(0, 0, 0, FIELD.height);
    grad.addColorStop(0, '#0e211a');
    grad.addColorStop(0.6, PALETTE.field);
    grad.addColorStop(1, PALETTE.fieldEdge);
    context.fillStyle = grad;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    // Moon glow.
    const moon = context.createRadialGradient(1060, 110, 10, 1060, 110, 180);
    moon.addColorStop(0, 'rgba(255, 233, 168, 0.20)');
    moon.addColorStop(1, 'rgba(255, 233, 168, 0)');
    context.fillStyle = moon;
    context.fillRect(880, -70, 360, 360);
    circle(1060, 110, 34, '#ffe9a8');
    circle(1050, 102, 8, '#f2d488');
    circle(1072, 120, 5, '#f2d488');
    // Foliage tufts along the bottom, swaying gently.
    for (const t of tufts) {
      const sway = Math.sin(time * 0.7 + t.sway) * 4;
      context.strokeStyle = t.shade > 0.5 ? PALETTE.foliageLight : PALETTE.foliage;
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(t.x - t.s * 0.5, t.y);
      context.quadraticCurveTo(t.x - t.s * 0.2 + sway, t.y - t.s, t.x + sway, t.y - t.s * 1.2);
      context.moveTo(t.x + t.s * 0.5, t.y);
      context.quadraticCurveTo(t.x + t.s * 0.2 + sway, t.y - t.s * 0.8, t.x + sway * 0.5, t.y - t.s);
      context.stroke();
    }
    // Fireflies.
    for (const f of fireflies) {
      const a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(time * f.speed + f.phase));
      context.fillStyle = `rgba(255, 215, 106, ${a.toFixed(3)})`;
      const fx = f.x + Math.sin(time * 0.3 + f.phase) * 18;
      const fy = f.y + Math.cos(time * 0.23 + f.phase) * 12;
      context.beginPath();
      context.arc(fx, fy, 2.2, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawPickups(state) {
    for (const p of state.pickups) {
      if (!p.active) continue;
      const bob = Math.sin(state.time * 3 + p.x) * 2;
      if (p.kind === 0) {
        context.save();
        context.translate(p.x, p.y + bob);
        context.rotate(Math.PI / 4);
        context.fillStyle = PALETTE.bloom;
        context.fillRect(-5, -5, 10, 10);
        context.fillStyle = PALETTE.bloomSoft;
        context.fillRect(-2.5, -2.5, 5, 5);
        context.restore();
      } else if (p.kind === 1) {
        context.fillStyle = PALETTE.hp;
        context.beginPath();
        context.moveTo(p.x, p.y + bob - 10);
        context.bezierCurveTo(p.x - 11, p.y + bob - 2, p.x - 7, p.y + bob + 9, p.x, p.y + bob + 10);
        context.bezierCurveTo(p.x + 7, p.y + bob + 9, p.x + 11, p.y + bob - 2, p.x, p.y + bob - 10);
        context.fill();
        context.fillStyle = 'rgba(255,255,255,0.5)';
        circle(p.x - 3, p.y + bob - 3, 2.5, 'rgba(255,255,255,0.5)');
      } else {
        context.fillStyle = '#3a2b4d';
        circle(p.x, p.y + bob, 11, '#3a2b4d');
        context.strokeStyle = PALETTE.blightPale;
        context.lineWidth = 2;
        for (let i = 0; i < 6; i += 1) {
          const a = (i / 6) * Math.PI * 2 + 0.4;
          context.beginPath();
          context.moveTo(p.x + Math.cos(a) * 7, p.y + bob + Math.sin(a) * 7);
          context.lineTo(p.x + Math.cos(a) * 12, p.y + bob + Math.sin(a) * 12);
          context.stroke();
        }
        circle(p.x, p.y + bob, 4, PALETTE.bloom);
      }
    }
  }

  function drawEnemy(e, time) {
    const flash = e.flash > 0;
    const body = flash ? '#ffffff' : e.kind === ENEMY_KIND.BOSS ? PALETTE.blightDark : PALETTE.blight;
    const edge = flash ? '#ffffff' : PALETTE.blightPale;
    if (e.kind === ENEMY_KIND.MOTE) {
      // Spiky drifting spore.
      context.fillStyle = body;
      context.beginPath();
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2 + time * 0.8;
        const r = i % 2 === 0 ? e.radius + 4 : e.radius - 2;
        const px = e.x + Math.cos(a) * r;
        const py = e.y + Math.sin(a) * r;
        if (i === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      context.closePath();
      context.fill();
      circle(e.x, e.y, e.radius * 0.55, edge);
      circle(e.x - 3, e.y - 2, 2, '#2a1240');
      circle(e.x + 3, e.y - 2, 2, '#2a1240');
    } else if (e.kind === ENEMY_KIND.CRAWLER) {
      context.fillStyle = body;
      context.beginPath();
      context.ellipse(e.x, e.y, e.radius + 3, e.radius - 2, 0, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = PALETTE.thorn;
      context.lineWidth = 2.5;
      for (let i = -1; i <= 1; i += 1) {
        context.beginPath();
        context.moveTo(e.x + i * 8, e.y - e.radius + 2);
        context.lineTo(e.x + i * 8 + Math.sin(time * 6 + i) * 4, e.y - e.radius - 7);
        context.stroke();
      }
      circle(e.x - 4, e.y - 2, 2.2, '#2a1240');
      circle(e.x + 4, e.y - 2, 2.2, '#2a1240');
    } else if (e.kind === ENEMY_KIND.SPITTER) {
      circle(e.x, e.y, e.radius, body);
      context.strokeStyle = edge;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(e.x, e.y, e.radius - 4, 0, Math.PI * 2);
      context.stroke();
      circle(e.x, e.y + 2, 6, '#2a1240');
      context.fillStyle = PALETTE.orb;
      circle(e.x, e.y + 2, 3, PALETTE.orb);
    } else if (e.kind === ENEMY_KIND.SPLITTER) {
      circle(e.x - 7, e.y - 3, e.radius * 0.72, body);
      circle(e.x + 7, e.y + 2, e.radius * 0.72, body);
      context.strokeStyle = edge;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
      context.stroke();
      circle(e.x - 10, e.y - 5, 2, '#2a1240');
      circle(e.x + 4, e.y, 2, '#2a1240');
    } else {
      // Boss: a great thorned heart of blight, with a telegraph flash before charging.
      if (e.mode === 'telegraph') {
        context.strokeStyle = `rgba(255, 107, 94, ${0.5 + 0.5 * Math.sin(time * 18)})`;
        context.lineWidth = 4;
        context.beginPath();
        context.arc(e.x, e.y, e.radius + 14, 0, Math.PI * 2);
        context.stroke();
      }
      context.fillStyle = body;
      context.beginPath();
      for (let i = 0; i < 10; i += 1) {
        const a = (i / 10) * Math.PI * 2 + time * 0.4;
        const r = i % 2 === 0 ? e.radius + 12 : e.radius - 4;
        const px = e.x + Math.cos(a) * r;
        const py = e.y + Math.sin(a) * r;
        if (i === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      context.closePath();
      context.fill();
      circle(e.x, e.y, e.radius * 0.62, PALETTE.blightPale);
      circle(e.x - 10, e.y - 6, 4, '#2a1240');
      circle(e.x + 10, e.y - 6, 4, '#2a1240');
      context.strokeStyle = '#2a1240';
      context.lineWidth = 3;
      context.beginPath();
      context.arc(e.x, e.y + 6, 14, 0.15 * Math.PI, 0.85 * Math.PI);
      context.stroke();
      // Boss health bar.
      const bw = 180;
      const bx = e.x - bw / 2;
      const by = e.y - e.radius - 26;
      context.fillStyle = 'rgba(0,0,0,0.55)';
      context.fillRect(bx - 2, by - 2, bw + 4, 10);
      context.fillStyle = PALETTE.blight;
      context.fillRect(bx, by, bw * Math.max(0, e.hp / e.maxHp), 6);
    }
    // Small health ticks for hurt non-boss enemies.
    if (e.kind !== ENEMY_KIND.BOSS && e.hp < e.maxHp) {
      const bw = e.radius * 2;
      context.fillStyle = 'rgba(0,0,0,0.55)';
      context.fillRect(e.x - bw / 2, e.y - e.radius - 10, bw, 4);
      context.fillStyle = PALETTE.blightPale;
      context.fillRect(e.x - bw / 2, e.y - e.radius - 10, bw * Math.max(0, e.hp / e.maxHp), 4);
    }
  }

  function drawPlayer(state, time) {
    const p = state.player;
    if (p.invulnerable > 0 && Math.floor(p.invulnerable * 10) % 2 === 0) {
      // Blink while invulnerable after a hit.
    } else {
      // Soft glow.
      const glow = context.createRadialGradient(p.x, p.y, 4, p.x, p.y, 44);
      glow.addColorStop(0, 'rgba(255, 200, 92, 0.30)');
      glow.addColorStop(1, 'rgba(255, 200, 92, 0)');
      context.fillStyle = glow;
      context.fillRect(p.x - 44, p.y - 44, 88, 88);
      // Thorn aura ring.
      if (state.mods.thornDps > 0) {
        context.strokeStyle = 'rgba(94, 201, 138, 0.35)';
        context.lineWidth = 2;
        context.beginPath();
        context.arc(p.x, p.y, state.mods.thornRadius, 0, Math.PI * 2);
        context.stroke();
      }
      // Leaf cape.
      context.fillStyle = PALETTE.leafDark;
      context.beginPath();
      context.moveTo(p.x - 12, p.y + 4);
      context.quadraticCurveTo(p.x - 26, p.y + 18, p.x - 8, p.y + 20);
      context.quadraticCurveTo(p.x, p.y + 12, p.x - 12, p.y + 4);
      context.fill();
      // Body.
      circle(p.x, p.y, p.radius, PALETTE.player);
      circle(p.x, p.y, p.radius - 5, PALETTE.playerDark);
      // Sprout on top.
      context.strokeStyle = PALETTE.leaf;
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(p.x, p.y - p.radius);
      context.quadraticCurveTo(p.x + 2, p.y - p.radius - 10, p.x + 8, p.y - p.radius - 12);
      context.stroke();
      context.fillStyle = PALETTE.leaf;
      context.beginPath();
      context.ellipse(p.x + 10, p.y - p.radius - 12, 7, 4, -0.5, 0, Math.PI * 2);
      context.fill();
      // Eyes and pollen shooter toward the aim.
      const aim = Math.atan2(p.aimY - p.y, p.aimX - p.x);
      circle(p.x - 5, p.y - 3, 2.6, '#3a2b12');
      circle(p.x + 5, p.y - 3, 2.6, '#3a2b12');
      context.strokeStyle = PALETTE.playerDark;
      context.lineWidth = 5;
      context.beginPath();
      context.moveTo(p.x + Math.cos(aim) * 10, p.y + Math.sin(aim) * 10);
      context.lineTo(p.x + Math.cos(aim) * 24, p.y + Math.sin(aim) * 24);
      context.stroke();
      circle(p.x + Math.cos(aim) * 26, p.y + Math.sin(aim) * 26, 4, PALETTE.bloomSoft);
    }
  }

  function drawHud(state, screen, best) {
    context.textBaseline = 'top';
    text(scoreLabel(state.score), 24, 18, 28, PALETTE.text, 'left', '700');
    text(bestLabel(best), 24, 50, 18, PALETTE.muted, 'left');
    text(waveLabel(Math.max(1, state.wave)), FIELD.width / 2, 18, 28, PALETTE.text, 'center', '700');
    // Enemies left this wave (on the victory screen the garden is saved).
    const left = state.director ? state.director.remaining : 0;
    let alive = 0;
    for (const e of state.enemies) if (e.active) alive += 1;
    if (screen === SCREEN_WIN) {
      text('Garden saved', FIELD.width / 2, 50, 18, PALETTE.muted, 'center');
    } else {
      text(`Blight left ${left + alive}`, FIELD.width / 2, 50, 18, PALETTE.muted, 'center');
    }
    // Hearts.
    const hp = state.player.hp;
    const maxHp = state.mods.maxHp;
    for (let i = 0; i < maxHp; i += 1) {
      const hx = FIELD.width - 24 - (maxHp - i) * 30;
      drawIcon('heart', hx + 11, 32, 22, i < hp ? PALETTE.hp : 'rgba(255,143,163,0.25)');
    }
    text(levelLabel(state.level), FIELD.width - 24 - maxHp * 30 - 14, 18, 24, PALETTE.bloom, 'right', '700');
    // XP bar.
    const need = xpNeeded(state.level);
    const barW = 320;
    const bx = (FIELD.width - barW) / 2;
    const by = FIELD.height - 24;
    context.fillStyle = 'rgba(0,0,0,0.5)';
    context.fillRect(bx - 2, by - 2, barW + 4, 10);
    context.fillStyle = PALETTE.xp;
    context.fillRect(bx, by, barW * Math.min(1, state.xp / need), 6);
    // Boss bar at the top when a boss lives.
    if (state.boss && state.boss.active) {
      const bw = 420;
      const bx2 = (FIELD.width - bw) / 2;
      text(state.boss.kind === ENEMY_KIND.BOSS && state.wave >= LAST_WAVE ? 'BLIGHTHEART PRIME' : 'BLIGHTHEART', FIELD.width / 2, 84, 20, PALETTE.blightPale, 'center', '700');
      context.fillStyle = 'rgba(0,0,0,0.55)';
      context.fillRect(bx2 - 2, 108, bw + 4, 12);
      context.fillStyle = PALETTE.blight;
      context.fillRect(bx2, 110, bw * Math.max(0, state.boss.hp / state.boss.maxHp), 8);
    }
  }

  function drawPanel(title, lines, prompt) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(10, 22, 16, 0.60)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 78, 46, PALETTE.text, 'center', '700');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + PANEL.top + index * PANEL.line, 20, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 38, 23, PALETTE.bloom, 'center', '700');
  }

  function drawLevelUp(state) {
    context.fillStyle = 'rgba(10, 22, 16, 0.72)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.textBaseline = 'alphabetic';
    text('LEVEL UP — CHOOSE A BLOOM', FIELD.width / 2, 96, 34, PALETTE.text, 'center', '700');
    text(`Level ${state.level}  ·  press 1, 2 or 3, or click a card`, FIELD.width / 2, 132, 20, PALETTE.muted, 'center');
    cards = [];
    const totalW = 3 * CARD.w + 2 * CARD.gap;
    const x0 = (FIELD.width - totalW) / 2;
    const y0 = 176;
    for (let i = 0; i < state.choices.length; i += 1) {
      const def = state.choices[i];
      const cx = x0 + i * (CARD.w + CARD.gap);
      cards.push({ x: cx, y: y0, w: CARD.w, h: CARD.h });
      context.fillStyle = PALETTE.panel;
      context.fillRect(cx, y0, CARD.w, CARD.h);
      context.strokeStyle = PALETTE.panelEdge;
      context.lineWidth = 2;
      context.strokeRect(cx, y0, CARD.w, CARD.h);
      drawIcon(def.icon, cx + CARD.w / 2, y0 + 52, 44, PALETTE.bloom);
      text(def.name, cx + CARD.w / 2, y0 + 116, 24, PALETTE.text, 'center', '700');
      // Word-wrap the one-line description.
      const words = def.desc.split(' ');
      let line = '';
      let ly = y0 + 152;
      for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (next.length > 24 && line) {
          text(line, cx + CARD.w / 2, ly, 18, PALETTE.muted, 'center');
          ly += 24;
          line = word;
        } else line = next;
      }
      if (line) text(line, cx + CARD.w / 2, ly, 18, PALETTE.muted, 'center');
      text(`[${i + 1}]`, cx + CARD.w / 2, y0 + CARD.h - 18, 18, PALETTE.bloom, 'center', '700');
    }
  }

  /** Paint one frame: the field, the entities, then the HUD or a panel. */
  function draw(state, screen, best) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const mag = state.shake * state.shake * 13;
    const sx = Math.sin(state.time * 47) * mag;
    const sy = Math.cos(state.time * 39) * mag;
    context.setTransform(view.scale, 0, 0, view.scale, view.x + sx * view.scale, view.y + sy * view.scale);
    drawBackground(state.time);
    drawPickups(state);
    for (const e of state.enemies) if (e.active) drawEnemy(e, state.time);
    for (const o of state.orbs) {
      if (!o.active) continue;
      const glow = context.createRadialGradient(o.x, o.y, 1, o.x, o.y, 16);
      glow.addColorStop(0, 'rgba(224, 138, 255, 0.5)');
      glow.addColorStop(1, 'rgba(224, 138, 255, 0)');
      context.fillStyle = glow;
      context.fillRect(o.x - 16, o.y - 16, 32, 32);
      circle(o.x, o.y, o.radius, PALETTE.orb);
      circle(o.x, o.y, o.radius * 0.5, '#f5e0ff');
    }
    if (screen !== SCREEN_TITLE) drawPlayer(state, state.time);
    for (const b of state.bullets) {
      if (!b.active) continue;
      circle(b.x, b.y, 4.5, PALETTE.bloomSoft);
      circle(b.x, b.y, 2.2, '#ffffff');
    }
    for (const p of state.particles) {
      if (!p.active) continue;
      context.globalAlpha = Math.max(0, p.life / p.maxLife);
      circle(p.x, p.y, p.size, p.color);
    }
    context.globalAlpha = 1;
    context.textBaseline = 'alphabetic';
    for (const f of state.floaters) {
      if (!f.active) continue;
      context.globalAlpha = Math.max(0, f.life / f.maxLife);
      text(f.text, f.x, f.y, 20, f.color, 'center', '700');
    }
    context.globalAlpha = 1;

    if (screen === SCREEN_TITLE) {
      const lines = [
        'The last garden is under blight. You are its warden.',
        'WASD or arrows to move · mouse to aim.',
        'Hold click or Space to fire pollen.',
        `Survive ${LAST_WAVE} waves and defeat the Blightheart to win.`,
        `Best ${best}`,
        '',
      ];
      drawPanel('BLOOMWARDEN', lines, 'Press Space or click to start');
      return;
    }
    drawHud(state, screen, best);
    if (screen === SCREEN_LEVELUP) {
      drawLevelUp(state);
    } else if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The garden waits for you.'], 'Press P to resume');
    } else if (screen === SCREEN_OVER) {
      const acc = state.stats.shots > 0 ? Math.round((100 * state.stats.hits) / state.stats.shots) : 0;
      drawPanel('The garden falls…', [
        `Score ${state.score}`,
        `Best ${best}`,
        `Reached wave ${Math.max(1, state.wave)}  ·  ${state.kills} blight banished  ·  ${acc}% shots hit`,
        '',
      ], 'Press Space or click to try again');
    } else if (screen === SCREEN_WIN) {
      const acc = state.stats.shots > 0 ? Math.round((100 * state.stats.hits) / state.stats.shots) : 0;
      drawPanel('THE GARDEN BLOOMS AGAIN', [
        `Score ${state.score}`,
        `Best ${best}`,
        `All ${LAST_WAVE} waves cleared  ·  ${state.kills} blight banished  ·  ${acc}% shots hit`,
        '',
      ], 'Press Space or click to play again');
    } else if (state.waveState === 'banner') {
      context.textBaseline = 'alphabetic';
      const label = state.wave === 0 ? 'Get ready…' : `Wave ${state.wave}${WAVE_BOSS_LABEL(state)}`;
      text(label, FIELD.width / 2, 220, 52, PALETTE.text, 'center', '700');
      if (state.wave > 0 && state.director) {
        text(`${state.director.total} blight approach`, FIELD.width / 2, 262, 22, PALETTE.muted, 'center');
      }
    }
  }

  function WAVE_BOSS_LABEL(state) {
    if (state.director && state.director.total > 0) {
      const bossWave = state.wave === 5 || state.wave === 10;
      return bossWave ? '  —  the Blightheart wakes' : '';
    }
    return '';
  }

  resize();
  window.addEventListener('resize', resize);
  return {
    draw,
    /** The level-up cards drawn on the last frame, for click detection. */
    getCards() {
      return cards;
    },
  };
}
