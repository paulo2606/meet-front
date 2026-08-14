import Image from "next/image";
import { resolvePhotoUrl } from "@/lib/api";

type AvatarProps = {
  photoUrl: string | null | undefined;
  name: string;
  className?: string;
};

const PALETTE = [
  "bg-accent",
  "bg-rose-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-sky-500",
  "bg-emerald-500",
];

export function Avatar({ photoUrl, name, className }: AvatarProps) {
  const resolved = resolvePhotoUrl(photoUrl);
  if (resolved) {
    return (
      <div className={`relative h-full w-full overflow-hidden rounded-full ${className ?? ""}`}>
        <Image
          src={resolved}
          alt={`foto de ${name}`}
          fill
          unoptimized
          sizes="6rem"
          className="object-cover"
        />
      </div>
    );
  }

  const paletteIndex = (name.charCodeAt(0) + name.length) % PALETTE.length;
  return (
    <div
      aria-label={`foto de ${name}`}
      role="img"
      className={`flex h-full w-full items-center justify-center rounded-full text-sm font-semibold text-white ${PALETTE[paletteIndex]} ${className ?? ""}`}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}
