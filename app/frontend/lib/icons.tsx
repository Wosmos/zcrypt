"use client";

import { forwardRef, type SVGProps } from "react";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import * as HugeIcons from "@hugeicons/core-free-icons";

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
  strokeWidth?: number;
};

function makeIcon(iconData: IconSvgElement, displayName: string) {
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

// Helper to create icon with optional rename
const icon = (name: keyof typeof HugeIcons, exportName?: string) => 
  makeIcon(HugeIcons[name], exportName || name);

export const Shield = icon("Shield");
export const Lock = icon("Lock");
export const Unlock = icon("Unlock");
export const Upload = icon("Upload");
export const FileUpload = icon("FileUploadIcon");
export const Download = icon("Download");
export const Bell = icon("Bell");
export const BellOff = icon("BellOff");
export const Check = icon("Check");
export const CheckCircle2 = icon("CheckCircle");
export const X = icon("X");
export const ChevronDown = icon("ChevronDown");
export const ChevronLeft = icon("ChevronLeft");
export const ChevronRight = icon("ChevronRight");
export const ChevronUp = icon("ChevronUp");
export const Eye = icon("Eye");
export const File = icon("File");
export const FileText = icon("FileText");
export const Folder = icon("Folder");
export const FolderOpen = icon("FolderOpen");
export const FolderAdd = icon("FolderAddIcon");
export const Edit = icon("Edit");
export const Trash2 = icon("Trash2");
export const Star = icon("Star");
export const Heart = icon("Heart");
export const Home = icon("Home");
export const Settings = icon("Settings");
export const Sun = icon("Sun");
export const Moon = icon("Moon");
export const Menu = icon("Menu");
export const Plus = icon("Plus");
export const Mail = icon("Mail");
export const Cloud = icon("Cloud");
export const Database = icon("Database");
export const Globe = icon("Globe");
export const Key = icon("Key");
export const AlertCircle = icon("AlertCircle");
export const AlertTriangle = icon("AlertTriangle");
export const Info = icon("Info");
export const User = icon("User");
export const Users = icon("Users");
export const Clock = icon("Clock");
export const Code = icon("Code");
export const Link2 = icon("Link2");
export const Github = icon("Github");
export const GitBranch = icon("GitBranch");
export const Loader2 = icon("LoaderCircle");
export const Infinity = icon("Infinity");
export const Sparkles = icon("Sparkles");
export const Crown = icon("Crown");
export const Zap = icon("Zap");
export const Wand2 = icon("Wand");
export const RefreshCcw = icon("RefreshCcw");
export const RotateCcw = icon("RotateCcw");
export const Video = icon("Video");
export const Music = icon("Music");
export const Image = icon("Image");
export const Archive = icon("Archive");
export const Layers = icon("Layers");
export const HardDrive = icon("HardDrive");
export const Gauge = icon("DashboardSpeed01Icon");
export const TrendingDown = icon("TrendingDown");
export const BarChart3 = icon("BarChart");
export const MessageSquare = icon("MessageSquare");
export const Send = icon("Send");
export const ArrowLeft = icon("ArrowLeft");
export const ArrowRight = icon("ArrowRight");
export const ArrowUpRight = icon("ArrowUpRight01Icon");
export const MapPin = icon("Location01Icon");
export const ShieldAlert = icon("ShieldAlert");
export const ShieldCheck = icon("ShieldCheck");
export const LogIn = icon("LogIn");
export const LogOut = icon("LogOut");
export const XCircle = icon("XCircle");
export const Cog = icon("Cog");
export const PanelLeft = icon("PanelLeft");
export const PanelLeftClose = icon("PanelLeftClose");
export const ExternalLink = icon("ExternalLink");
export const Copy = icon("Copy");
export const Table = icon("Table");
export const Activity = icon("TrendingUp");
export const UserPlus = icon("UserAdd01Icon");
export const Square = icon("Square");
export const CheckSquare = icon("CheckSquare");
export const ArrowDown = icon("ArrowDown");
export const ArrowUp = icon("ArrowUp");
export const ArrowUpDown = icon("ArrowUpDown");
export const Bluetooth = icon("Bluetooth");
export const Box = icon("Box");
export const Cpu = icon("Cpu");
export const LayoutGrid = icon("LayoutGrid");
export const Monitor = icon("Monitor");
export const MonitorSmartphone = icon("MonitorSmartphone");
export const MoreHorizontal = icon("MoreHorizontal");
export const Pause = icon("Pause");
export const Play = icon("Play");
export const RefreshCw = icon("RefreshCw");
export const Rocket = icon("Rocket");
export const Search = icon("Search");
export const SkipForward = icon("SkipForward");
export const StopCircle = icon("Stop");
export const TableProperties = icon("GridTableIcon");
export const UploadCloud = icon("CloudUpload");
export const Volume2 = icon("Volume2");
export const Scissors = icon("Scissors");
export const HelpCircle = icon("HelpCircleIcon");
export const Terminal = icon("Terminal");
export const Smartphone = icon("Smartphone");
export const Share2 = icon("Share01Icon");
export const Server = icon("Server");
export const Wifi = icon("Wifi");