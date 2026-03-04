// Helpers: distance and heading calculations, and object extension utility.

const { sqrt, atan2 } = Math;

export interface HasXY {
  x: number;
  y: number;
}

// Extend a source object with the properties of another object (shallow copy).
export function extend<T extends object>(object: T, properties: Partial<T>): T {
  for (const key in properties) {
    if (Object.prototype.hasOwnProperty.call(properties, key)) {
      object[key] = properties[key] as T[typeof key];
    }
  }
  return object;
}

// Calculate the distance between two objects.
export function distance(a: HasXY, b: HasXY): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return sqrt(dx * dx + dy * dy);
}

// Calculate the heading from `a` towards `b` in radians.
export const heading = (a: HasXY, b: HasXY): number => atan2(b.y - a.y, b.x - a.x);
