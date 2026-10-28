import { T } from "@/components/i18n/t";
import { FolderTile } from "@/components/files/tiles/tiles";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Folder,
  LayoutGrid,
  Link2,
  Lock,
  MoreHorizontal,
  Play,
  Search,
  Share2,
  TableProperties,
  Trash2,
  Users,
  X,
} from "@/lib/icons";
import { FileTypeIcon } from "@/components/marketing/landing/file-type-icon";
import { cn, getFileTypeInfo } from "@/lib/utils";

function FileIc({ name, className }: { name: string; className?: string }) {
  const info = getFileTypeInfo(name);
  return (
    <span className={cn("zc-fic", info.bg, className)}>
      <FileTypeIcon name={name} className={info.color} strokeWidth={1.6} />
    </span>
  );
}

const ROWS = [
  ["thesis-final-v9.docx", "2.4 MB", "38%", "ago5h"],
  ["savings.xlsx", "44 KB", "61%", "ago1d"],
  ["passport-scan.pdf", "1.8 MB", "9%", "ago2d"],
  ["wedding-video.mp4", "4.2 GB", "0%", "sep14"],
] as const;

const V = "site.home.bento.v";

export function DriveVignette() {
  return (
    <div className="zc-app zc-vd">
      <div className="zc-vd-bar">
        <span className="zc-vd-search">
          <Search strokeWidth={1.8} />
          <span>
            <T k={`${V}.search`} />
          </span>
          <kbd>/</kbd>
        </span>
        <span className="zc-vd-seg">
          <span>
            <LayoutGrid strokeWidth={1.8} />
          </span>
          <span className="on">
            <TableProperties strokeWidth={1.8} />
          </span>
        </span>
      </div>
      <div className="zc-panel zc-vd-list">
        <div className="zc-vd-head">
          <span className="zc-vd-ic" />
          <span className="zc-vd-n">
            <T k={`${V}.colName`} />
          </span>
          <span className="zc-vd-s">
            <T k={`${V}.colSize`} />
          </span>
          <span className="zc-vd-v">
            <T k={`${V}.colSaved`} />
          </span>
          <span className="zc-vd-m">
            <T k={`${V}.colModified`} />
          </span>
          <span className="zc-vd-c" />
        </div>
        <div className="zc-vd-row">
          <span className="zc-fic zc-fic-fold">
            <Folder strokeWidth={1.6} />
            <span className="zc-fic-badge">
              <Lock strokeWidth={2.25} />
            </span>
          </span>
          <span className="zc-vd-n">
            <T k={`${V}.folderTaxes`} />
          </span>
          <span className="zc-vd-s">-</span>
          <span className="zc-vd-v">-</span>
          <span className="zc-vd-m">
            <T k={`${V}.ago3d`} />
          </span>
          <span className="zc-vd-c">
            <ChevronRight strokeWidth={1.8} />
          </span>
        </div>
        {ROWS.map(([name, size, saved, mod], i) => (
          <div key={name} className={cn("zc-vd-row", i === 1 && "is-hover")}>
            <FileIc name={name} />
            <span className="zc-vd-n">{name}</span>
            <span className="zc-vd-s">{size}</span>
            <span className={cn("zc-vd-v", saved !== "0%" && "pos")}>{saved}</span>
            <span className="zc-vd-m">
              <T k={`${V}.${mod}`} />
            </span>
            <span className="zc-vd-c">
              <MoreHorizontal strokeWidth={1.8} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LockedFolder() {
  return (
    <span className="zc-vl-fold">
      <FolderTile locked className="zc-vl-svg" />
      <span className="zc-vl-name">
        <T k={`${V}.folderTaxes`} />
      </span>
    </span>
  );
}

export function LockVignette() {
  return (
    <div className="zc-app zc-vl">
      <div className="zc-v-full zc-vl-full">
        <LockedFolder />
        <div className="zc-panel zc-vl-dlg">
          <div className="zc-vl-h">
            <span className="zc-vl-ic">
              <Lock strokeWidth={1.8} />
            </span>
            <span className="zc-vl-t">
              <b>
                <T k={`${V}.unlockTitle`} />
              </b>
              <span>
                <T k={`${V}.unlockHint`} />
              </span>
            </span>
          </div>
          <span className="zc-field zc-field-on">
            ••••••••
            <i className="zc-caret" />
          </span>
          <span className="zc-vl-acts">
            <span className="zc-btn2">
              <T k={`${V}.cancel`} />
            </span>
            <span className="zc-btn1">
              <T k={`${V}.unlock`} />
            </span>
          </span>
        </div>
      </div>
      <div className="zc-v-compact">
        <LockedFolder />
      </div>
    </div>
  );
}

export function ShareVignette() {
  return (
    <div className="zc-app zc-vs">
      <div className="zc-v-full zc-panel zc-vs-card">
        <div className="zc-vs-h">
          <span className="zc-vs-ic">
            <Share2 strokeWidth={1.8} />
          </span>
          <span className="zc-vs-t">
            <b>
              <T k={`${V}.shareTitle`} />
            </b>
            <span>tax-return-2025.pdf (880 KB)</span>
          </span>
          <X className="zc-vs-x" strokeWidth={1.8} />
        </div>
        <div className="zc-vs-b">
          <span className="zc-cbx">
            <span className="zc-cb">
              <Check strokeWidth={2.6} />
            </span>
            <T k={`${V}.passwordProtect`} />
          </span>
          <span className="zc-field">
            <Lock strokeWidth={1.8} />
            ••••••
          </span>
          <span className="zc-vs-two">
            <span className="zc-vs-sel">
              <small>
                <T k={`${V}.linkExpiry`} />
              </small>
              <span className="zc-sel">
                <T k={`${V}.days7`} />
                <ChevronDown strokeWidth={1.8} />
              </span>
            </span>
            <span className="zc-vs-sel">
              <small>
                <T k={`${V}.downloadLimit`} />
              </small>
              <span className="zc-sel">
                3
                <ChevronDown strokeWidth={1.8} />
              </span>
            </span>
          </span>
        </div>
      </div>
      <div className="zc-v-compact zc-vs-mini">
        <span className="zc-field">
          <Lock strokeWidth={1.8} />
          ••••••
        </span>
        <span className="zc-link">
          <Link2 strokeWidth={1.8} />
          <span>/s/k3f9x2</span>
          <Copy className="zc-link-copy" strokeWidth={1.8} />
        </span>
      </div>
    </div>
  );
}

function Burn() {
  return (
    <span className="zc-burn">
      <span className="zc-mini-switch">
        <i />
      </span>
      <span className="zc-burn-t">
        <b>
          <T k={`${V}.burnTitle`} />
        </b>
        <span>
          <T k={`${V}.burnHint`} />
        </span>
      </span>
    </span>
  );
}

export function SendVignette() {
  return (
    <div className="zc-app zc-vn">
      <div className="zc-v-full zc-panel zc-vn-card">
        <span className="zc-vn-file">
          <FileIc name="lease-signed.pdf" />
          <span className="zc-vn-ft">
            <b>lease-signed.pdf</b>
            <span>310 KB</span>
          </span>
          <X className="zc-vn-x" strokeWidth={1.8} />
        </span>
        <span className="zc-vn-lab">
          <Clock strokeWidth={1.8} />
          <T k={`${V}.expiresAfter`} />
        </span>
        <span className="zc-vn-exp">
          <span>
            <T k={`${V}.hour1`} />
          </span>
          <span className="on">
            <T k={`${V}.hours24`} />
          </span>
          <span>
            <T k={`${V}.days7`} />
          </span>
        </span>
        <Burn />
      </div>
      <div className="zc-v-compact zc-vn-mini">
        <Burn />
      </div>
    </div>
  );
}

const SPACES = [
  { id: "family", role: false },
  { id: "house", role: true },
] as const;

function Avatars({ people, more }: { people: readonly string[]; more?: number }) {
  return (
    <span className="zc-avs">
      {people.map((p, i) => (
        <span key={`${p}-${i}`} className={`zc-av zc-av-${i}`}>
          {p}
        </span>
      ))}
      {more ? <span className="zc-av zc-av-more">+{more}</span> : null}
    </span>
  );
}

export function SpacesVignette() {
  return (
    <div className="zc-app zc-vp">
      <ul className="zc-v-full zc-panel zc-vp-list">
        {SPACES.map((s) => (
          <li key={s.id}>
            <span className="zc-vp-ic">
              <Users strokeWidth={1.8} />
            </span>
            <span className="zc-vp-t">
              <b>
                <T k={`${V}.spaces.${s.id}.name`} />
              </b>
              <span>
                <T k={`${V}.spaces.${s.id}.meta`} />
              </span>
            </span>
            {s.role ? (
              <span className="zc-badge">
                <T k={`${V}.editor`} />
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="zc-v-compact zc-vp-mini">
        <Avatars people={["M", "A", "S", "J"]} more={2} />
        <span className="zc-vp-cap">
          <T k={`${V}.spaces.family.name`} />
        </span>
      </div>
    </div>
  );
}

export function ResumeVignette() {
  return (
    <div className="zc-app zc-vr">
      <div className="zc-vr-card">
        <div className="zc-vr-h">
          <AlertTriangle strokeWidth={1.8} />
          <b>
            <T k={`${V}.unfinished`} />
          </b>
          <span>
            <T k={`${V}.resumeOrDiscard`} />
          </span>
          <ChevronDown className="zc-vr-chev" strokeWidth={1.8} />
        </div>
        <div className="zc-vr-row">
          <span className="zc-vr-m">
            <b>family-trip-2025.mov</b>
            <span className="zc-vr-meta">
              <span>2.3 GB</span>
              <i>·</i>
              <span className="zc-vr-plat">Telegram</span>
              <i>·</i>
              <span>62%</span>
              <i className="zc-vr-hide">·</i>
              <span className="zc-vr-amb zc-vr-hide">
                <T k={`${V}.expiresIn`} />
              </span>
            </span>
            <span className="zc-vr-bar">
              <i />
            </span>
          </span>
          <span className="zc-vr-res">
            <Play strokeWidth={2} />
            <T k={`${V}.resume`} />
          </span>
          <span className="zc-vr-dis">
            <Trash2 strokeWidth={1.8} />
          </span>
        </div>
      </div>
    </div>
  );
}
