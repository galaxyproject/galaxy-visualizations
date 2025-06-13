// Color palettes for TIFF viewer
export const COLOR_PALETTES = {
  grayscale: {
    name: "Grayscale",
    map: (v: number) => [v, v, v],
  },
  viridis: {
    name: "Viridis",
    map: (v: number) => {
      // Simple viridis approximation
      const t = v / 255;
      const r = Math.round(68 + 187 * t);
      const g = Math.round(1 + 253 * t);
      const b = Math.round(84 + 170 * t);
      return [r, g, b];
    },
  },
  magma: {
    name: "Magma",
    map: (v: number) => {
      // Simple magma approximation
      const t = v / 255;
      const r = Math.round(251 * t);
      const g = Math.round(52 * (1 - t) + 0 * t);
      const b = Math.round(21 * (1 - t) + 136 * t);
      return [r, g, b];
    },
  },
  hot: {
    name: "Hot",
    map: (v: number) => {
      // Simple hot colormap
      const t = v / 255;
      const r = Math.min(255, Math.round(255 * t * 3));
      const g = Math.min(255, Math.round(255 * (t * 3 - 1)));
      const b = Math.min(255, Math.round(255 * (t * 3 - 2)));
      return [r, g, b];
    },
  },
} as const;

export type PaletteKey = keyof typeof COLOR_PALETTES;
