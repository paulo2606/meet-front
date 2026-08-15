import Link from "next/link";

type IconProps = { className?: string };

function Icon({
  className = "",
  children,
  label,
}: IconProps & { children: React.ReactNode; label?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      {children}
    </svg>
  );
}

export function CameraIcon({ className = "" }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </Icon>
  );
}

export function CameraOffIcon({ className = "" }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
      <line x1="3" y1="3" x2="21" y2="21" />
    </Icon>
  );
}

export function MicIcon({ className = "" }: IconProps) {
  return (
    <Icon className={className}>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <line x1="8" y1="21" x2="16" y2="21" />
    </Icon>
  );
}

export function MicOffIcon({ className = "" }: IconProps) {
  return (
    <Icon className={className}>
      <line x1="3" y1="3" x2="21" y2="21" />
      <path d="M9 4a3 3 0 0 1 6 0v8" />
      <path d="M5 10a7 7 0 0 0 3.4 6.1" />
      <path d="M19 10a7 7 0 0 1-.6 2.9" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <line x1="8" y1="21" x2="16" y2="21" />
    </Icon>
  );
}

export function ScreenShareIcon({ className = "" }: IconProps) {
  return (
    <Icon className={className}>
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="m9 10 3-3 3 3" />
      <path d="M12 7v6" />
    </Icon>
  );
}

export function StopScreenShareIcon({ className = "" }: IconProps) {
  return (
    <Icon className={className}>
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <line x1="3" y1="3" x2="21" y2="21" />
      <line x1="10" y1="10" x2="10" y2="13" />
      <line x1="14" y1="7" x2="14" y2="10" />
    </Icon>
  );
}

export function FullscreenIcon({ className = "" }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M16 3h3a2 2 0 0 1 2 2v3" />
      <path d="M21 16v3a2 2 0 0 1-2 2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
    </Icon>
  );
}

export function LeaveIcon({ className = "" }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
      <path d="M14 8l4 4-4 4" />
      <path d="M18 12H9" />
    </Icon>
  );
}

export function SendIcon({ className = "" }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4 20-7z" />
    </Icon>
  );
}

export function CloseIcon({ className = "" }: IconProps) {
  return (
    <Icon className={className}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </Icon>
  );
}

export function CopyIcon({ className = "" }: IconProps) {
  return (
    <Icon className={className}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </Icon>
  );
}

export function CheckIcon({ className = "" }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M20 6 9 17l-5-5" />
    </Icon>
  );
}

export function UsersIcon({ className = "" }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Icon>
  );
}

export function ChatIcon({ className = "" }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </Icon>
  );
}

export function PlusIcon({ className = "" }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </Icon>
  );
}

export function SettingsIcon({ className = "" }: IconProps) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Icon>
  );
}

export function SparklesIcon({ className = "" }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M12 3l1.9 5.1a2 2 0 0 0 1 1L20 11l-5.1 1.9a2 2 0 0 0-1 1L12 19l-1.9-5.1a2 2 0 0 0-1-1L4 11l5.1-1.9a2 2 0 0 0 1-1L12 3z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />
    </Icon>
  );
}

export function Logo({ text = "Meet" }: { text?: string }) {
  return (
    <Link href="/" className="group flex items-center gap-3">
      <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-white">
        <CameraIcon className="h-5 w-5" />
        <span
          aria-hidden="true"
          className="live-dot absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-accent-bright text-accent-bright"
        />
      </span>
      <span className="font-display text-xl font-semibold tracking-tight text-current">
        {text}
      </span>
    </Link>
  );
}
