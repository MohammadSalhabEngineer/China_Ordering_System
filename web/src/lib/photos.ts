import { supabase } from "./supabase";

/** Shrink a photo to max 1024px JPEG so uploads stay small and fast on mobile data. */
async function shrink(file: File, max = 1024): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/jpeg", 0.86));
  } catch {
    return file; // old browser: upload as-is
  }
}

/** Uploads a new photo for an item and points the item at it. Returns the new storage path. */
export async function uploadItemPhoto(itemId: string, sheetRef: string, file: File): Promise<string> {
  const blob = await shrink(file);
  const base = sheetRef.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  const path = `items/${base}-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from("item-photos").upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
  if (error) throw new Error(error.message);
  const { error: e2 } = await supabase.from("items").update({ photo_path: path }).eq("id", itemId);
  if (e2) throw new Error(e2.message);
  return path;
}

/** Clears the item's photo. The old file is deleted best-effort. */
export async function removeItemPhoto(itemId: string, oldPath: string | null): Promise<void> {
  const { error } = await supabase.from("items").update({ photo_path: null }).eq("id", itemId);
  if (error) throw new Error(error.message);
  if (oldPath) await supabase.storage.from("item-photos").remove([oldPath]).catch(() => undefined);
}
