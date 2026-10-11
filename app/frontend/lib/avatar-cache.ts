interface Entry {
  version: string;
  promise: Promise<string | null>;
  url: string | null;
}

const entries = new Map<string, Entry>();

const keyOf = (userId: string, version: string) => `${userId}:${version}`;

function revoke(url: string | null) {
  if (url) URL.revokeObjectURL(url);
}

export function loadAvatar(
  userId: string,
  version: string,
  fetcher: (userId: string) => Promise<Blob>,
): Promise<string | null> {
  const key = keyOf(userId, version);
  const hit = entries.get(key);
  if (hit) return hit.promise;
  for (const [k, e] of entries) {
    if (k.startsWith(`${userId}:`) && e.version !== version) {
      revoke(e.url);
      entries.delete(k);
    }
  }
  const entry: Entry = { version, url: null, promise: Promise.resolve(null) };
  entry.promise = fetcher(userId).then(
    (blob) => {
      if (entries.get(key) !== entry) return null;
      entry.url = URL.createObjectURL(blob);
      return entry.url;
    },
    () => {
      if (entries.get(key) === entry) entries.delete(key);
      return null;
    },
  );
  entries.set(key, entry);
  return entry.promise;
}

export function invalidateAvatar(userId: string) {
  for (const [k, e] of entries) {
    if (k.startsWith(`${userId}:`)) {
      revoke(e.url);
      entries.delete(k);
    }
  }
}

export function clearAvatarCache() {
  for (const e of entries.values()) revoke(e.url);
  entries.clear();
}
