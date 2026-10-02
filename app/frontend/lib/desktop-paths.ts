// Where each desktop upload's source file lives on THIS device, keyed by file
// name, so an unfinished upload resumes without a file picker. Uploads started
// on another device have no entry here.
const KEY = "zcrypt-desktop-upload-paths";

function read(): Record<string, string> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function write(map: Record<string, string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // Storage blocked or full: resume falls back to the picker.
  }
}

export function rememberUploadPath(path: string): void {
  const name = path.split(/[/\\]/).pop();
  if (!name) return;
  write({ ...read(), [name]: path });
}

export function forgetUploadPath(path: string): void {
  const name = path.split(/[/\\]/).pop();
  if (!name) return;
  const map = read();
  if (map[name] !== path) return;
  delete map[name];
  write(map);
}

export function uploadPathFor(fileName: string): string | undefined {
  return read()[fileName];
}
