// The renderer: a projected 3D view of the terrain, runway, rings and aircraft, plus the HUD.
// Painter's order, no depth buffer: cells are sorted far to near and filled as flat polygons.

import { V3, mat4LookAt, mat4Perspective, project, rad, clamp } from './math3d.js';
import { GRID, TERRAIN_SIZE, heightAt } from './world.js';

const SKY_TOP = '#0b1d3a';
const SKY_MID = '#2a5f8f';
const HORIZON = '#f6b06a';
const SEA_DEEP = '#0a2740';
const SEA_SHALLOW = '#1d4f6b';

/** Choose a terrain colour from its height and slope: beach, grass, rock, snow. */
function terrainColour(height, slope) {
  if (height < 6) return '#c8b083';
  if (height < 34) return slope > 0.5 ? '#6b7d3a' : '#7f9448';
  if (height < 90) return slope > 0.6 ? '#5a6b31' : '#6b7d3a';
  if (height < 150) return '#6a6152';
  return slope > 0.55 ? '#8b8377' : '#b6b0a4';
}

/** Paint the sky: a vertical gradient with a warm band at the horizon. */
function paintSky(ctx, width, height) {
  const g = ctx.createLinearGradient(0, 0, 0, height);
  g.addColorStop(0, SKY_TOP);
  g.addColorStop(0.45, SKY_MID);
  g.addColorStop(0.72, HORIZON);
  g.addColorStop(1, '#f8d8a8');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);

  // A low sun, sitting on the horizon line.
  const sunX = width * 0.68;
  const sunY = height * 0.62;
  const halo = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, height * 0.5);
  halo.addColorStop(0, 'rgba(255,236,190,0.95)');
  halo.addColorStop(0.25, 'rgba(255,190,120,0.35)');
  halo.addColorStop(1, 'rgba(255,160,90,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, width, height);
}

/** Draw the sea plane under everything, with a few lighter bands for swell. */
function paintSea(ctx, width, height, horizonY) {
  const g = ctx.createLinearGradient(0, horizonY, 0, height);
  g.addColorStop(0, SEA_SHALLOW);
  g.addColorStop(0.4, SEA_DEEP);
  g.addColorStop(1, '#061a2c');
  ctx.fillStyle = g;
  ctx.fillRect(0, horizonY, width, height - horizonY);
}

/**
 * Draw the terrain as a grid of quads, sorted by distance from the camera so nearer cells paint
 * over farther ones. Cells under sea level are skipped: the sea shows through.
 */
function paintTerrain(ctx, world, viewProj, width, height, camera) {
  const { cell } = world;
  const cells = [];
  for (let iz = 0; iz < GRID; iz += 1) {
    for (let ix = 0; ix < GRID; ix += 1) {
      const x0 = -TERRAIN_SIZE / 2 + ix * cell;
      const z0 = -TERRAIN_SIZE / 2 + iz * cell;
      const x1 = x0 + cell;
      const z1 = z0 + cell;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const h = heightAt(world, cx, cz);
      if (h < 2) continue;
      const dist = Math.hypot(cx - camera[0], cz - camera[2]);
      if (dist > 5200) continue;
      const hA = heightAt(world, x0, z0);
      const hB = heightAt(world, x1, z0);
      const hC = heightAt(world, x1, z1);
      const hD = heightAt(world, x0, z1);
      const slope = (Math.max(hA, hB, hC, hD) - Math.min(hA, hB, hC, hD)) / cell;
      cells.push({ dist, pts: [[x0, hA, z0], [x1, hB, z0], [x1, hC, z1], [x0, hD, z1]], h, slope });
    }
  }
  cells.sort((a, b) => b.dist - a.dist);

  for (const c of cells) {
    const pts = [];
    let behind = 0;
    for (const p of c.pts) {
      const s = project(viewProj, p, width, height);
      if (!s) { behind += 1; continue; }
      pts.push(s);
    }
    if (behind > 0 || pts.length < 3) continue;
    const shade = clamp(1 - c.h / 420, 0.55, 1.15);
    ctx.fillStyle = terrainColour(c.h, c.slope);
    ctx.globalAlpha = shade;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/** The runway: a dark strip with a dashed centre line and threshold markings. */
function paintRunway(ctx, world, viewProj, width, height) {
  const r = world.runway;
  const y = r.elevation + 0.6;
  const halfL = r.length * 0.5;
  const halfW = r.width * 0.5;

  const quad = (ax, az, bx, bz, colour) => {
    const p = [
      project(viewProj, [ax, y, az], width, height),
      project(viewProj, [bx, y, az], width, height),
      project(viewProj, [bx, y, bz], width, height),
      project(viewProj, [ax, y, bz], width, height),
    ];
    if (p.some((v) => !v)) return;
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < 4; i += 1) ctx.lineTo(p[i][0], p[i][1]);
    ctx.closePath();
    ctx.fill();
  };

  quad(r.x - halfW, r.z - halfL, r.x + halfW, r.z + halfL, '#2b2f36');
  for (let i = 0; i < 26; i += 1) {
    const z0 = r.z - halfL + 40 + i * (r.length - 80) / 26;
    quad(r.x - 3, z0, r.x + 3, z0 + 26, '#e8e2d2');
  }
  quad(r.x - halfW, r.z - halfL, r.x + halfW, r.z - halfL + 26, '#e8e2d2');
  quad(r.x - halfW, r.z + halfL - 26, r.x + halfW, r.z + halfL, '#e8e2d2');
}

/** Target rings, drawn back to front, with the next one lit. */
function paintRings(ctx, rings, nextIndex, viewProj, width, height) {
  const sorted = rings
    .map((r, i) => ({ r, i, d: 0 }))
    .sort((a, b) => b.i - a.i);
  for (const { r, i } of sorted) {
    const c = project(viewProj, r.position, width, height);
    if (!c) continue;
    const edge = project(viewProj, [r.position[0], r.position[1], r.position[2] + r.radius], width, height);
    if (!edge) continue;
    const radius = Math.max(6, Math.hypot(edge[0] - c[0], edge[1] - c[1]));
    const isNext = i === nextIndex;
    ctx.strokeStyle = r.passed ? 'rgba(120,220,150,0.55)' : isNext ? '#ffd166' : 'rgba(255,209,102,0.35)';
    ctx.lineWidth = isNext ? 5 : 3;
    ctx.beginPath();
    ctx.ellipse(c[0], c[1], radius, radius * 0.42, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (isNext) {
      ctx.strokeStyle = 'rgba(255,209,102,0.25)';
      ctx.lineWidth = 12;
      ctx.stroke();
    }
  }
}

/** The aircraft, drawn as a small silhouette in the chase view and a nose in the cockpit view. */
function paintAircraft(ctx, state, viewProj, width, height, cockpit) {
  if (cockpit) return; // the cockpit frame is the aircraft
  // A chase camera sits behind and above the aircraft: it is drawn as a fixed silhouette low in
  // the frame, banking with the attitude, which reads the way a third-person flight game does.
  const cx = width * 0.5;
  const cy = height * 0.82;
  const s = Math.min(width, height) * 0.062;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(state.bank * 0.5);
  ctx.globalAlpha = 0.98;
  // wings
  ctx.fillStyle = '#8f9aab';
  ctx.beginPath();
  ctx.moveTo(-s * 2.1, s * 0.05);
  ctx.lineTo(s * 2.1, s * 0.05);
  ctx.lineTo(s * 1.75, s * 0.42);
  ctx.lineTo(-s * 1.75, s * 0.42);
  ctx.closePath();
  ctx.fill();
  // fuselage
  ctx.fillStyle = '#e2e7ee';
  ctx.beginPath();
  ctx.moveTo(0, -s * 1.7);
  ctx.lineTo(s * 0.26, s * 0.95);
  ctx.lineTo(-s * 0.26, s * 0.95);
  ctx.closePath();
  ctx.fill();
  // tail plane
  ctx.fillStyle = '#8f9aab';
  ctx.beginPath();
  ctx.moveTo(-s * 0.75, s * 0.9);
  ctx.lineTo(s * 0.75, s * 0.9);
  ctx.lineTo(s * 0.45, s * 1.22);
  ctx.lineTo(-s * 0.45, s * 1.22);
  ctx.closePath();
  ctx.fill();
  // fin
  ctx.fillStyle = '#c3ccd8';
  ctx.beginPath();
  ctx.moveTo(0, -s * 1.7);
  ctx.lineTo(s * 0.12, -s * 1.05);
  ctx.lineTo(-s * 0.12, -s * 1.05);
  ctx.closePath();
  ctx.fill();
  // exhaust glow, brighter with throttle
  ctx.globalAlpha = 0.35 + state.throttle * 0.5;
  ctx.fillStyle = '#7fd4ff';
  ctx.beginPath();
  ctx.ellipse(0, s * 0.98, s * 0.22, s * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Instruments: the HUD strip, the compass ribbon, the speed and altitude tapes and the ring cue. */
function paintHud(ctx, state, width, height, rings, nextIndex, mission) {
  ctx.save();
  ctx.font = '600 15px "Segoe UI", system-ui, sans-serif';
  ctx.textBaseline = 'middle';

  // Heading ribbon across the top.
  const ribbonW = Math.min(width * 0.5, 520);
  const rx = (width - ribbonW) / 2;
  ctx.fillStyle = 'rgba(8,16,28,0.62)';
  ctx.fillRect(rx, 18, ribbonW, 34);
  ctx.strokeStyle = 'rgba(150,200,240,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(rx, 18, ribbonW, 34);
  const deg = ((state.heading * 180) / Math.PI + 360) % 360;
  for (let d = -60; d <= 60; d += 10) {
    const mark = (Math.round(deg / 10) * 10 + d + 360) % 360;
    const x = rx + ribbonW / 2 + ((d - (deg - Math.round(deg / 10) * 10)) / 120) * ribbonW;
    if (x < rx || x > rx + ribbonW) continue;
    ctx.strokeStyle = 'rgba(190,220,245,0.5)';
    ctx.beginPath();
    ctx.moveTo(x, 26);
    ctx.lineTo(x, 34);
    ctx.stroke();
    if (mark % 30 === 0) {
      ctx.fillStyle = 'rgba(220,235,250,0.85)';
      ctx.textAlign = 'center';
      ctx.fillText({ 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[mark] ?? String(mark), x, 44);
    }
  }
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.moveTo(rx + ribbonW / 2, 16);
  ctx.lineTo(rx + ribbonW / 2 - 7, 6);
  ctx.lineTo(rx + ribbonW / 2 + 7, 6);
  ctx.closePath();
  ctx.fill();

  // Speed tape, left.
  const tapeX = 34;
  const tapeTop = height * 0.32;
  const tapeH = height * 0.36;
  ctx.fillStyle = 'rgba(8,16,28,0.6)';
  ctx.fillRect(tapeX, tapeTop, 96, tapeH);
  ctx.strokeStyle = 'rgba(150,200,240,0.35)';
  ctx.strokeRect(tapeX, tapeTop, 96, tapeH);
  ctx.fillStyle = 'rgba(200,225,245,0.65)';
  ctx.textAlign = 'right';
  ctx.font = '600 12px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('KNOTS', tapeX + 88, tapeTop - 12);
  for (let i = -3; i <= 3; i += 1) {
    const v = Math.round(state.airspeed / 10) * 10 + i * 20;
    if (v < 0) continue;
    const y = tapeTop + tapeH / 2 + (state.airspeed - v) * 1.6;
    if (y < tapeTop + 4 || y > tapeTop + tapeH - 4) continue;
    ctx.fillStyle = 'rgba(200,225,245,0.6)';
    ctx.beginPath();
    ctx.moveTo(tapeX + 96, y);
    ctx.lineTo(tapeX + 84, y);
    ctx.stroke();
    ctx.fillStyle = 'rgba(210,230,248,0.75)';
    ctx.textAlign = 'right';
    ctx.fillText(String(v), tapeX + 78, y);
  }
  ctx.fillStyle = state.stalled ? '#ff6b6b' : '#8ef0a8';
  ctx.font = '700 22px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(String(Math.round(state.airspeed)), tapeX + 78, tapeTop + tapeH / 2);

  // Altitude tape, right.
  const altX = width - 130;
  ctx.fillStyle = 'rgba(8,16,28,0.6)';
  ctx.fillRect(altX, tapeTop, 96, tapeH);
  ctx.strokeStyle = 'rgba(150,200,240,0.35)';
  ctx.strokeRect(altX, tapeTop, 96, tapeH);
  ctx.fillStyle = 'rgba(200,225,245,0.65)';
  ctx.textAlign = 'left';
  ctx.font = '600 12px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('FEET', altX + 8, tapeTop - 12);
  const feet = state.position[1] * 3.2808;
  for (let i = -3; i <= 3; i += 1) {
    const v = Math.round(feet / 100) * 100 + i * 200;
    if (v < 0) continue;
    const y = tapeTop + tapeH / 2 + (feet - v) * 0.26;
    if (y < tapeTop + 4 || y > tapeTop + tapeH - 4) continue;
    ctx.strokeStyle = 'rgba(200,225,245,0.6)';
    ctx.beginPath();
    ctx.moveTo(altX, y);
    ctx.lineTo(altX + 12, y);
    ctx.stroke();
    ctx.fillStyle = 'rgba(210,230,248,0.75)';
    ctx.textAlign = 'left';
    ctx.fillText(String(v), altX + 18, y);
  }
  ctx.fillStyle = '#9fd8ff';
  ctx.font = '700 22px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(String(Math.round(feet)), altX + 18, tapeTop + tapeH / 2);

  // Vertical speed, under the altitude tape.
  // Vertical speed in feet per minute: knots to ft/min at the rate the aircraft actually climbs.
  const vs = state.verticalSpeed * 101.27;
  ctx.fillStyle = vs >= 0 ? 'rgba(140,240,170,0.9)' : 'rgba(255,150,140,0.9)';
  ctx.textAlign = 'left';
  ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(`${vs >= 0 ? '+' : ''}${Math.round(vs)} fpm`, altX + 8, tapeTop + tapeH + 20);

  // Fuel bar, bottom left.
  ctx.fillStyle = 'rgba(8,16,28,0.6)';
  ctx.fillRect(34, height - 58, 190, 16);
  ctx.strokeStyle = 'rgba(150,200,240,0.35)';
  ctx.strokeRect(34, height - 58, 190, 16);
  ctx.fillStyle = state.fuel < 0.2 ? '#ff6b6b' : '#7fd4ff';
  ctx.fillRect(35, height - 57, 188 * state.fuel, 14);
  ctx.fillStyle = 'rgba(215,232,248,0.8)';
  ctx.font = '600 12px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('FUEL', 34, height - 30);

  // Throttle bar, bottom left beside the fuel.
  ctx.fillStyle = 'rgba(8,16,28,0.6)';
  ctx.fillRect(240, height - 58, 130, 16);
  ctx.strokeStyle = 'rgba(150,200,240,0.35)';
  ctx.strokeRect(240, height - 58, 130, 16);
  ctx.fillStyle = '#ffd166';
  ctx.fillRect(241, height - 57, 128 * state.throttle, 14);
  ctx.fillStyle = 'rgba(215,232,248,0.8)';
  ctx.fillText('THROTTLE', 240, height - 30);

  // Mission line, top left.
  ctx.textAlign = 'left';
  ctx.font = '700 16px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,240,214,0.95)';
  ctx.fillText(mission.title, 34, 40);
  ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(200,225,245,0.75)';
  ctx.fillText(mission.objective, 34, 62);

  // Ring cue: a bracket around the next ring's screen position.
  const next = rings[nextIndex];
  if (next) {
    ctx.fillStyle = 'rgba(255,209,102,0.9)';
    ctx.font = '700 14px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`RING ${nextIndex + 1}/${rings.length}`, width / 2, height - 40);
  }

  // Warnings.
  if (state.stalled) {
    ctx.fillStyle = 'rgba(255,90,90,0.95)';
    ctx.font = '800 26px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('STALL', width / 2, height * 0.28);
  }
  if (state.fuel <= 0) {
    ctx.fillStyle = 'rgba(255,150,90,0.95)';
    ctx.font = '800 22px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('FUEL EMPTY', width / 2, height * 0.34);
  }
  ctx.restore();
}

/** The cockpit frame drawn over the view, so the camera is inside an aircraft. */
function paintCockpitFrame(ctx, width, height) {
  ctx.save();
  const g = ctx.createLinearGradient(0, height * 0.78, 0, height);
  g.addColorStop(0, 'rgba(14,20,28,0.0)');
  g.addColorStop(1, 'rgba(10,14,20,0.95)');
  ctx.fillStyle = g;
  ctx.fillRect(0, height * 0.78, width, height * 0.22);

  // Canopy struts.
  ctx.fillStyle = 'rgba(12,18,26,0.92)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(width * 0.1, 0);
  ctx.lineTo(width * 0.03, height * 0.55);
  ctx.lineTo(0, height * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(width, 0);
  ctx.lineTo(width * 0.9, 0);
  ctx.lineTo(width * 0.97, height * 0.55);
  ctx.lineTo(width, height * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** The whole frame: sky, sea, terrain, runway, rings, aircraft, cockpit frame and HUD. */
export function renderFrame(ctx, scene, width, height) {
  const { aircraft, world, rings, nextIndex, mission, cameraMode } = scene;

  const eye = cameraMode === 'cockpit'
    ? V3.add(aircraft.position, [0, 2.2, 0])
    : V3.add(aircraft.position, [
        -Math.sin(aircraft.heading) * 26,
        9 + aircraft.pitch * 8,
        -Math.cos(aircraft.heading) * 26,
      ]);
  const forward = [
    Math.sin(aircraft.heading) * Math.cos(aircraft.pitch),
    Math.sin(aircraft.pitch),
    Math.cos(aircraft.heading) * Math.cos(aircraft.pitch),
  ];
  const target = V3.add(eye, V3.mul(forward, 120));
  const view = mat4LookAt(eye, target, [0, 1, 0]);
  const proj = mat4Perspective(rad(cameraMode === 'cockpit' ? 78 : 66), width / height, 0.6, 9000);
  const viewProj = multiply(proj, view);

  paintSky(ctx, width, height);
  const horizonY = height * 0.5;
  paintSea(ctx, width, height, horizonY);
  paintTerrain(ctx, world, viewProj, width, height, eye);
  paintRunway(ctx, world, viewProj, width, height);
  paintRings(ctx, rings, nextIndex, viewProj, width, height);
  paintAircraft(ctx, aircraft, viewProj, width, height, cameraMode === 'cockpit');
  if (cameraMode === 'cockpit') paintCockpitFrame(ctx, width, height);
  paintHud(ctx, aircraft, width, height, rings, nextIndex, mission);
}

/** Column-major matrix product: `proj` applied to `view`. */
function multiply(a, b) {
  const out = new Array(16);
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      out[c * 4 + r] =
        a[r] * b[c * 4] +
        a[4 + r] * b[c * 4 + 1] +
        a[8 + r] * b[c * 4 + 2] +
        a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

export { multiply };
