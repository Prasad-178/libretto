import type { Point } from "./types";
type Rect = Point & { width: number; height: number };
// Route only when imported pins move nodes away from Dagre's solved geometry.
// A rectilinear visibility grid keeps every segment outside the final node boxes.
export function orthogonalRoute(
  from: Point,
  to: Point,
  obstacles: Rect[],
): Point[] {
  const xs = [
    ...new Set([
      from.x,
      to.x,
      ...obstacles.flatMap((r) => [r.x - 24, r.x + r.width + 24]),
    ]),
  ].sort((a, b) => a - b);
  const ys = [
    ...new Set([
      from.y,
      from.y + 24,
      to.y,
      to.y - 24,
      ...obstacles.flatMap((r) => [r.y - 24, r.y + r.height + 24]),
    ]),
  ].sort((a, b) => a - b);
  const width = xs.length,
    key = (x: number, y: number) => y * width + x;
  const point = (id: number): Point => ({
    x: xs[id % width],
    y: ys[Math.floor(id / width)],
  });
  const start = key(xs.indexOf(from.x), ys.indexOf(from.y)),
    end = key(xs.indexOf(to.x), ys.indexOf(to.y));
  const clear = (a: Point, b: Point) =>
    !obstacles.some((r) =>
      a.x === b.x
        ? a.x > r.x &&
          a.x < r.x + r.width &&
          Math.max(a.y, b.y) > r.y &&
          Math.min(a.y, b.y) < r.y + r.height
        : a.y > r.y &&
          a.y < r.y + r.height &&
          Math.max(a.x, b.x) > r.x &&
          Math.min(a.x, b.x) < r.x + r.width,
    );
  const distance = (a: Point, b: Point) =>
    Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const costs = new Map<number, number>([[start, 0]]),
    previous = new Map<number, number>();
  const queue: { id: number; score: number }[] = [];
  function push(id: number, score: number) {
    queue.push({ id, score });
    let i = queue.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (queue[p].score <= score) break;
      [queue[p], queue[i]] = [queue[i], queue[p]];
      i = p;
    }
  }
  function pop() {
    const top = queue[0],
      last = queue.pop()!;
    if (queue.length) {
      queue[0] = last;
      let i = 0;
      while (true) {
        let c = i * 2 + 1;
        if (c >= queue.length) break;
        if (c + 1 < queue.length && queue[c + 1].score < queue[c].score) c++;
        if (queue[i].score <= queue[c].score) break;
        [queue[i], queue[c]] = [queue[c], queue[i]];
        i = c;
      }
    }
    return top;
  }
  push(start, distance(from, to));
  const closed = new Set<number>();
  while (queue.length) {
    const { id } = pop();
    if (closed.has(id)) continue;
    closed.add(id);
    if (id === end) {
      const result = [to];
      let cursor = end;
      while (cursor !== start) {
        cursor = previous.get(cursor)!;
        result.unshift(point(cursor));
      }
      return result.filter(
        (p, i) =>
          i === 0 ||
          i === result.length - 1 ||
          !(
            (result[i - 1].x === p.x && p.x === result[i + 1].x) ||
            (result[i - 1].y === p.y && p.y === result[i + 1].y)
          ),
      );
    }
    const x = id % width,
      y = Math.floor(id / width),
      a = point(id);
    for (const [nx, ny] of [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ]) {
      if (nx < 0 || nx >= width || ny < 0 || ny >= ys.length) continue;
      const next = key(nx, ny),
        b = point(next);
      if (closed.has(next) || !clear(a, b)) continue;
      const cost = costs.get(id)! + distance(a, b);
      if (cost < (costs.get(next) ?? Infinity)) {
        costs.set(next, cost);
        previous.set(next, id);
        push(next, cost + distance(b, to));
      }
    }
  }
  throw new Error(
    "Pinned steps overlap a connector endpoint. Move the pins in the layout file or reopen without it.",
  );
}
