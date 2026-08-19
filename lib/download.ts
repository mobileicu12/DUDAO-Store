// Pull a generated file (Excel, PDF, CSV) down from an API route without
// navigating the tab. Fetching it keeps the page put, lets a failure come back
// as an on-screen message, and gives the caller something to hang a spinner on.

export class DownloadError extends Error {}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function filenameFrom(res: Response, fallback: string): string {
  const cd = res.headers.get("Content-Disposition") || "";
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  if (star) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      /* fall through */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(cd);
  return plain ? plain[1].trim() : fallback;
}

export async function downloadFile(url: string, fallbackName = "download"): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    const msg = await res
      .clone()
      .json()
      .then((d: { error?: string }) => d?.error)
      .catch(() => null);
    throw new DownloadError(msg || `Export failed (${res.status})`);
  }
  const blob = await res.blob();
  if (blob.size === 0) throw new DownloadError("The export came back empty.");
  const name = filenameFrom(res, fallbackName);
  saveBlob(blob, name);
  return name;
}
