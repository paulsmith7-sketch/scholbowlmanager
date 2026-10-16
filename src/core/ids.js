// Short random ids. Collisions are vanishingly unlikely at tournament scale.
export function uid(prefix = '') {
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36).slice(-4);
  return `${prefix}${time}${rand}`;
}
