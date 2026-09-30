"use client";

import { forwardRef, type SVGProps } from "react";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  AlertCircle as AlertCircleData,
  AlertTriangle as AlertTriangleData,
  Archive as ArchiveData,
  ArrowDown as ArrowDownData,
  ArrowLeft as ArrowLeftData,
  ArrowRight as ArrowRightData,
  ArrowUp as ArrowUpData,
  ArrowUpDown as ArrowUpDownData,
  ArrowUpRight01Icon as ArrowUpRight01IconData,
  BarChart as BarChartData,
  Bell as BellData,
  BellOff as BellOffData,
  BookOpen01Icon as BookOpen01IconData,
  Box as BoxData,
  Calendar03Icon as Calendar03IconData,
  Check as CheckData,
  CheckCircle as CheckCircleData,
  CheckSquare as CheckSquareData,
  ChevronDown as ChevronDownData,
  ChevronLeft as ChevronLeftData,
  ChevronRight as ChevronRightData,
  ChevronUp as ChevronUpData,
  Clock as ClockData,
  Cloud as CloudData,
  CloudUpload as CloudUploadData,
  Code as CodeData,
  Cog as CogData,
  Copy as CopyData,
  Cpu as CpuData,
  Crown as CrownData,
  DashboardSpeed01Icon as DashboardSpeed01IconData,
  Database as DatabaseData,
  Download as DownloadData,
  Edit as EditData,
  ExternalLink as ExternalLinkData,
  Eye as EyeData,
  File as FileData,
  FileText as FileTextData,
  FileUploadIcon as FileUploadIconData,
  FilterIcon as FilterIconData,
  FingerPrintIcon as FingerPrintIconData,
  Folder as FolderData,
  FolderAddIcon as FolderAddIconData,
  FolderOpen as FolderOpenData,
  GitBranch as GitBranchData,
  GitCommitIcon as GitCommitIconData,
  Github as GithubData,
  Globe as GlobeData,
  GridTableIcon as GridTableIconData,
  HardDrive as HardDriveData,
  Heart as HeartData,
  Home as HomeData,
  Image as ImageData,
  Infinity as InfinityData,
  Info as InfoData,
  Key as KeyData,
  Layers as LayersData,
  LayoutGrid as LayoutGridData,
  Link2 as Link2Data,
  LoaderCircle as LoaderCircleData,
  Location01Icon as Location01IconData,
  Lock as LockData,
  LogIn as LogInData,
  LogOut as LogOutData,
  Mail as MailData,
  Maximize01Icon as Maximize01IconData,
  Menu as MenuData,
  MessageSquare as MessageSquareData,
  Minimize01Icon as Minimize01IconData,
  MinusSignIcon as MinusSignIconData,
  Monitor as MonitorData,
  MonitorSmartphone as MonitorSmartphoneData,
  Moon as MoonData,
  MoreHorizontal as MoreHorizontalData,
  Music as MusicData,
  PaintBrush01Icon as PaintBrush01IconData,
  PanelLeft as PanelLeftData,
  PanelLeftClose as PanelLeftCloseData,
  Pause as PauseData,
  Play as PlayData,
  Plus as PlusData,
  QuoteDownIcon as QuoteDownIconData,
  RefreshCcw as RefreshCcwData,
  RefreshCw as RefreshCwData,
  Rocket as RocketData,
  RotateCcw as RotateCcwData,
  RotateClockwiseIcon as RotateClockwiseIconData,
  Search as SearchData,
  Send as SendData,
  Server as ServerData,
  Settings as SettingsData,
  Share01Icon as Share01IconData,
  Shield as ShieldData,
  ShieldAlert as ShieldAlertData,
  ShieldCheck as ShieldCheckData,
  SkipForward as SkipForwardData,
  Smartphone as SmartphoneData,
  Sparkles as SparklesData,
  Square as SquareData,
  Star as StarData,
  Stop as StopData,
  Sun as SunData,
  Table as TableData,
  Terminal as TerminalData,
  Trash2 as Trash2Data,
  TrendingDown as TrendingDownData,
  TrendingUp as TrendingUpData,
  Unlock as UnlockData,
  Upload as UploadData,
  User as UserData,
  UserAdd01Icon as UserAdd01IconData,
  Users as UsersData,
  Video as VideoData,
  ViewOffIcon as ViewOffIconData,
  Volume2 as Volume2Data,
  Wand as WandData,
  Wifi as WifiData,
  X as XData,
  XCircle as XCircleData,
  Zap as ZapData,
  ZoomInAreaIcon as ZoomInAreaIconData,
  ZoomOutAreaIcon as ZoomOutAreaIconData,
} from "@hugeicons/core-free-icons";

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
  strokeWidth?: number;
  /** Active-state variant (mobile nav): slightly heavier stroke, mirroring the
   *  custom nav-icons' `filled` contract. Consumed HERE: it must never spread
   *  onto the <svg> element (React warns on non-boolean DOM attributes). */
  filled?: boolean;
};

function makeIcon(iconData: IconSvgElement, displayName: string) {
  const Icon = forwardRef<SVGSVGElement, IconProps>(
    ({ size = 24, className, strokeWidth = 1.5, filled, ...props }, ref) => (
      <HugeiconsIcon
        ref={ref}
        icon={iconData}
        size={typeof size === "string" ? parseInt(size, 10) : size}
        strokeWidth={filled ? Math.max(strokeWidth, 1.8) : strokeWidth}
        className={className}
        {...props}
      />
    ),
  );
  Icon.displayName = displayName;
  return Icon;
}

export const Shield = makeIcon(ShieldData, "Shield");
export const Lock = makeIcon(LockData, "Lock");
export const Unlock = makeIcon(UnlockData, "Unlock");
export const Upload = makeIcon(UploadData, "Upload");
export const FileUpload = makeIcon(FileUploadIconData, "FileUploadIcon");
export const Download = makeIcon(DownloadData, "Download");
export const Calendar = makeIcon(Calendar03IconData, "Calendar");
export const Bell = makeIcon(BellData, "Bell");
export const BellOff = makeIcon(BellOffData, "BellOff");
export const Check = makeIcon(CheckData, "Check");
export const CheckCircle2 = makeIcon(CheckCircleData, "CheckCircle");
export const X = makeIcon(XData, "X");
export const ChevronDown = makeIcon(ChevronDownData, "ChevronDown");
export const Filter = makeIcon(FilterIconData, "Filter");
export const ChevronLeft = makeIcon(ChevronLeftData, "ChevronLeft");
export const ChevronRight = makeIcon(ChevronRightData, "ChevronRight");
export const ChevronUp = makeIcon(ChevronUpData, "ChevronUp");
export const Eye = makeIcon(EyeData, "Eye");
export const File = makeIcon(FileData, "File");
export const FileText = makeIcon(FileTextData, "FileText");
export const Folder = makeIcon(FolderData, "Folder");
export const FolderOpen = makeIcon(FolderOpenData, "FolderOpen");
export const FolderAdd = makeIcon(FolderAddIconData, "FolderAddIcon");
export const Edit = makeIcon(EditData, "Edit");
export const Trash2 = makeIcon(Trash2Data, "Trash2");
export const Star = makeIcon(StarData, "Star");
export const Heart = makeIcon(HeartData, "Heart");
export const Home = makeIcon(HomeData, "Home");
export const Settings = makeIcon(SettingsData, "Settings");
export const Sun = makeIcon(SunData, "Sun");
export const Moon = makeIcon(MoonData, "Moon");
export const Menu = makeIcon(MenuData, "Menu");
export const Plus = makeIcon(PlusData, "Plus");
export const Mail = makeIcon(MailData, "Mail");
export const Cloud = makeIcon(CloudData, "Cloud");
export const Database = makeIcon(DatabaseData, "Database");
export const Globe = makeIcon(GlobeData, "Globe");
export const Key = makeIcon(KeyData, "Key");
export const AlertCircle = makeIcon(AlertCircleData, "AlertCircle");
export const AlertTriangle = makeIcon(AlertTriangleData, "AlertTriangle");
export const Info = makeIcon(InfoData, "Info");
export const User = makeIcon(UserData, "User");
export const Users = makeIcon(UsersData, "Users");
export const Clock = makeIcon(ClockData, "Clock");
export const Code = makeIcon(CodeData, "Code");
export const Link2 = makeIcon(Link2Data, "Link2");
export const Github = makeIcon(GithubData, "Github");
export const GitBranch = makeIcon(GitBranchData, "GitBranch");
export const Loader2 = makeIcon(LoaderCircleData, "LoaderCircle");
export const Infinity = makeIcon(InfinityData, "Infinity");
export const Sparkles = makeIcon(SparklesData, "Sparkles");
export const Crown = makeIcon(CrownData, "Crown");
export const Zap = makeIcon(ZapData, "Zap");
export const Wand2 = makeIcon(WandData, "Wand");
export const RefreshCcw = makeIcon(RefreshCcwData, "RefreshCcw");
export const RotateCcw = makeIcon(RotateCcwData, "RotateCcw");
export const Video = makeIcon(VideoData, "Video");
export const Music = makeIcon(MusicData, "Music");
export const Image = makeIcon(ImageData, "Image");
export const Archive = makeIcon(ArchiveData, "Archive");
export const Layers = makeIcon(LayersData, "Layers");
export const HardDrive = makeIcon(HardDriveData, "HardDrive");
export const Gauge = makeIcon(DashboardSpeed01IconData, "DashboardSpeed01Icon");
export const TrendingDown = makeIcon(TrendingDownData, "TrendingDown");
export const BarChart3 = makeIcon(BarChartData, "BarChart");
export const MessageSquare = makeIcon(MessageSquareData, "MessageSquare");
export const Send = makeIcon(SendData, "Send");
export const ArrowLeft = makeIcon(ArrowLeftData, "ArrowLeft");
export const ArrowRight = makeIcon(ArrowRightData, "ArrowRight");
export const ArrowUpRight = makeIcon(ArrowUpRight01IconData, "ArrowUpRight01Icon");
export const MapPin = makeIcon(Location01IconData, "Location01Icon");
export const ShieldAlert = makeIcon(ShieldAlertData, "ShieldAlert");
export const ShieldCheck = makeIcon(ShieldCheckData, "ShieldCheck");
export const LogIn = makeIcon(LogInData, "LogIn");
export const LogOut = makeIcon(LogOutData, "LogOut");
export const XCircle = makeIcon(XCircleData, "XCircle");
export const Cog = makeIcon(CogData, "Cog");
export const PanelLeft = makeIcon(PanelLeftData, "PanelLeft");
export const PanelLeftClose = makeIcon(PanelLeftCloseData, "PanelLeftClose");
export const ExternalLink = makeIcon(ExternalLinkData, "ExternalLink");
export const Copy = makeIcon(CopyData, "Copy");
export const Table = makeIcon(TableData, "Table");
export const Activity = makeIcon(TrendingUpData, "TrendingUp");
export const UserPlus = makeIcon(UserAdd01IconData, "UserAdd01Icon");
export const Square = makeIcon(SquareData, "Square");
export const CheckSquare = makeIcon(CheckSquareData, "CheckSquare");
export const ArrowDown = makeIcon(ArrowDownData, "ArrowDown");
export const ArrowUp = makeIcon(ArrowUpData, "ArrowUp");
export const ArrowUpDown = makeIcon(ArrowUpDownData, "ArrowUpDown");
export const Box = makeIcon(BoxData, "Box");
export const Cpu = makeIcon(CpuData, "Cpu");
export const LayoutGrid = makeIcon(LayoutGridData, "LayoutGrid");
export const Monitor = makeIcon(MonitorData, "Monitor");
export const MonitorSmartphone = makeIcon(MonitorSmartphoneData, "MonitorSmartphone");
export const MoreHorizontal = makeIcon(MoreHorizontalData, "MoreHorizontal");
export const Pause = makeIcon(PauseData, "Pause");
export const Play = makeIcon(PlayData, "Play");
export const RefreshCw = makeIcon(RefreshCwData, "RefreshCw");
export const Rocket = makeIcon(RocketData, "Rocket");
export const Search = makeIcon(SearchData, "Search");
export const SkipForward = makeIcon(SkipForwardData, "SkipForward");
export const StopCircle = makeIcon(StopData, "Stop");
export const TableProperties = makeIcon(GridTableIconData, "GridTableIcon");
export const UploadCloud = makeIcon(CloudUploadData, "CloudUpload");
export const Volume2 = makeIcon(Volume2Data, "Volume2");
export const Terminal = makeIcon(TerminalData, "Terminal");
export const Smartphone = makeIcon(SmartphoneData, "Smartphone");
export const Share2 = makeIcon(Share01IconData, "Share01Icon");
export const Server = makeIcon(ServerData, "Server");
export const Wifi = makeIcon(WifiData, "Wifi");
export const PaintBrush = makeIcon(PaintBrush01IconData, "PaintBrush01Icon");
export const Fingerprint = makeIcon(FingerPrintIconData, "FingerPrintIcon");
export const GitCommit = makeIcon(GitCommitIconData, "GitCommit");
export const ZoomIn = makeIcon(ZoomInAreaIconData, "ZoomIn");
export const ZoomOut = makeIcon(ZoomOutAreaIconData, "ZoomOut");
export const Minus = makeIcon(MinusSignIconData, "Minus");
export const Maximize = makeIcon(Maximize01IconData, "Maximize");
export const Minimize = makeIcon(Minimize01IconData, "Minimize");
export const RotateCw = makeIcon(RotateClockwiseIconData, "RotateCw");
export const BookOpen = makeIcon(BookOpen01IconData, "BookOpen");
export const Quote = makeIcon(QuoteDownIconData, "Quote");
export const EyeOff = makeIcon(ViewOffIconData, "EyeOff");
