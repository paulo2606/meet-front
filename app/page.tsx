"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/auth-context";
import { Logo, PlusIcon } from "@/components/logo";
import type { MeetingResponse } from "@/lib/api";

const TILE_COLORS = [
  "from-teal-600 to-teal-800",
  "from-amber-500 to-orange-700",
  "from-indigo-500 to-indigo-800",
  "from-rose-500 to-red-700",
];

function MockTile({
  label,
  color,
  large = false,
}: {
  label: string;
  color: string;
  large?: boolean;
}) {
  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden rounded-box bg-gradient-to-br ${color}`}
    >
      <span
        aria-hidden="true"
        className={`font-display font-semibold text-white ${large ? "text-4xl" : "text-lg"}`}
      >
        {label}
      </span>
      <span className="absolute bottom-1.5 left-2 text-xs text-white/90">
        {label}
      </span>
    </div>
  );
}

function MockRoom() {
  return (
    <div className="relative overflow-hidden rounded-box bg-room shadow-ambient ring-1 ring-line">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="flex items-center gap-2 text-sm text-room-ink-2">
          <span className="relative inline-flex h-2 w-2">
            <span className="live-dot inline-block h-2 w-2 rounded-full bg-red-500 text-red-500" />
          </span>
          ao vivo
        </span>
        <span className="text-xs text-room-ink-3">reuniao · 5 participantes</span>
      </div>
      <div className="grid grid-cols-2 gap-2 px-4 pb-4 sm:grid-cols-4">
        <div className="col-span-2 row-span-2">
          <MockTile label="Paulo" color={TILE_COLORS[0]} large />
        </div>
        <MockTile label="Ana" color={TILE_COLORS[1]} />
        <MockTile label="Bruno" color={TILE_COLORS[2]} />
        <MockTile label="Carla" color={TILE_COLORS[3]} />
        <MockTile label="Davi" color={TILE_COLORS[0]} />
        <MockTile label="Eva" color={TILE_COLORS[1]} />
        <MockTile label="Felipe" color={TILE_COLORS[2]} />
      </div>
    </div>
  );
}

export default function Home() {
  const { user, isLoading, logout, authRequest } = useAuth();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function handleCreateMeeting() {
    setCreating(true);
    setError("");
    try {
      const meeting = await authRequest<MeetingResponse>("/api/meetings", {
        method: "POST",
      });
      router.push(`/room/${meeting.id}`);
    } catch {
      setError("nao foi possivel criar a reuniao, tente novamente");
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <Logo />
        {!isLoading &&
          (user ? (
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-medium text-white">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <button
                type="button"
                onClick={() => logout()}
                className="text-sm font-medium text-accent hover:underline"
              >
                sair
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="rounded-box px-4 py-2 text-sm font-medium text-accent transition hover:bg-accent-soft"
            >
              entrar
            </Link>
          ))}
      </header>

      <main
        id="main"
        className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center gap-12 px-6 pb-16 lg:flex-row lg:gap-16"
      >
        <div className="flex max-w-xl flex-col items-center gap-6 text-center lg:items-start lg:text-left">
          <p className="inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-sm font-medium text-accent-strong">
            <span className="relative flex h-2 w-2">
              <span className="live-dot inline-block h-2 w-2 rounded-full bg-accent text-accent" />
            </span>
            encontros em qualquer lugar
          </p>
          <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight text-ink sm:text-5xl lg:text-[3.4rem]">
            Videoconferências de alta qualidade, para todos
          </h1>
          <p className="text-lg leading-relaxed text-ink-2">
            Conecte-se, colabore e celebre com as pessoas da sua vida no Meet,
            direto do navegador, sem instalar nada.
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            {user ? (
              <>
                <button
                  type="button"
                  onClick={handleCreateMeeting}
                  disabled={creating}
                  aria-busy={creating}
                  className="flex items-center gap-2 rounded-box bg-accent px-6 py-3 text-sm font-medium text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <PlusIcon className="h-5 w-5" />
                  {creating ? "criando..." : "nova reunião"}
                </button>
                <p className="text-sm text-ink-3">conectado como {user.email}</p>
              </>
            ) : (
              <>
                <Link
                  href="/register"
                  className="rounded-box bg-accent px-6 py-3 text-sm font-medium text-white transition hover:bg-accent-strong"
                >
                  criar conta
                </Link>
                <Link
                  href="/login"
                  className="rounded-box border border-line bg-surface px-6 py-3 text-sm font-medium text-ink transition hover:border-accent hover:text-accent"
                >
                  entrar
                </Link>
              </>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </div>
        <div className="w-full max-w-xl">
          <MockRoom />
        </div>
      </main>

      <footer className="px-6 pb-8 text-center text-xs text-ink-3">
        Compartilhe um link e converse com qualquer pessoa, em qualquer lugar.
      </footer>
    </div>
  );
}
