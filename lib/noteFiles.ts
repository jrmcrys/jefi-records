import { createClient } from "@/lib/supabase/client";
import { prepareImage } from "./imageUpload";

export const NOTES_BUCKET = "notes";

/* Files in notes (pictures, audio, attachments) live in a private bucket,
   in a folder named after the note. The note stores the path; the browser
   asks for a short-lived address each time it shows the file. */
export async function uploadNoteFile(noteId: string, file: File): Promise<{ path: string; name: string }> {
  let blob: Blob = file;
  let ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
  if (file.type.startsWith("image/") && file.type !== "image/gif" && file.type !== "image/svg+xml") {
    blob = await prepareImage(file, 2000, false);
    ext = "webp";
  }
  if (blob.size > 25 * 1024 * 1024) throw new Error("Files can be up to 25 MB.");
  const path = `${noteId}/${crypto.randomUUID()}.${ext}`;
  const supabase = createClient();
  const { error } = await supabase.storage
    .from(NOTES_BUCKET)
    .upload(path, blob, { contentType: blob.type || file.type || "application/octet-stream", upsert: false });
  if (error) throw error;
  return { path, name: file.name };
}

const cache = new Map<string, { url: string; expires: number }>();

export async function noteFileUrl(path: string): Promise<string | null> {
  const hit = cache.get(path);
  if (hit && hit.expires > Date.now() + 60_000) return hit.url;
  const supabase = createClient();
  const { data, error } = await supabase.storage.from(NOTES_BUCKET).createSignedUrl(path, 3600);
  if (error || !data) return null;
  cache.set(path, { url: data.signedUrl, expires: Date.now() + 3600_000 });
  return data.signedUrl;
}
