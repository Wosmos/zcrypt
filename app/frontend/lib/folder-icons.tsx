import {
  FileText,
  DownloadSimple,
  MusicNotes,
  ImageSquare,
  FilmSlate,
  Monitor,
  SquaresFour,
  GlobeSimple,
  Code,
  Briefcase,
  User,
  Camera,
  CloudArrowUp,
  Archive,
  Books,
  GameController,
  TextAa,
  Palette,
  NotePencil,
  Wallet,
  AirplaneTilt,
  ChefHat,
  Heartbeat,
  GraduationCap,
  Star,
  UsersThree,
  Cloud,
  Database,
  GearSix,
  type Icon,
} from "@phosphor-icons/react";

/**
 * Name → glyph rules for folders, à la macOS special folders (Documents,
 * Downloads, Music, Pictures …). Sleek Phosphor icons. Each rule lists
 * keywords; a folder takes the first rule whose keyword matches its
 * (normalized) name. ~30 categories.
 */
const RULES: { icon: Icon; keys: string[] }[] = [
  { icon: FileText, keys: ["documents", "document", "docs", "doc", "papers", "files"] },
  { icon: DownloadSimple, keys: ["downloads", "download", "dl", "torrents"] },
  { icon: MusicNotes, keys: ["music", "audio", "songs", "tracks", "sound", "sounds", "podcasts"] },
  { icon: ImageSquare, keys: ["pictures", "picture", "photos", "photo", "images", "image", "img", "wallpapers", "wallpaper", "gallery"] },
  { icon: FilmSlate, keys: ["movies", "movie", "videos", "video", "films", "film", "clips", "footage"] },
  { icon: Monitor, keys: ["desktop"] },
  { icon: SquaresFour, keys: ["applications", "application", "apps", "app", "programs", "software"] },
  { icon: GlobeSimple, keys: ["public", "www", "web", "sites", "websites", "html"] },
  { icon: Code, keys: ["code", "dev", "developer", "development", "projects", "project", "src", "source", "repos", "repo", "git", "build"] },
  { icon: Briefcase, keys: ["work", "job", "jobs", "business", "office", "clients", "client", "company"] },
  { icon: User, keys: ["personal", "me", "private", "profile"] },
  { icon: Camera, keys: ["screenshots", "screenshot", "screen", "captures", "capture", "shots"] },
  { icon: CloudArrowUp, keys: ["backup", "backups", "bak"] },
  { icon: Archive, keys: ["archive", "archives", "old", "zip", "compressed", "misc"] },
  { icon: Books, keys: ["books", "book", "ebooks", "ebook", "reading", "library", "novels"] },
  { icon: GameController, keys: ["games", "game", "gaming", "play", "saves"] },
  { icon: TextAa, keys: ["fonts", "font", "typefaces", "typeface", "typography"] },
  { icon: Palette, keys: ["design", "designs", "art", "graphics", "assets", "icons", "figma", "sketch", "mockups"] },
  { icon: NotePencil, keys: ["notes", "note", "memos", "memo", "journal", "diary", "drafts"] },
  { icon: Wallet, keys: ["finance", "money", "budget", "invoices", "invoice", "receipts", "receipt", "tax", "taxes", "banking", "bank", "expenses"] },
  { icon: AirplaneTilt, keys: ["travel", "trips", "trip", "vacation", "holiday", "flights"] },
  { icon: ChefHat, keys: ["recipes", "recipe", "food", "cooking", "kitchen", "meals"] },
  { icon: Heartbeat, keys: ["health", "medical", "fitness", "wellness", "gym"] },
  { icon: GraduationCap, keys: ["school", "study", "studies", "university", "college", "courses", "course", "education", "homework", "class", "classes", "lectures", "research", "thesis"] },
  { icon: Star, keys: ["favorites", "favourites", "favorite", "favourite", "starred", "important", "best", "highlights"] },
  { icon: UsersThree, keys: ["shared", "share", "team", "teams", "family", "group", "groups", "collab"] },
  { icon: Cloud, keys: ["cloud", "sync", "dropbox", "drive", "icloud"] },
  { icon: Database, keys: ["data", "database", "db", "datasets", "dataset", "sql", "exports"] },
  { icon: GearSix, keys: ["config", "configs", "settings", "setup", "system", "conf", "tools"] },
];

const LOOKUP = new Map<string, Icon>();
for (const rule of RULES) for (const key of rule.keys) LOOKUP.set(key, rule.icon);

function normalize(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Pick a glyph for a folder by name: exact normalized match, then any contained
 * word, then a singular form (strip a trailing "s"). Returns null when nothing
 * matches (caller falls back to the initial letter).
 */
export function getFolderIcon(name: string): Icon | null {
  const norm = normalize(name);
  if (!norm) return null;
  if (LOOKUP.has(norm)) return LOOKUP.get(norm)!;
  const words = norm.split(" ");
  for (const w of words) if (LOOKUP.has(w)) return LOOKUP.get(w)!;
  for (const w of words) {
    if (w.endsWith("s") && LOOKUP.has(w.slice(0, -1))) return LOOKUP.get(w.slice(0, -1))!;
  }
  return null;
}

/** Uppercased first alphanumeric character of the name, for the letter fallback. */
export function getFolderInitial(name: string): string {
  const m = name.trim().match(/[a-z0-9]/i);
  return m ? m[0].toUpperCase() : "#";
}
