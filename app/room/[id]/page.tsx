"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-context";
import { CameraIcon } from "@/components/logo";
import { ApiError, type MeetingResponse } from "@/lib/api";

export default function RoomPage() {
  const { id } = useParams<{ id: string }>();
  const { user, authRequest } = useAuth();
  const [meeting, setMeeting] = useState<MeetingResponse | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    authRequest<MeetingResponse>(`/api/meetings/${id}`)
      .then((data) => {
        if (!cancelled) setMeeting(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError && err.status === 404 ? "reuniao nao encontrada" : "nao foi possivel carregar a reuniao");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id, authRequest]);

  const inviteUrl = meeting ? `${window.location.origin}/room/${meeting.id}` : "";

  async function handleCopy() {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-3">
          <CameraIcon className="h-8 w-8 text-blue-700" />
          <span className="text-xl font-medium text-zinc-900">Meet</span>
        </Link>
        {user && (
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-700 text-sm font-medium text-white">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <span className="text-sm text-zinc-600">{user.name}</span>
          </div>
        )}
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 pb-16">
        {error && <p className="text-red-600">{error}</p>}

        {meeting && (
          <div className="flex w-full max-w-lg flex-col items-center gap-6 text-center">
            <div className="flex h-40 w-full items-center justify-center rounded-3xl bg-zinc-900 text-zinc-500">
              câmera desativada
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-zinc-900">
                Reunião com {meeting.hostName}
              </h1>
              <p className="mt-1 text-zinc-500">
                código: <span className="font-mono font-semibold text-zinc-800">{meeting.code}</span>
              </p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="rounded-full bg-blue-700 px-6 py-3 text-sm font-medium text-white transition hover:bg-blue-800"
              >
                {copied ? "link copiado" : "copiar link de convite"}
              </button>
              <p className="text-sm text-zinc-500">
                convide alguém colando o link no navegador
              </p>
            </div>
          </div>
        )}

        {!meeting && !error && (
          <p className="text-zinc-500">carregando...</p>
        )}
      </main>
    </div>
  );
}
