declare module "browser-id3-writer" {
  export class ID3Writer {
    constructor(buffer: ArrayBuffer);
    setFrame(frame: string, value: string | string[]): void;
    addTag(): void;
    arrayBuffer: ArrayBuffer;
  }
  const DefaultWriter: typeof ID3Writer;
  export default DefaultWriter;
}

