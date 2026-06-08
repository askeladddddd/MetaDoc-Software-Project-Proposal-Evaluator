import React from 'react';

const IconWrapper = ({ size = 24, color = 'currentColor', className = '', children, onClick }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke={color} 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
    onClick={onClick}
  >
    {children}
  </svg>
);

// Helper to easily create simple path-based icons
const createIcon = (paths) => {
  return (props) => (
    <IconWrapper {...props}>
      {paths.map((d, i) => {
        if (d.startsWith('Mrect')) {
          const match = d.match(/x=([\d.]+)\s+y=([\d.]+)\s+width=([\d.]+)\s+height=([\d.]+)\s+rx=([\d.]+)\s+ry=([\d.]+)/);
          if (match) {
            const [, x, y, width, height, rx, ry] = match;
            return <rect key={i} x={x} y={y} width={width} height={height} rx={rx} ry={ry} />;
          }
        }
        if (d.startsWith('Mcircle')) {
          const match = d.match(/cx=([\d.]+)\s+cy=([\d.]+)\s+r=([\d.]+)/);
          if (match) {
            const [, cx, cy, r] = match;
            return <circle key={i} cx={cx} cy={cy} r={r} />;
          }
        }
        if (d.startsWith('Mellipse')) {
          const match = d.match(/cx=([\d.]+)\s+cy=([\d.]+)\s+rx=([\d.]+)\s+ry=([\d.]+)/);
          if (match) {
            const [, cx, cy, rx, ry] = match;
            return <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} />;
          }
        }
        return <path key={i} d={d} />;
      })}
    </IconWrapper>
  );
};

export const AlertCircle = createIcon(["M12 8v4", "M12 16h.01", "M21 12a9 9 0 11-18 0 9 9 0 0118 0z"]);
export const AlertTriangle = createIcon(["M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z", "M12 9v4", "M12 17h.01"]);
export const Archive = createIcon(["M21 8v13H3V8", "M1 3h22v5H1z", "M10 12h4"]);
export const ArrowLeft = createIcon(["M19 12H5", "M12 19l-7-7 7-7"]);
export const ArrowRight = createIcon(["M5 12h14", "M12 5l7 7-7 7"]);
export const ArrowUp = createIcon(["M12 19V5", "M5 12l7-7 7 7"]);
export const ArrowUpDown = createIcon(["M12 3v18", "M16 17l-4 4-4-4", "M8 7l4-4 4 4"]);
export const BarChart3 = createIcon(["M3 3v18h18", "M18 17V9", "M13 17V5", "M8 17v-3"]);
export const BookOpen = createIcon(["M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z", "M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"]);
export const Bot = createIcon(["Mrect x=3 y=11 width=18 height=10 rx=2 ry=2", "Mcircle cx=12 cy=5 r=2", "M12 7v4", "M9 16h.01", "M15 16h.01"]);
export const Calendar = createIcon(["Mrect x=3 y=4 width=18 height=18 rx=2 ry=2", "M16 2v4", "M8 2v4", "M3 10h18"]);
export const CheckCircle = createIcon(["M22 11.08V12a10 10 0 11-5.93-9.14", "M22 4L12 14.01l-3-3"]);
export const CheckCircle2 = CheckCircle;
export const ChevronDown = createIcon(["M6 9l6 6 6-6"]);
export const ChevronLeft = createIcon(["M15 18l-6-6 6-6"]);
export const ChevronRight = createIcon(["M9 18l6-6-6-6"]);
export const ChevronUp = createIcon(["M18 15l-6-6-6 6"]);
export const CircleHelp = createIcon(["M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z", "M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3", "M12 17h.01"]);
export const ClipboardList = createIcon(["M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2", "M15 2H9a1 1 0 00-1 1v2a1 1 0 001 1h6a1 1 0 001-1V3a1 1 0 00-1-1z", "M12 11h4", "M12 16h4", "M8 11h.01", "M8 16h.01"]);
export const Clock = createIcon(["M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z", "M12 6v6l4 2"]);
export const Code2 = createIcon(["M16 18l6-6-6-6", "M8 6l-6 6 6 6"]);
export const Copy = createIcon(["Mrect x=9 y=9 width=13 height=13 rx=2 ry=2", "M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"]);
export const Database = createIcon(["Mellipse cx=12 cy=5 rx=9 ry=3", "M21 12c0 1.66-4 3-9 3s-9-1.34-9-3", "M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"]);
export const Download = createIcon(["M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4", "M7 10l5 5 5-5", "M12 15V3"]);
export const Edit2 = createIcon(["M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"]);
export const ExternalLink = createIcon(["M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6", "M15 3h6v6", "M10 14L21 3"]);
export const Eye = createIcon(["M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z", "M12 15a3 3 0 100-6 3 3 0 000 6z"]);
export const EyeOff = createIcon(["M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24", "M1 1l22 22"]);
export const FileBarChart = createIcon(["M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z", "M14 2v6h6", "M12 18v-6", "M8 18v-3", "M16 18v-8"]);
export const FileText = createIcon(["M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z", "M14 2v6h6", "M16 13H8", "M16 17H8", "M10 9H8"]);
export const FileType = FileText;
export const FileUp = createIcon(["M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z", "M14 2v6h6", "M12 12v6", "M9 15l3-3 3 3"]);
export const Flag = createIcon(["M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z", "M4 22v-7"]);
export const Folder = createIcon(["M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"]);
export const FolderIcon = Folder;
export const FolderOpen = createIcon(["M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"]);
export const Globe = createIcon(["M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z", "M2 12h20", "M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"]);
export const Hash = createIcon(["M4 9h16", "M4 15h16", "M10 3L8 21", "M16 3l-2 18"]);
export const Info = createIcon(["M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z", "M12 16v-4", "M12 8h.01"]);
export const LayoutDashboard = createIcon(["Mrect x=3 y=3 width=7 height=9 rx=1 ry=1", "Mrect x=14 y=3 width=7 height=5 rx=1 ry=1", "Mrect x=14 y=12 width=7 height=9 rx=1 ry=1", "Mrect x=3 y=16 width=7 height=5 rx=1 ry=1"]);
export const LinkIcon = createIcon(["M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71", "M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"]);
export const Loader = createIcon(["M12 2v4", "M12 18v4", "M4.93 4.93l2.83 2.83", "M16.24 16.24l2.83 2.83", "M2 12h4", "M18 12h4", "M4.93 19.07l2.83-2.83", "M16.24 7.76l2.83-2.83"]);
export const Loader2 = createIcon(["M21 12a9 9 0 11-6.219-8.56"]);
export const Lock = createIcon(["Mrect x=3 y=11 width=18 height=11 rx=2 ry=2", "M7 11V7a5 5 0 0110 0v4"]);
export const LogIn = createIcon(["M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4", "M10 17l5-5-5-5", "M15 12H3"]);
export const LogOut = createIcon(["M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4", "M16 17l5-5-5-5", "M21 12H9"]);
export const Mail = createIcon(["M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z", "M22 6l-10 7L2 6"]);
export const Menu = createIcon(["M3 12h18", "M3 6h18", "M3 18h18"]);
export const MessageSquare = createIcon(["M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"]);
export const Minus = createIcon(["M5 12h14"]);
export const Pencil = createIcon(["M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"]);
export const Plus = createIcon(["M12 5v14", "M5 12h14"]);
export const RefreshCcw = createIcon(["M1 4v6h6", "M23 20v-6h-6", "M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"]);
export const RefreshCw = createIcon(["M23 4v6h-6", "M1 20v-6h6", "M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"]);
export const RotateCcw = createIcon(["M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8", "M3 3v5h5"]);
export const Save = createIcon(["M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z", "M17 21v-8H7v8", "M7 3v5h8"]);
export const Search = createIcon(["Mcircle cx=11 cy=11 r=8", "M21 21l-4.35-4.35"]);
export const Send = createIcon(["M22 2L11 13", "M22 2l-7 20-4-9-9-4 20-7z"]);
export const Settings = createIcon(["M12 15a3 3 0 100-6 3 3 0 000 6z", "M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"]);
export const Shield = createIcon(["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"]);
export const Sparkles = createIcon(["M9.937 15.5A2 2 0 008.5 14.063l-6.135-1.582a.5.5 0 010-.962L8.5 9.936A2 2 0 009.937 8.5l1.582-6.135a.5.5 0 01.963 0L14.063 8.5A2 2 0 0015.5 9.937l6.135 1.581a.5.5 0 010 .964L15.5 14.063a2 2 0 00-1.437 1.437l-1.582 6.135a.5.5 0 01-.963 0z"]);
export const Trash2 = createIcon(["M3 6h18", "M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2", "M10 11v6", "M14 11v6"]);
export const TrendingUp = createIcon(["M23 6l-9.5 9.5-5-5L1 18", "M17 6h6v6"]);
export const Upload = createIcon(["M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4", "M17 8l-5-5-5 5", "M12 3v12"]);
export const User = createIcon(["M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2", "Mcircle cx=12 cy=7 r=4"]);
export const Users = createIcon(["M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2", "Mcircle cx=9 cy=7 r=4", "M23 21v-2a4 4 0 00-3-3.87", "M16 3.13a4 4 0 010 7.75"]);
export const X = createIcon(["M18 6L6 18", "M6 6l12 12"]);
export const XCircle = createIcon(["Mcircle cx=12 cy=12 r=10", "M15 9l-6 6", "M9 9l6 6"]);

// Fix for elements like circle, rect, ellipse
export const CustomIcon = ({ name, ...props }) => {
   // A simple wrapper
   return <IconWrapper {...props} />;
};
