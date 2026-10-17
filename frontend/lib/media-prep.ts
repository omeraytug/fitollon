// Prepares picked files in the browser before upload: photos are resized to JPEG (iPhone photos are 3-6 MB),
// videos get a poster frame. Both get a small thumbnail for the grid.

const FULL_EDGE = 2048;
const THUMB_EDGE = 512;

export type Prepared = {
  kind: "photo" | "video";
  file: Blob;
  thumb: Blob;
  extension: string;
  width: number;
  height: number;
  durationS: number | null;
  takenOn: string | null; // YYYY-MM-DD when the file says when it was taken
  previewUrl: string; // object URL of the thumbnail, for the upload sheet
};

function toJpeg(source: CanvasImageSource, width: number, height: number, edge: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, edge / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not encode image"))), "image/jpeg", quality),
  );
}

/** DateTimeOriginal from a JPEG's EXIF block, as YYYY-MM-DD. */
async function exifDate(file: Blob): Promise<string | null> {
  const view = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;
  let offset = 2;
  while (offset + 4 < view.byteLength) {
    const marker = view.getUint16(offset);
    const length = view.getUint16(offset + 2);
    if (marker === 0xffe1 && view.getUint32(offset + 4) === 0x45786966) {
      const tiff = offset + 10;
      const little = view.getUint16(tiff) === 0x4949;
      const u16 = (at: number) => view.getUint16(at, little);
      const u32 = (at: number) => view.getUint32(at, little);
      const findTag = (ifd: number, tag: number): number | null => {
        const count = u16(ifd);
        for (let i = 0; i < count; i++) {
          const entry = ifd + 2 + i * 12;
          if (u16(entry) === tag) return entry;
        }
        return null;
      };
      const readAscii = (entry: number) => {
        const at = tiff + u32(entry + 8);
        let text = "";
        for (let i = 0; i < 19 && at + i < view.byteLength; i++) text += String.fromCharCode(view.getUint8(at + i));
        return text;
      };
      const ifd0 = tiff + u32(tiff + 4);
      const exifPointer = findTag(ifd0, 0x8769);
      const entry = (exifPointer && findTag(tiff + u32(exifPointer + 8), 0x9003)) || findTag(ifd0, 0x0132);
      if (!entry) return null;
      const match = /^(\d{4}):(\d{2}):(\d{2})/.exec(readAscii(entry));
      return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
    }
    if ((marker & 0xff00) !== 0xff00) return null;
    offset += 2 + length;
  }
  return null;
}

async function preparePhoto(file: File): Promise<Prepared> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file); // applies the EXIF rotation
  } catch {
    throw new Error(`${file.name}: this browser can't read that image format`);
  }
  const [full, thumb, takenOn] = await Promise.all([
    toJpeg(bitmap, bitmap.width, bitmap.height, FULL_EDGE, 0.86),
    toJpeg(bitmap, bitmap.width, bitmap.height, THUMB_EDGE, 0.8),
    exifDate(file).catch(() => null),
  ]);
  const scale = Math.min(1, FULL_EDGE / Math.max(bitmap.width, bitmap.height));
  const result = {
    kind: "photo" as const,
    file: full,
    thumb,
    extension: "jpg",
    width: Math.round(bitmap.width * scale),
    height: Math.round(bitmap.height * scale),
    durationS: null,
    takenOn,
    previewUrl: URL.createObjectURL(thumb),
  };
  bitmap.close();
  return result;
}

function once(target: HTMLVideoElement, event: string, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
    target.addEventListener(event, () => (clearTimeout(timer), resolve()), { once: true });
    target.addEventListener("error", () => (clearTimeout(timer), reject(new Error("video error"))), { once: true });
  });
}

function placeholderThumb(): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 320;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#2a2a28";
  context.fillRect(0, 0, 320, 320);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob!), "image/jpeg", 0.8));
}

async function prepareVideo(file: File): Promise<Prepared> {
  const extension = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" }[file.type];
  if (!extension) throw new Error(`${file.name}: use an MP4, MOV or WebM video`);
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    await once(video, "loadedmetadata");
    let thumb: Blob;
    try {
      video.currentTime = Math.min(0.5, video.duration / 2);
      await once(video, "seeked");
      thumb = await toJpeg(video, video.videoWidth, video.videoHeight, THUMB_EDGE, 0.8);
    } catch {
      thumb = await placeholderThumb(); // some browsers won't hand out a frame before playback
    }
    return {
      kind: "video",
      file,
      thumb,
      extension,
      width: video.videoWidth,
      height: video.videoHeight,
      durationS: Number.isFinite(video.duration) ? video.duration : null,
      takenOn: null,
      previewUrl: URL.createObjectURL(thumb),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A photo for the coach: at most 1600 px on its longest side, as JPEG (a few hundred KB). */
export async function chatPhoto(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file); // applies the EXIF rotation
  } catch {
    throw new Error(`${file.name || "That file"}: this browser can't read that image format`);
  }
  try {
    return await toJpeg(bitmap, bitmap.width, bitmap.height, 1600, 0.85);
  } finally {
    bitmap.close();
  }
}

/** The file's bytes as base64, without the data: prefix. */
export function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the photo"));
    reader.readAsDataURL(blob);
  });
}

export function prepare(file: File): Promise<Prepared> {
  if (file.type.startsWith("video/")) return prepareVideo(file);
  return preparePhoto(file);
}

/** The day a file was taken: its EXIF date, else its modified date. */
export function takenDay(prepared: Prepared, file: File): string {
  if (prepared.takenOn) return prepared.takenOn;
  const modified = new Date(file.lastModified || Date.now());
  return new Date(modified.getTime() - modified.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}
