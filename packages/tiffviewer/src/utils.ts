import type { ReadRasterResult } from "geotiff";

export function normalizeIfNeeded(raster: ReadRasterResult): Uint8ClampedArray {
  const arr = ArrayBuffer.isView(raster)
    ? raster
    : (raster as unknown as { data: ArrayLike<number> }).data;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;
  return Uint8ClampedArray.from(arr, (v) =>
    Math.min(255, Math.max(0, ((v - min) / range) * 255))
  );
}
