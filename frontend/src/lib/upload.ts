import { API_URL } from "@/lib/config";
import { useAuth } from "@/stores/auth";
import { ApiError } from "./api/client";
import type { AttachmentOut } from "./api/types";

/** Multipart upload with progress (fetch has no upload progress, so this uses XHR). */
export function uploadAttachment(
  file: Blob,
  opts: { filename?: string; fields?: Record<string, string>; onProgress?: (fraction: number) => void } = {},
): Promise<AttachmentOut> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}/api/attachments`);
    const token = useAuth.getState().token;
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && opts.onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      let data: { error?: { code: string; message: string } } | AttachmentOut | null = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300) return resolve(data as AttachmentOut);
      if (xhr.status === 401) useAuth.getState().signOut();
      const err = (data as { error?: { code: string; message: string } })?.error;
      reject(new ApiError(xhr.status, err?.code ?? "upload_failed", err?.message ?? "Upload failed"));
    };
    xhr.onerror = () => reject(new TypeError("Network error during upload"));
    const form = new FormData();
    form.append("file", file, opts.filename ?? (file instanceof File ? file.name : "upload"));
    Object.entries(opts.fields ?? {}).forEach(([k, v]) => form.append(k, v));
    xhr.send(form);
  });
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
