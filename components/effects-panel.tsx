"use client";

import { CloseIcon, SparklesIcon } from "@/components/logo";
import { BACKGROUND_EFFECTS, type BackgroundEffect, type BackgroundEffectOption } from "@/lib/background-effects";

type EffectsPanelProps = {
  variant: "preview" | "meeting";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selected: BackgroundEffect;
  onSelect: (effect: BackgroundEffect) => void;
  error: string;
};

function swatchStyle(swatch: BackgroundEffectOption["swatch"]) {
  if (swatch && "color" in swatch) {
    return { background: swatch.color };
  }
  if (swatch && "from" in swatch) {
    return { background: `linear-gradient(135deg, ${swatch.from} 0%, ${swatch.to} 100%)` };
  }
  return { background: "repeating-linear-gradient(45deg, #f8fafc 0 2px, #94a3b8 2px 4px)" };
}

export function EffectsPanel({ variant, open, onOpenChange, selected, onSelect, error }: EffectsPanelProps) {
  const isMeeting = variant === "meeting";
  const selectedKey = JSON.stringify(selected);
  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-label="efeitos"
        aria-pressed={open}
        className={`${
          isMeeting
            ? "flex h-12 w-12 items-center justify-center rounded-box transition"
            : "flex h-11 w-11 items-center justify-center rounded-box border transition"
        } ${
          open
            ? isMeeting
              ? "bg-accent text-white"
              : "border-accent bg-accent text-white"
            : isMeeting
              ? "bg-room-tile text-white hover:bg-black"
              : "border-line bg-surface text-ink hover:border-accent hover:text-accent"
        }`}
      >
        <SparklesIcon className="h-5 w-5" />
      </button>
      {open && (
        <div
          className={`flex flex-col gap-3 rounded-box border border-room-line bg-room-surface p-4 shadow-ambient ${
            isMeeting ? "absolute bottom-40 left-1/2 w-80 -translate-x-1/2" : "absolute bottom-14 left-1/2 w-80 -translate-x-1/2"
          }`}
        >
          <div className="flex items-center justify-between text-sm font-medium text-room-ink">
            efeitos
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="fechar efeitos"
              className="flex h-8 w-8 items-center justify-center rounded-box text-room-ink-3 transition hover:bg-room-tile hover:text-room-ink"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {BACKGROUND_EFFECTS.map((option) => {
              const isSelected = JSON.stringify(option.effect) === selectedKey;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onSelect(option.effect)}
                  aria-label={option.label}
                  aria-pressed={isSelected}
                  className={`flex items-center gap-2 rounded-box px-3 py-2 text-sm font-medium transition ${
                    isSelected ? "bg-accent text-white" : "border border-room-line bg-room text-room-ink hover:bg-room-tile"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 rounded-full ring-1 ring-white/40"
                    style={swatchStyle(option.swatch)}
                  />
                  {option.label}
                </button>
              );
            })}
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </>
  );
}
