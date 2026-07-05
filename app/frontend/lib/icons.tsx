"use client";

import { forwardRef, type SVGProps } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Shield as _Shield,
  Lock as _Lock,
  Unlock as _Unlock,
  Upload as _Upload,
  FileUploadIcon as _FileUpload,
  Download as _Download,
  Bell as _Bell,
  BellOff as _BellOff,
  Check as _Check,
  CheckCircle as _CheckCircle,
  X as _X,
  ChevronDown as _ChevronDown,
  ChevronLeft as _ChevronLeft,
  ChevronRight as _ChevronRight,
  Eye as _Eye,
  File as _File,
  FileText as _FileText,
  Folder as _Folder,
  FolderOpen as _FolderOpen,
  FolderAddIcon as _FolderAdd,
  Edit as _Edit,
  Trash as _Trash,
  Trash2 as _Trash2,
  Star as _Star,
  Heart as _Heart,
  Home as _Home,
  Settings as _Settings,
  Sun as _Sun,
  Moon as _Moon,
  Menu as _Menu,
  Plus as _Plus,
  Mail as _Mail,
  Cloud as _Cloud,
  Database as _Database,
  Globe as _Globe,
  Key as _Key,
  AlertCircle as _AlertCircle,
  AlertTriangle as _AlertTriangle,
  Info as _Info,
  User as _User,
  Users as _Users,
  Clock as _Clock,
  Code as _Code,
  Link as _Link,
  Link2 as _Link2,
  Github as _Github,
  GitBranch as _GitBranch,
  Loader as _Loader,
  LoaderCircle as _LoaderCircle,
  Infinity as _Infinity,
  Sparkles as _Sparkles,
  Crown as _Crown,
  Zap as _Zap,
  Wand as _Wand,
  RefreshCcw as _RefreshCcw,
  RotateCcw as _RotateCcw,
  Video as _Video,
  Music as _Music,
  Image as _Image,
  Archive as _Archive,
  Layers as _Layers,
  HardDrive as _HardDrive,
  DashboardSpeed01Icon as _DashboardSpeed,
  TrendingDown as _TrendingDown,
  TrendingUp as _TrendingUp,
  BarChart as _BarChart,
  MessageSquare as _MessageSquare,
  Send as _Send,
  ArrowLeft as _ArrowLeft,
  ArrowRight as _ArrowRight,
  ArrowUpRight01Icon as _ArrowUpRight,
  Location01Icon as _Location,
  ShieldAlert as _ShieldAlert,
  ShieldCheck as _ShieldCheck,
  LogIn as _LogIn,
  LogOut as _LogOut,
  XCircle as _XCircle,
  Cog as _Cog,
  PanelLeft as _PanelLeft,
  PanelLeftClose as _PanelLeftClose,
  ExternalLink as _ExternalLink,
  Copy as _Copy,
  UserAdd01Icon as _UserAdd,
  Square as _Square,
  CheckSquare as _CheckSquare,
  Table as _Table,
  ArrowDown as _ArrowDown,
  ArrowUp as _ArrowUp,
  ArrowUpDown as _ArrowUpDown,
  Bluetooth as _Bluetooth,
  Box as _Box,
  Cpu as _Cpu,
  LayoutGrid as _LayoutGrid,
  Monitor as _Monitor,
  MonitorSmartphone as _MonitorSmartphone,
  MoreHorizontal as _MoreHorizontal,
  Pause as _Pause,
  Play as _Play,
  RefreshCw as _RefreshCw,
  Rocket as _Rocket,
  Search as _Search,
  SkipForward as _SkipForward,
  Stop as _Stop,
  CloudUpload as _CloudUpload,
  Volume2 as _Volume2,
  GridTableIcon as _GridTable,
  Scissors as _Scissors,
  Handshake as _Handshake,
  Quote as _Quote,
  HelpCircleIcon as _HelpCircle,
  Terminal as _Terminal,
  Smartphone as _Smartphone,
  Share01Icon as _Share01,
  Server as _Server,
  Wifi as _Wifi,
  Briefcase01Icon as _Briefcase,
  Camera01Icon as _Camera,
  Book02Icon as _Book,
  GameController01Icon as _GameController,
  TextFontIcon as _TextFont,
  PaintBoardIcon as _PaintBoard,
  Note01Icon as _Note,
  Wallet01Icon as _Wallet,
  AirplaneTakeOff01Icon as _Airplane,
  ChefHatIcon as _ChefHat,
  MortarboardIcon as _Mortarboard,
} from "@hugeicons/core-free-icons";

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
  strokeWidth?: number;
};

function makeIcon(iconData: any, displayName: string) {
  const Icon = forwardRef<SVGSVGElement, IconProps>(
    ({ size = 24, className, strokeWidth = 1.5, ...props }, ref) => (
      <HugeiconsIcon
        ref={ref}
        icon={iconData}
        size={typeof size === "string" ? parseInt(size, 10) : size}
        strokeWidth={strokeWidth}
        className={className}
        {...props}
      />
    )
  );
  Icon.displayName = displayName;
  return Icon;
}

export const Shield = makeIcon(_Shield, "Shield");
export const Lock = makeIcon(_Lock, "Lock");
export const Unlock = makeIcon(_Unlock, "Unlock");
export const Upload = makeIcon(_Upload, "Upload");
export const FileUpload = makeIcon(_FileUpload, "FileUpload");
export const Download = makeIcon(_Download, "Download");
export const Bell = makeIcon(_Bell, "Bell");
export const BellOff = makeIcon(_BellOff, "BellOff");
export const Check = makeIcon(_Check, "Check");
export const CheckCircle2 = makeIcon(_CheckCircle, "CheckCircle2");
export const X = makeIcon(_X, "X");
export const ChevronDown = makeIcon(_ChevronDown, "ChevronDown");
export const ChevronLeft = makeIcon(_ChevronLeft, "ChevronLeft");
export const ChevronRight = makeIcon(_ChevronRight, "ChevronRight");
export const Eye = makeIcon(_Eye, "Eye");
export const File = makeIcon(_File, "File");
export const FileText = makeIcon(_FileText, "FileText");
export const Folder = makeIcon(_Folder, "Folder");
export const FolderOpen = makeIcon(_FolderOpen, "FolderOpen");
// Folder-glyph set (used by lib/folder-icons to mark folders by name).
export const CloudUpload = makeIcon(_CloudUpload, "CloudUpload");
export const Briefcase = makeIcon(_Briefcase, "Briefcase");
export const Camera = makeIcon(_Camera, "Camera");
export const Book = makeIcon(_Book, "Book");
export const GameController = makeIcon(_GameController, "GameController");
export const TextFont = makeIcon(_TextFont, "TextFont");
export const PaintBoard = makeIcon(_PaintBoard, "PaintBoard");
export const Note = makeIcon(_Note, "Note");
export const Wallet = makeIcon(_Wallet, "Wallet");
export const Airplane = makeIcon(_Airplane, "Airplane");
export const ChefHat = makeIcon(_ChefHat, "ChefHat");
export const Mortarboard = makeIcon(_Mortarboard, "Mortarboard");
export const FolderAdd = makeIcon(_FolderAdd, "FolderAdd");
export const Edit = makeIcon(_Edit, "Edit");
export const Trash2 = makeIcon(_Trash2, "Trash2");
export const Star = makeIcon(_Star, "Star");
export const Heart = makeIcon(_Heart, "Heart");
export const Home = makeIcon(_Home, "Home");
export const Settings = makeIcon(_Settings, "Settings");
export const Sun = makeIcon(_Sun, "Sun");
export const Moon = makeIcon(_Moon, "Moon");
export const Menu = makeIcon(_Menu, "Menu");
export const Plus = makeIcon(_Plus, "Plus");
export const Mail = makeIcon(_Mail, "Mail");
export const Cloud = makeIcon(_Cloud, "Cloud");
export const Database = makeIcon(_Database, "Database");
export const Globe = makeIcon(_Globe, "Globe");
export const Key = makeIcon(_Key, "Key");
export const AlertCircle = makeIcon(_AlertCircle, "AlertCircle");
export const AlertTriangle = makeIcon(_AlertTriangle, "AlertTriangle");
export const Info = makeIcon(_Info, "Info");
export const User = makeIcon(_User, "User");
export const Users = makeIcon(_Users, "Users");
export const Clock = makeIcon(_Clock, "Clock");
export const Code = makeIcon(_Code, "Code");
export const Link2 = makeIcon(_Link2, "Link2");
export const Github = makeIcon(_Github, "Github");
export const GitBranch = makeIcon(_GitBranch, "GitBranch");
export const Loader2 = makeIcon(_LoaderCircle, "Loader2");
export const Infinity = makeIcon(_Infinity, "Infinity");
export const Sparkles = makeIcon(_Sparkles, "Sparkles");
export const Crown = makeIcon(_Crown, "Crown");
export const Zap = makeIcon(_Zap, "Zap");
export const Wand2 = makeIcon(_Wand, "Wand2");
export const RefreshCcw = makeIcon(_RefreshCcw, "RefreshCcw");
export const RotateCcw = makeIcon(_RotateCcw, "RotateCcw");
export const Video = makeIcon(_Video, "Video");
export const Music = makeIcon(_Music, "Music");
export const Image = makeIcon(_Image, "Image");
export const Archive = makeIcon(_Archive, "Archive");
export const Layers = makeIcon(_Layers, "Layers");
export const HardDrive = makeIcon(_HardDrive, "HardDrive");
export const Gauge = makeIcon(_DashboardSpeed, "Gauge");
export const TrendingDown = makeIcon(_TrendingDown, "TrendingDown");
export const TrendingUp = makeIcon(_TrendingUp, "TrendingUp");
export const BarChart3 = makeIcon(_BarChart, "BarChart3");
export const MessageSquare = makeIcon(_MessageSquare, "MessageSquare");
export const Send = makeIcon(_Send, "Send");
export const ArrowLeft = makeIcon(_ArrowLeft, "ArrowLeft");
export const ArrowRight = makeIcon(_ArrowRight, "ArrowRight");
export const ArrowUpRight = makeIcon(_ArrowUpRight, "ArrowUpRight");
export const MapPin = makeIcon(_Location, "MapPin");
export const ShieldAlert = makeIcon(_ShieldAlert, "ShieldAlert");
export const ShieldCheck = makeIcon(_ShieldCheck, "ShieldCheck");
export const LogIn = makeIcon(_LogIn, "LogIn");
export const LogOut = makeIcon(_LogOut, "LogOut");
export const XCircle = makeIcon(_XCircle, "XCircle");
export const Cog = makeIcon(_Cog, "Cog");
export const PanelLeft = makeIcon(_PanelLeft, "PanelLeft");
export const PanelLeftClose = makeIcon(_PanelLeftClose, "PanelLeftClose");
export const ExternalLink = makeIcon(_ExternalLink, "ExternalLink");
export const Copy = makeIcon(_Copy, "Copy");
export const Table = makeIcon(_Table, "Table");
export const Activity = makeIcon(_TrendingUp, "Activity");
export const UserPlus = makeIcon(_UserAdd, "UserPlus");
export const Square = makeIcon(_Square, "Square");
export const CheckSquare = makeIcon(_CheckSquare, "CheckSquare");
export const ArrowDown = makeIcon(_ArrowDown, "ArrowDown");
export const ArrowUp = makeIcon(_ArrowUp, "ArrowUp");
export const ArrowUpDown = makeIcon(_ArrowUpDown, "ArrowUpDown");
export const Bluetooth = makeIcon(_Bluetooth, "Bluetooth");
export const Box = makeIcon(_Box, "Box");
export const Cpu = makeIcon(_Cpu, "Cpu");
export const LayoutGrid = makeIcon(_LayoutGrid, "LayoutGrid");
export const Monitor = makeIcon(_Monitor, "Monitor");
export const MonitorSmartphone = makeIcon(_MonitorSmartphone, "MonitorSmartphone");
export const MoreHorizontal = makeIcon(_MoreHorizontal, "MoreHorizontal");
export const Pause = makeIcon(_Pause, "Pause");
export const Play = makeIcon(_Play, "Play");
export const RefreshCw = makeIcon(_RefreshCw, "RefreshCw");
export const Rocket = makeIcon(_Rocket, "Rocket");
export const Search = makeIcon(_Search, "Search");
export const SkipForward = makeIcon(_SkipForward, "SkipForward");
export const StopCircle = makeIcon(_Stop, "StopCircle");
export const TableProperties = makeIcon(_GridTable, "TableProperties");
export const UploadCloud = makeIcon(_CloudUpload, "UploadCloud");
export const Volume2 = makeIcon(_Volume2, "Volume2");
export const Scissors = makeIcon(_Scissors, "Scissors");
export const HeartHandshake = makeIcon(_Handshake, "HeartHandshake");
export const Quote = makeIcon(_Quote, "Quote");
export const HelpCircle = makeIcon(_HelpCircle, "HelpCircle");
export const Terminal = makeIcon(_Terminal, "Terminal");
export const Smartphone = makeIcon(_Smartphone, "Smartphone");
export const Share2 = makeIcon(_Share01, "Share2");
export const Server = makeIcon(_Server, "Server");
export const Wifi = makeIcon(_Wifi, "Wifi");
