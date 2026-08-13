"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { HubConnectionBuilder, type HubConnection } from "@microsoft/signalr";
import { useAuth } from "@/components/auth-context";
import { CameraIcon } from "@/components/logo";
import { ApiError, type MeetingResponse } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5028";
const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

function newParticipantId() {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

type RemoteStream = {
  participantId: string;
  stream: MediaStream;
};

type Participant = {
  participantId: string;
  name: string;
};

type ChatMessage = {
  participantId: string;
  name: string;
  text: string;
};

export default function RoomPage() {
  const { id } = useParams<{ id: string }>();
  const { user, authRequest } = useAuth();
  const [meeting, setMeeting] = useState<MeetingResponse | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [selfId, setSelfId] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatText, setChatText] = useState("");
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const connectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const hubRef = useRef<HubConnection | null>(null);
  const participantIdRef = useRef<string | null>(null);

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

  useEffect(
    () => () => {
      for (const connection of connectionsRef.current.values()) {
        connection.close();
      }
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      hubRef.current?.stop();
    },
    [],
  );

  const removePeer = useCallback((participantId: string) => {
    const connection = connectionsRef.current.get(participantId);
    if (connection) {
      connection.close();
      connectionsRef.current.delete(participantId);
    }
    setRemoteStreams((prev) => prev.filter((remote) => remote.participantId !== participantId));
  }, []);

  const createPeer = useCallback(
    (participantId: string, shouldOffer: boolean): RTCPeerConnection => {
      const existing = connectionsRef.current.get(participantId);
      if (existing) {
        return existing;
      }

      const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      connectionsRef.current.set(participantId, connection);

      connection.onicecandidate = (event) => {
        if (event.candidate && hubRef.current) {
          hubRef.current.invoke("IceCandidate", id, participantId, JSON.stringify(event.candidate));
        }
      };
      connection.ontrack = (event) => {
        setRemoteStreams((prev) => {
          if (prev.some((remote) => remote.participantId === participantId)) {
            return prev;
          }
          return [...prev, { participantId, stream: event.streams[0] }];
        });
      };

      localStreamRef.current?.getTracks().forEach((track) => connection.addTrack(track, localStreamRef.current!));

      if (shouldOffer) {
        connection.createOffer().then((offer) => {
          connection.setLocalDescription(offer);
          hubRef.current?.invoke("Offer", id, participantId, JSON.stringify(offer));
        });
      }

      return connection;
    },
    [id],
  );

  async function handleJoin() {
    setJoining(true);
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      cameraTrackRef.current = stream.getVideoTracks()[0] ?? null;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      const connection = new HubConnectionBuilder().withUrl(`${API_URL}/hubs/meeting`).build();
      hubRef.current = connection;
      participantIdRef.current = newParticipantId();
      setSelfId(participantIdRef.current);
      const selfName = user?.name ?? "Convidado";
      setParticipants([{ participantId: participantIdRef.current, name: selfName }]);

      const addParticipant = (participant: Participant) => {
        setParticipants((prev) =>
          prev.some((existing) => existing.participantId === participant.participantId) ? prev : [...prev, participant],
        );
      };

      connection.on("Peers", (peers: Participant[]) => {
        peers.forEach((peer) => {
          addParticipant(peer);
          createPeer(peer.participantId, true);
        });
      });
      connection.on("PeerJoined", (participantId: string, name: string) => {
        addParticipant({ participantId, name });
        createPeer(participantId, false);
      });
      connection.on("PeerLeft", (participantId: string) => {
        removePeer(participantId);
        setParticipants((prev) => prev.filter((participant) => participant.participantId !== participantId));
      });
      connection.on("Message", (participantId: string, name: string, text: string) => {
        setChatMessages((prev) => [...prev, { participantId, name, text }]);
      });
      connection.on("Offer", async (meetingId: string, fromParticipantId: string, sdp: string) => {
        const peer = createPeer(fromParticipantId, false);
        await peer.setRemoteDescription(JSON.parse(sdp));
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        await connection.invoke("Answer", meetingId, fromParticipantId, JSON.stringify(answer));
      });
      connection.on("Answer", async (_meetingId: string, fromParticipantId: string, sdp: string) => {
        const peer = connectionsRef.current.get(fromParticipantId);
        if (peer) {
          await peer.setRemoteDescription(JSON.parse(sdp));
        }
      });
      connection.on("IceCandidate", async (_meetingId: string, fromParticipantId: string, candidate: string) => {
        const peer = connectionsRef.current.get(fromParticipantId);
        if (peer) {
          await peer.addIceCandidate(JSON.parse(candidate));
        }
      });

      await connection.start();
      await connection.invoke("Join", id, participantIdRef.current, selfName);
      setJoined(true);
    } catch {
      setError("nao foi possivel entrar na reuniao");
      setJoined(false);
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    } finally {
      setJoining(false);
    }
  }

  async function handleLeave() {
    for (const connection of connectionsRef.current.values()) {
      connection.close();
    }
    connectionsRef.current.clear();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setRemoteStreams([]);
    setParticipants([]);
    setChatMessages([]);
    setChatOpen(false);
    setJoined(false);
    await hubRef.current?.stop();
    hubRef.current = null;
  }

  async function sendChatMessage() {
    const text = chatText.trim();
    if (!text || !hubRef.current) {
      return;
    }
    await hubRef.current.invoke("SendMessage", id, text);
    setChatText("");
  }

  async function handleShareScreen() {
    if (sharing) {
      stopScreenShare();
      return;
    }
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];
      if (!screenTrack) {
        return;
      }
      screenStreamRef.current = screenStream;
      screenTrackRef.current = screenTrack;
      screenTrack.onended = () => stopScreenShare();
      for (const connection of connectionsRef.current.values()) {
        const sender = connection.getSenders().find((candidate) => candidate.track?.kind === "video");
        await sender?.replaceTrack(screenTrack);
      }
      setSharing(true);
    } catch {
      setSharing(false);
    }
  }

  function stopScreenShare() {
    const screenTrack = screenTrackRef.current;
    const cameraTrack = cameraTrackRef.current;
    if (cameraTrack) {
      for (const connection of connectionsRef.current.values()) {
        const sender = connection.getSenders().find((candidate) => candidate.track?.kind === "video");
        sender?.replaceTrack(cameraTrack);
      }
    }
    screenTrack?.stop();
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenTrackRef.current = null;
    screenStreamRef.current = null;
    cameraTrackRef.current = null;
    setSharing(false);
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  }

  function toggleMic() {
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !track.enabled;
    });
    setMicOn((value) => !value);
  }

  function toggleCamera() {
    localStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = !track.enabled;
    });
    setCameraOn((value) => !value);
  }

  const inviteUrl = meeting ? `${window.location.origin}/room/${meeting.id}` : "";

  async function handleCopy() {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (joined) {
    return (
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <CameraIcon className="h-8 w-8 text-blue-700" />
            <span className="text-xl font-medium text-zinc-900">Meet</span>
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-700 text-sm font-medium text-white">
              {(user?.name ?? "Convidado").charAt(0).toUpperCase()}
            </div>
            <span className="text-sm text-zinc-600">{user?.name ?? "Convidado"}</span>
          </div>
        </header>

        <main className="relative flex flex-1 flex-col items-center justify-center gap-4 px-6 pb-8">
          <div className="flex w-full max-w-5xl items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setParticipantsOpen(true);
                setChatOpen(false);
              }}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${participantsOpen ? "bg-blue-700 text-white" : "border border-zinc-300 text-zinc-700 hover:bg-zinc-100"}`}
            >
              participantes ({participants.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setChatOpen(true);
                setParticipantsOpen(false);
              }}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${chatOpen ? "bg-blue-700 text-white" : "border border-zinc-300 text-zinc-700 hover:bg-zinc-100"}`}
            >
              chat {chatMessages.length > 0 ? `(${chatMessages.length})` : ""}
            </button>
          </div>

          <div className="grid w-full max-w-5xl grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-4">
            {sharing && (
              <div className="relative aspect-video overflow-hidden rounded-2xl bg-zinc-900">
                <video
                  autoPlay
                  muted
                  playsInline
                  data-testid="screen-video"
                  ref={(el) => {
                    if (el && screenStreamRef.current && el.srcObject !== screenStreamRef.current) {
                      el.srcObject = screenStreamRef.current;
                    }
                  }}
                  className="h-full w-full object-cover"
                />
                <p className="absolute bottom-2 left-3 text-sm text-white/90">minha tela</p>
              </div>
            )}
            <div className="relative aspect-video overflow-hidden rounded-2xl bg-zinc-900">
              <video
                autoPlay
                muted
                playsInline
                data-testid="local-video"
                ref={(el) => {
                  localVideoRef.current = el;
                  if (el && localStreamRef.current && el.srcObject !== localStreamRef.current) {
                    el.srcObject = localStreamRef.current;
                  }
                }}
                className="h-full w-full object-cover"
              />
              {!cameraOn && <p className="absolute inset-0 flex items-center justify-center text-sm text-zinc-400">camera desativada</p>}
              <p className="absolute bottom-2 left-3 text-sm text-white/90">{user?.name ?? "Convidado"}</p>
            </div>

            {remoteStreams.length === 0 && (
              <div className="flex aspect-video items-center justify-center rounded-2xl bg-zinc-100 text-sm text-zinc-500">
                aguardando outros participantes
              </div>
            )}
            {remoteStreams.map(({ participantId, stream }) => (
              <div key={participantId} className="relative aspect-video overflow-hidden rounded-2xl bg-zinc-900">
                <video
                  autoPlay
                  playsInline
                  data-testid={`remote-video-${participantId}`}
                  ref={(el) => {
                    if (el && el.srcObject !== stream) {
                      el.srcObject = stream;
                    }
                  }}
                  className="h-full w-full object-cover"
                />
                <p className="absolute bottom-2 left-3 text-sm text-white/90">
                  {participants.find((participant) => participant.participantId === participantId)?.name ?? "participante"}
                </p>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleMic}
              aria-label={micOn ? "desligar microfone" : "ligar microfone"}
              className={`flex h-12 w-12 items-center justify-center rounded-full text-white transition ${micOn ? "bg-zinc-800 hover:bg-zinc-700" : "bg-red-600 hover:bg-red-700"}`}
            >
              {micOn ? "mic" : "mudo"}
            </button>
            <button
              type="button"
              onClick={toggleCamera}
              aria-label={cameraOn ? "desligar camera" : "ligar camera"}
              className={`flex h-12 w-12 items-center justify-center rounded-full text-white transition ${cameraOn ? "bg-zinc-800 hover:bg-zinc-700" : "bg-red-600 hover:bg-red-700"}`}
            >
              {cameraOn ? "cam" : "cam off"}
            </button>
            <button
              type="button"
              onClick={handleShareScreen}
              aria-label={sharing ? "parar de compartilhar a tela" : "compartilhar tela"}
              className={`flex h-12 items-center justify-center rounded-full px-5 text-sm font-medium text-white transition ${sharing ? "bg-blue-700 hover:bg-blue-800" : "bg-zinc-800 hover:bg-zinc-700"}`}
            >
              {sharing ? "parar" : "compartilhar tela"}
            </button>
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label="alternar tela cheia"
              className="flex h-12 items-center justify-center rounded-full bg-zinc-800 px-5 text-sm font-medium text-white transition hover:bg-zinc-700"
            >
              tela cheia
            </button>
            <button
              type="button"
              onClick={handleLeave}
              className="flex h-12 items-center justify-center rounded-full bg-red-600 px-6 text-sm font-medium text-white transition hover:bg-red-700"
            >
              sair da reuniao
            </button>
          </div>

          {participantsOpen && (
            <aside className="absolute right-4 bottom-40 top-28 flex w-80 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg">
              <div className="border-b border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-900">participantes</div>
              <div className="flex-1 overflow-y-auto px-4 py-3">
                {participants.map((participant) => (
                  <div key={participant.participantId} className="mb-3 flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-700 text-xs font-medium text-white">
                      {participant.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm text-zinc-800">{participant.name}</span>
                    {participant.participantId === selfId && (
                      <span className="text-xs text-zinc-400">(voce)</span>
                    )}
                  </div>
                ))}
              </div>
            </aside>
          )}

          {chatOpen && (
            <aside className="absolute right-4 bottom-40 top-28 flex w-80 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg">
              <div className="border-b border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-900">chat</div>
              <div className="flex-1 overflow-y-auto px-4 py-3">
                {chatMessages.length === 0 && <p className="text-sm text-zinc-400">nenhuma mensagem ainda</p>}
                {chatMessages.map((message, index) => (
                  <div key={index} className="mb-2">
                    <span className="text-xs font-medium text-zinc-500">{message.name}</span>
                    <p className="text-sm text-zinc-800">{message.text}</p>
                  </div>
                ))}
              </div>
              <form
                className="flex items-center gap-2 border-t border-zinc-200 p-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  sendChatMessage();
                }}
              >
                <input
                  type="text"
                  value={chatText}
                  onChange={(event) => setChatText(event.target.value)}
                  placeholder="escreva uma mensagem"
                  aria-label="mensagem do chat"
                  className="flex-1 rounded-full border border-zinc-300 px-4 py-2 text-sm text-zinc-800 outline-none focus:border-blue-700"
                />
                <button
                  type="submit"
                  className="rounded-full bg-blue-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-800"
                >
                  enviar
                </button>
              </form>
            </aside>
          )}
        </main>
      </div>
    );
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
                onClick={handleJoin}
                disabled={joining}
                className="rounded-full bg-blue-700 px-6 py-3 text-sm font-medium text-white transition hover:bg-blue-800 disabled:opacity-60"
              >
                {joining ? "entrando..." : "entrar na reuniao"}
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className="rounded-full border border-zinc-300 px-6 py-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
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
