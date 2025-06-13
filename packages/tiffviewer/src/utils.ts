import type { ReadRasterResult } from "geotiff";

export function normalizeIfNeeded(raster: ReadRasterResult): Uint8ClampedArray {
  const arr = ArrayBuffer.isView(raster)
    ? raster
    : (raster as unknown as { data: ArrayLike<number> }).data;
  if (arr instanceof Float32Array || arr instanceof Float64Array) {
    let min = Infinity;
    let max = -Infinity;
    for (const v of arr) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const range = max - min || 1;
    return Uint8ClampedArray.from(arr, (v) =>
      Math.min(255, Math.max(0, ((v - min) / range) * 255))
    );
  }
  return new Uint8ClampedArray(arr);
}
