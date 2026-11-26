// A minimal 3D math kit for the flight game: vectors, matrices, projection and clipping.
// No library, no build step: plain ES module the browser loads directly.

export const V3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  },
  lerp: (a, b, t) => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ],
};

/** A 4x4 matrix in column-major order, as WebGL and most maths code expects. */
export function mat4Identity() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/** Right-handed view matrix looking from `eye` at `target`, with `up` as the world's up. */
export function mat4LookAt(eye, target, up) {
  const z = V3.norm(V3.sub(eye, target));
  const x = V3.norm(V3.cross(up, z));
  const y = V3.cross(z, x);
  return [
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -V3.dot(x, eye), -V3.dot(y, eye), -V3.dot(z, eye), 1,
  ];
}

/** Perspective projection: vertical field of view in radians. */
export function mat4Perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  return [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ];
}

/** Transform a point by a column-major 4x4 matrix; returns [x, y, z, w]. */
export function transformPoint(m, p) {
  const [x, y, z] = p;
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
    m[3] * x + m[7] * y + m[11] * z + m[15],
  ];
}

/** Multiply two column-major 4x4 matrices: `a` then `b`. */
export function mat4Mul(a, b) {
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

/**
 * Project a world point to screen space. Returns null when the point is behind the camera, so a
 * caller can drop it rather than draw a line across the screen.
 */
export function project(viewProj, p, width, height) {
  const c = transformPoint(viewProj, p);
  if (c[3] <= 0.0001) return null;
  const x = (c[0] / c[3] * 0.5 + 0.5) * width;
  const y = (1 - (c[1] / c[3] * 0.5 + 0.5)) * height;
  return [x, y, c[2] / c[3]];
}

/** Clip a screen-space segment against the near plane, given clip-space w values. */
export function clipSegment(a, aw, b, bw) {
  if (aw <= 0 && bw <= 0) return null;
  if (aw > 0 && bw > 0) return [a, b];
  const t = aw / (aw - bw);
  const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  return aw > 0 ? [a, p] : [p, b];
}

/** Degrees to radians. */
export const rad = (deg) => (deg * Math.PI) / 180;

/** Keep `v` inside [lo, hi]. */
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
