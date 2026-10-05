import { createClient } from "@/lib/supabase/client";

export const ICON_BUCKET = "icons";

/* Shrinks a picture to fit a small square (cropped to fill, or kept whole)
   and returns it as a compressed image. */
export async function prepareImage(
  file: File,
  size: number,
  crop: boolean
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser could not process the image.");
  if (crop) {
    const side = Math.min(bitmap.width, bitmap.height);
    canvas.width = size;
    canvas.height = size;
    ctx.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      size,
      size
    );
  } else {
    const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  }
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Could not prepare the image.")),
      "image/webp",
      0.9
    );
  });
}

export function iconPathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/object/public/${ICON_BUCKET}/`;
  const i = url.indexOf(marker);
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length));
}

/* Uploads a picture to the shared icons bucket and returns its public address. */
export async function uploadIcon(
  file: File,
  folder: string,
  opts: { size?: number; crop?: boolean } = {}
): Promise<string> {
  const blob = await prepareImage(file, opts.size ?? 256, opts.crop ?? true);
  const ext = blob.type === "image/png" ? "png" : blob.type === "image/jpeg" ? "jpg" : "webp";
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const supabase = createClient();
  const { error } = await supabase.storage
    .from(ICON_BUCKET)
    .upload(path, blob, { contentType: blob.type, upsert: false });
  if (error) throw error;
  return supabase.storage.from(ICON_BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function removeIcon(url: string | null | undefined) {
  const path = iconPathFromUrl(url);
  if (!path) return;
  const supabase = createClient();
  await supabase.storage.from(ICON_BUCKET).remove([path]);
}
