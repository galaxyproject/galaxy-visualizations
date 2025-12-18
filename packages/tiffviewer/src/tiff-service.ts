import { fromArrayBuffer, GeoTIFF, GeoTIFFImage } from "geotiff";

export class TIFFService {
  private tiff: GeoTIFF | null = null;
  private pageCount: number = 0;

  async load(url: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch TIFF file");
    const arrayBuffer = await response.arrayBuffer();
    this.tiff = await fromArrayBuffer(arrayBuffer);
    this.pageCount = await this.tiff.getImageCount();
  }

  getPageCount(): number {
    return this.pageCount;
  }

  async getImage(index: number): Promise<GeoTIFFImage> {
    if (!this.tiff) throw new Error("TIFF not loaded");
    return this.tiff.getImage(index);
  }
}
