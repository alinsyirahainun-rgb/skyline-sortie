// Keyboard and mouse input, in the shape the flight model wants: pitch, roll, yaw and throttle.
// Arrow keys or WASD fly, Page Up and Page Down move the throttle, C swaps the camera.

const keys = new Set();

export function installInput(target = window) {
  target.addEventListener('keydown', (event) => {
    keys.add(event.key.toLowerCase());
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(event.key.toLowerCase())) {
      event.preventDefault();
    }
  });
  target.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
  target.addEventListener('blur', () => keys.clear());
}

/** Read the current input as the flight model's four axes. */
export function readInput() {
  const down = (k) => keys.has(k);
  const pitch = (down('arrowup') || down('w') ? 1 : 0) - (down('arrowdown') || down('s') ? 1 : 0);
  const roll = (down('arrowright') || down('d') ? 1 : 0) - (down('arrowleft') || down('a') ? 1 : 0);
  const yaw = (down('q') ? 1 : 0) - (down('e') ? 1 : 0);
  const throttle = (down('pageup') || down('shift') ? 1 : 0) - (down('pagedown') || down('control') ? 1 : 0);
  return { pitch, roll, yaw, throttle };
}

/** Whether the player asked to swap camera since the last call. */
let lastCameraKey = false;
export function cameraToggle() {
  const now = keys.has('c');
  const toggled = now && !lastCameraKey;
  lastCameraKey = now;
  return toggled;
}

export { keys };
