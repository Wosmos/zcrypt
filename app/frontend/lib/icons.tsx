"use client";

import { forwardRef, type ComponentType, type SVGProps } from "react";
import {
  IconContext,
  type Icon as PhosphorIcon,
  type IconProps as PhosphorProps,
  type IconWeight,
  Archive as PhArchive,
  ArrowClockwise as PhArrowClockwise,
  ArrowCounterClockwise as PhArrowCounterClockwise,
  ArrowDown as PhArrowDown,
  ArrowLeft as PhArrowLeft,
  ArrowRight as PhArrowRight,
  ArrowSquareOut as PhArrowSquareOut,
  ArrowUp as PhArrowUp,
  ArrowUpRight as PhArrowUpRight,
  ArrowsClockwise as PhArrowsClockwise,
  ArrowsDownUp as PhArrowsDownUp,
  ArrowsIn as PhArrowsIn,
  ArrowsOut as PhArrowsOut,
  Bell as PhBell,
  BellSlash as PhBellSlash,
  BookOpen as PhBookOpen,
  CalendarBlank as PhCalendarBlank,
  CaretDown as PhCaretDown,
  CaretLeft as PhCaretLeft,
  CaretRight as PhCaretRight,
  CaretUp as PhCaretUp,
  CellSignalLow as PhCellSignalLow,
  ChartBar as PhChartBar,
  ChartLineUp as PhChartLineUp,
  ChatCircle as PhChatCircle,
  Check as PhCheck,
  CheckCircle as PhCheckCircle,
  CheckSquare as PhCheckSquare,
  CircleNotch as PhCircleNotch,
  Clock as PhClock,
  Cloud as PhCloud,
  CloudArrowUp as PhCloudArrowUp,
  CloudSlash as PhCloudSlash,
  Code as PhCode,
  Columns as PhColumns,
  Compass as PhCompass,
  Copy as PhCopy,
  Cpu as PhCpu,
  Crown as PhCrown,
  Cube as PhCube,
  Database as PhDatabase,
  DeviceMobile as PhDeviceMobile,
  Devices as PhDevices,
  DotsThree as PhDotsThree,
  DownloadSimple as PhDownloadSimple,
  Envelope as PhEnvelope,
  Eye as PhEye,
  EyeSlash as PhEyeSlash,
  File as PhFile,
  FileArrowUp as PhFileArrowUp,
  FileText as PhFileText,
  Fingerprint as PhFingerprint,
  Folder as PhFolder,
  FolderOpen as PhFolderOpen,
  FolderPlus as PhFolderPlus,
  Funnel as PhFunnel,
  Gauge as PhGauge,
  Gear as PhGear,
  GearSix as PhGearSix,
  GitBranch as PhGitBranch,
  GitCommit as PhGitCommit,
  GithubLogo as PhGithubLogo,
  Globe as PhGlobe,
  HardDrive as PhHardDrive,
  HardDrives as PhHardDrives,
  Heart as PhHeart,
  House as PhHouse,
  Image as PhImage,
  Infinity as PhInfinity,
  Info as PhInfo,
  Key as PhKey,
  Keyboard as PhKeyboard,
  Lightning as PhLightning,
  Link as PhLink,
  List as PhList,
  Lock as PhLock,
  LockOpen as PhLockOpen,
  MagicWand as PhMagicWand,
  MagnifyingGlass as PhMagnifyingGlass,
  MagnifyingGlassMinus as PhMagnifyingGlassMinus,
  MagnifyingGlassPlus as PhMagnifyingGlassPlus,
  MapPin as PhMapPin,
  Minus as PhMinus,
  Monitor as PhMonitor,
  Moon as PhMoon,
  MusicNote as PhMusicNote,
  PaintBrush as PhPaintBrush,
  PaperPlaneTilt as PhPaperPlaneTilt,
  Pause as PhPause,
  PencilSimple as PhPencilSimple,
  Play as PhPlay,
  Plus as PhPlus,
  Quotes as PhQuotes,
  Rocket as PhRocket,
  Rows as PhRows,
  ShareNetwork as PhShareNetwork,
  Shield as PhShield,
  ShieldCheck as PhShieldCheck,
  ShieldWarning as PhShieldWarning,
  SidebarSimple as PhSidebarSimple,
  SignIn as PhSignIn,
  SignOut as PhSignOut,
  SkipForward as PhSkipForward,
  Sparkle as PhSparkle,
  SpeakerHigh as PhSpeakerHigh,
  Square as PhSquare,
  SquaresFour as PhSquaresFour,
  Stack as PhStack,
  Star as PhStar,
  StopCircle as PhStopCircle,
  Sun as PhSun,
  Table as PhTable,
  Terminal as PhTerminal,
  Translate as PhTranslate,
  Trash as PhTrash,
  TrendDown as PhTrendDown,
  UploadSimple as PhUploadSimple,
  User as PhUser,
  UserPlus as PhUserPlus,
  Users as PhUsers,
  VideoCamera as PhVideoCamera,
  Warning as PhWarning,
  WarningCircle as PhWarningCircle,
  WifiHigh as PhWifiHigh,
  WifiSlash as PhWifiSlash,
  Wrench as PhWrench,
  X as PhX,
  XCircle as PhXCircle,
} from "@phosphor-icons/react";

export type IconProps = Omit<SVGProps<SVGSVGElement>, "ref"> & {
  size?: number | string;
  strokeWidth?: number;
  weight?: IconWeight;
  filled?: boolean;
};

export const IconWeightContext = IconContext;
export const boldIcon: IconWeight = "bold";

function makeIcon(Glyph: PhosphorIcon, displayName: string) {
  const Icon = forwardRef<SVGSVGElement, IconProps>(
    ({ size = 24, strokeWidth: _strokeWidth, filled, weight, ...props }, ref) => (
      <Glyph
        ref={ref as PhosphorProps["ref"]}
        size={typeof size === "string" ? parseInt(size, 10) : size}
        {...(filled ? { weight: "fill" as const } : weight ? { weight } : {})}
        {...(props as PhosphorProps)}
      />
    ),
  );
  Icon.displayName = displayName;
  return Icon;
}

export type IconComponent = ComponentType<IconProps>;

export const Shield = makeIcon(PhShield, "Shield");
export const Lock = makeIcon(PhLock, "Lock");
export const Keyboard = makeIcon(PhKeyboard, "Keyboard");
export const Unlock = makeIcon(PhLockOpen, "Unlock");
export const Upload = makeIcon(PhUploadSimple, "Upload");
export const FileUpload = makeIcon(PhFileArrowUp, "FileUpload");
export const Download = makeIcon(PhDownloadSimple, "Download");
export const Calendar = makeIcon(PhCalendarBlank, "Calendar");
export const Bell = makeIcon(PhBell, "Bell");
export const BellOff = makeIcon(PhBellSlash, "BellOff");
export const Check = makeIcon(PhCheck, "Check");
export const CheckCircle2 = makeIcon(PhCheckCircle, "CheckCircle2");
export const X = makeIcon(PhX, "X");
export const ChevronDown = makeIcon(PhCaretDown, "ChevronDown");
export const Filter = makeIcon(PhFunnel, "Filter");
export const ChevronLeft = makeIcon(PhCaretLeft, "ChevronLeft");
export const ChevronRight = makeIcon(PhCaretRight, "ChevronRight");
export const ChevronUp = makeIcon(PhCaretUp, "ChevronUp");
export const Eye = makeIcon(PhEye, "Eye");
export const File = makeIcon(PhFile, "File");
export const FileText = makeIcon(PhFileText, "FileText");
export const Folder = makeIcon(PhFolder, "Folder");
export const FolderOpen = makeIcon(PhFolderOpen, "FolderOpen");
export const FolderAdd = makeIcon(PhFolderPlus, "FolderAdd");
export const Edit = makeIcon(PhPencilSimple, "Edit");
export const Trash2 = makeIcon(PhTrash, "Trash2");
export const Star = makeIcon(PhStar, "Star");
export const Compass = makeIcon(PhCompass, "Compass");
export const Heart = makeIcon(PhHeart, "Heart");
export const Home = makeIcon(PhHouse, "Home");
export const Settings = makeIcon(PhGear, "Settings");
export const Sun = makeIcon(PhSun, "Sun");
export const Moon = makeIcon(PhMoon, "Moon");
export const Menu = makeIcon(PhList, "Menu");
export const Plus = makeIcon(PhPlus, "Plus");
export const Mail = makeIcon(PhEnvelope, "Mail");
export const Cloud = makeIcon(PhCloud, "Cloud");
export const Database = makeIcon(PhDatabase, "Database");
export const Globe = makeIcon(PhGlobe, "Globe");
export const Languages = makeIcon(PhTranslate, "Languages");
export const Key = makeIcon(PhKey, "Key");
export const AlertCircle = makeIcon(PhWarningCircle, "AlertCircle");
export const AlertTriangle = makeIcon(PhWarning, "AlertTriangle");
export const Info = makeIcon(PhInfo, "Info");
export const User = makeIcon(PhUser, "User");
export const Users = makeIcon(PhUsers, "Users");
export const Clock = makeIcon(PhClock, "Clock");
export const Code = makeIcon(PhCode, "Code");
export const Link2 = makeIcon(PhLink, "Link2");
export const Github = makeIcon(PhGithubLogo, "Github");
export const GitBranch = makeIcon(PhGitBranch, "GitBranch");
export const Loader2 = makeIcon(PhCircleNotch, "Loader2");
const InfinityIcon = makeIcon(PhInfinity, "Infinity");
export { InfinityIcon as Infinity };
export const Sparkles = makeIcon(PhSparkle, "Sparkles");
export const Crown = makeIcon(PhCrown, "Crown");
export const Zap = makeIcon(PhLightning, "Zap");
export const Wand2 = makeIcon(PhMagicWand, "Wand2");
export const RefreshCcw = makeIcon(PhArrowsClockwise, "RefreshCcw");
export const RotateCcw = makeIcon(PhArrowCounterClockwise, "RotateCcw");
export const Video = makeIcon(PhVideoCamera, "Video");
export const Music = makeIcon(PhMusicNote, "Music");
export const Image = makeIcon(PhImage, "Image");
export const Archive = makeIcon(PhArchive, "Archive");
export const Layers = makeIcon(PhStack, "Layers");
export const HardDrive = makeIcon(PhHardDrive, "HardDrive");
export const Gauge = makeIcon(PhGauge, "Gauge");
export const TrendingDown = makeIcon(PhTrendDown, "TrendingDown");
export const BarChart3 = makeIcon(PhChartBar, "BarChart3");
export const MessageSquare = makeIcon(PhChatCircle, "MessageSquare");
export const Send = makeIcon(PhPaperPlaneTilt, "Send");
export const ArrowLeft = makeIcon(PhArrowLeft, "ArrowLeft");
export const ArrowRight = makeIcon(PhArrowRight, "ArrowRight");
export const ArrowUpRight = makeIcon(PhArrowUpRight, "ArrowUpRight");
export const MapPin = makeIcon(PhMapPin, "MapPin");
export const ShieldAlert = makeIcon(PhShieldWarning, "ShieldAlert");
export const ShieldCheck = makeIcon(PhShieldCheck, "ShieldCheck");
export const LogIn = makeIcon(PhSignIn, "LogIn");
export const LogOut = makeIcon(PhSignOut, "LogOut");
export const XCircle = makeIcon(PhXCircle, "XCircle");
export const Cog = makeIcon(PhGearSix, "Cog");
export const PanelLeft = makeIcon(PhSidebarSimple, "PanelLeft");
export const PanelLeftClose = makeIcon(PhSidebarSimple, "PanelLeftClose");
export const ExternalLink = makeIcon(PhArrowSquareOut, "ExternalLink");
export const Copy = makeIcon(PhCopy, "Copy");
export const Table = makeIcon(PhTable, "Table");
export const Activity = makeIcon(PhChartLineUp, "Activity");
export const UserPlus = makeIcon(PhUserPlus, "UserPlus");
export const Square = makeIcon(PhSquare, "Square");
export const CheckSquare = makeIcon(PhCheckSquare, "CheckSquare");
export const ArrowDown = makeIcon(PhArrowDown, "ArrowDown");
export const ArrowUp = makeIcon(PhArrowUp, "ArrowUp");
export const ArrowUpDown = makeIcon(PhArrowsDownUp, "ArrowUpDown");
export const Box = makeIcon(PhCube, "Box");
export const Cpu = makeIcon(PhCpu, "Cpu");
export const LayoutGrid = makeIcon(PhSquaresFour, "LayoutGrid");
export const GridView = makeIcon(PhSquaresFour, "GridView");
export const ListView = makeIcon(PhRows, "ListView");
export const Columns = makeIcon(PhColumns, "Columns");
export const Monitor = makeIcon(PhMonitor, "Monitor");
export const MonitorSmartphone = makeIcon(PhDevices, "MonitorSmartphone");
export const MoreHorizontal = makeIcon(PhDotsThree, "MoreHorizontal");
export const Pause = makeIcon(PhPause, "Pause");
export const Play = makeIcon(PhPlay, "Play");
export const RefreshCw = makeIcon(PhArrowsClockwise, "RefreshCw");
export const Rocket = makeIcon(PhRocket, "Rocket");
export const Search = makeIcon(PhMagnifyingGlass, "Search");
export const SkipForward = makeIcon(PhSkipForward, "SkipForward");
export const StopCircle = makeIcon(PhStopCircle, "StopCircle");
export const TableProperties = makeIcon(PhTable, "TableProperties");
export const UploadCloud = makeIcon(PhCloudArrowUp, "UploadCloud");
export const Volume2 = makeIcon(PhSpeakerHigh, "Volume2");
export const Terminal = makeIcon(PhTerminal, "Terminal");
export const Smartphone = makeIcon(PhDeviceMobile, "Smartphone");
export const Share2 = makeIcon(PhShareNetwork, "Share2");
export const Server = makeIcon(PhHardDrives, "Server");
export const Wifi = makeIcon(PhWifiHigh, "Wifi");
export const WifiOff = makeIcon(PhWifiSlash, "WifiOff");
export const CloudOff = makeIcon(PhCloudSlash, "CloudOff");
export const Wrench = makeIcon(PhWrench, "Wrench");
export const SignalLow = makeIcon(PhCellSignalLow, "SignalLow");
export const PaintBrush = makeIcon(PhPaintBrush, "PaintBrush");
export const Fingerprint = makeIcon(PhFingerprint, "Fingerprint");
export const GitCommit = makeIcon(PhGitCommit, "GitCommit");
export const ZoomIn = makeIcon(PhMagnifyingGlassPlus, "ZoomIn");
export const ZoomOut = makeIcon(PhMagnifyingGlassMinus, "ZoomOut");
export const Minus = makeIcon(PhMinus, "Minus");
export const Maximize = makeIcon(PhArrowsOut, "Maximize");
export const Minimize = makeIcon(PhArrowsIn, "Minimize");
export const RotateCw = makeIcon(PhArrowClockwise, "RotateCw");
export const BookOpen = makeIcon(PhBookOpen, "BookOpen");
export const Quote = makeIcon(PhQuotes, "Quote");
export const EyeOff = makeIcon(PhEyeSlash, "EyeOff");
