"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { HubConnectionBuilder, type HubConnection } from "@microsoft/signalr";
import { useAuth } from "@/components/auth-context";
import {
  CameraIcon,
  CameraOffIcon,
  ChatIcon,
  CheckIcon,
  CloseIcon,
  CopyIcon,
  FullscreenIcon,
  LeaveIcon,
  Logo,
  MicIcon,
  MicOffIcon,
  ScreenShareIcon,
  SendIcon,
  StopScreenShareIcon,
  UsersIcon,
} from "@/components/logo";
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
  const [copyError, setCopyError] = useState(false);
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
  const [sharingParticipantId, setSharingParticipantId] = useState<string | null>(null);
  const [showAllCameras, setShowAllCameras] = useState(false);
  const [cameraPage, setCameraPage] = useState(0);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
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
  const mockStreamsRef = useRef<MediaStream[]>([]);

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
      mockStreamsRef.current.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
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
        setSharingParticipantId((current) => (current === participantId ? null : current));
      });
      connection.on("ScreenShare", (participantId: string, sharingActive: boolean) => {
        setShowAllCameras(false);
        setSharingParticipantId((current) => (sharingActive ? participantId : current === participantId ? null : current));
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
    mockStreamsRef.current.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
    mockStreamsRef.current = [];
    setRemoteStreams([]);
    setParticipants([]);
    setChatMessages([]);
    setChatOpen(false);
    setSharing(false);
    setSharingParticipantId(null);
    setShowAllCameras(false);
    setLocalScreenStream(null);
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
      setShowAllCameras(false);
      setSharing(true);
      setSharingParticipantId(participantIdRef.current);
      setLocalScreenStream(screenStream);
      hubRef.current?.invoke("ScreenShare", id, true).catch(() => undefined);
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
    setSharingParticipantId((current) => (current === participantIdRef.current ? null : current));
    setLocalScreenStream(null);
    hubRef.current?.invoke("ScreenShare", id, false).catch(() => undefined);
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

  const addMockCameras = useCallback(() => {
    const guardCanvas = document.createElement("canvas");
    if (typeof guardCanvas.captureStream !== "function" || mockStreamsRef.current.length > 0) {
      return;
    }
    const colors = ["#0f766e", "#c2410c", "#15803d", "#7c3aed", "#b91c1c"];
    const newStreams: RemoteStream[] = [];
    const newParticipants: Participant[] = [];
    for (let index = 0; index < 10; index++) {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 180;
      const context = canvas.getContext("2d");
      const name = `mock ${index + 1}`;
      if (context) {
        context.fillStyle = colors[index % colors.length];
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "#ffffff";
        context.font = "26px sans-serif";
        context.fillText(name, 16, 100);
      }
      const stream = canvas.captureStream(5);
      mockStreamsRef.current.push(stream);
      newStreams.push({ participantId: `mock-${index + 1}`, stream });
      newParticipants.push({ participantId: `mock-${index + 1}`, name });
    }
    setRemoteStreams((prev) => [...prev, ...newStreams]);
    setParticipants((prev) => [...prev, ...newParticipants]);
  }, []);

  useEffect(() => {
    if (joined) {
      addMockCameras();
    }
  }, [joined, addMockCameras]);

  const screenStream =
    sharing
      ? localScreenStream
      : sharingParticipantId
        ? remoteStreams.find((remote) => remote.participantId === sharingParticipantId)?.stream ?? null
        : null;
  const sharerName = sharing
    ? "minha tela"
    : sharingParticipantId
      ? participants.find((participant) => participant.participantId === sharingParticipantId)?.name ?? "participante"
      : "tela";
  const cameraStreams = remoteStreams.filter((remote) => remote.participantId !== sharingParticipantId);
  const displayedRemoteStreams = screenStream ? cameraStreams : remoteStreams;
  const hiddenCameraCount = Math.max(0, displayedRemoteStreams.length - 2);
  const visibleCameraStreams = showAllCameras ? displayedRemoteStreams : displayedRemoteStreams.slice(0, 2);
  const gridTiles: ({ key: string; kind: "local" } | { key: string; kind: "remote"; stream: MediaStream })[] = [
    { key: "local", kind: "local" },
    ...remoteStreams.map((remote) => ({ key: remote.participantId, kind: "remote" as const, stream: remote.stream })),
  ];
  const totalPages = Math.max(1, Math.ceil(gridTiles.length / 9));
  const currentPage = Math.min(cameraPage, totalPages - 1);
  const pageTiles = gridTiles.slice(currentPage * 9, currentPage * 9 + 9);
  const featuredTiles: (
    | { key: string; kind: "screen" }
    | { key: string; kind: "local" }
    | { key: string; kind: "remote"; stream: MediaStream }
  )[] = [
    { key: "screen", kind: "screen" },
    { key: "local", kind: "local" },
    ...cameraStreams.map((remote) => ({ key: remote.participantId, kind: "remote" as const, stream: remote.stream })),
  ];
  const featuredTotalPages = Math.max(1, Math.ceil(featuredTiles.length / 9));
  const featuredCurrentPage = Math.min(cameraPage, featuredTotalPages - 1);
  const featuredPageTiles = featuredTiles.slice(featuredCurrentPage * 9, featuredCurrentPage * 9 + 9);

  async function handleCopy() {
    setCopyError(false);
    if (!navigator.clipboard) {
      setCopyError(true);
      return;
    }
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError(true);
    }
  }

  async function handleRetry() {
    setError("");
    setMeeting(null);
    try {
      const data = await authRequest<MeetingResponse>(`/api/meetings/${id}`);
      setMeeting(data);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? "reuniao nao encontrada" : "nao foi possivel carregar a reuniao");
    }
  }

  if (joined) {
    return (
      <div data-room className="flex min-h-dvh flex-col overflow-hidden bg-room text-room-ink">
        <header className="flex shrink-0 items-center justify-between border-b border-room-line px-6 py-4">
          <Logo />
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-medium text-white">
              {(user?.name ?? "Convidado").charAt(0).toUpperCase()}
            </div>
            <span className="text-sm text-room-ink-2">{user?.name ?? "Convidado"}</span>
          </div>
        </header>

        <main
          id="main"
          className="relative flex min-h-0 flex-1 flex-col px-6 pb-3"
        >
          <div className="flex w-full max-w-5xl shrink-0 items-center justify-end gap-2 pt-3">
            <button
              type="button"
              onClick={() => {
                setParticipantsOpen(true);
                setChatOpen(false);
              }}
              aria-pressed={participantsOpen}
              className={`flex items-center gap-2 rounded-box px-4 py-2 text-sm font-medium transition ${participantsOpen ? "bg-accent text-white" : "border border-room-line text-room-ink-2 hover:bg-room-tile hover:text-room-ink"}`}
            >
              <UsersIcon className="h-4 w-4" />
              participantes ({participants.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setChatOpen(true);
                setParticipantsOpen(false);
              }}
              aria-pressed={chatOpen}
              className={`flex items-center gap-2 rounded-box px-4 py-2 text-sm font-medium transition ${chatOpen ? "bg-accent text-white" : "border border-room-line text-room-ink-2 hover:bg-room-tile hover:text-room-ink"}`}
            >
              <ChatIcon className="h-4 w-4" />
              chat {chatMessages.length > 0 ? `(${chatMessages.length})` : ""}
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-hidden">
            {screenStream ? (
            showAllCameras ? (
              <>
                <div className="flex w-full max-w-5xl items-center justify-center gap-3">
                  {featuredTotalPages > 1 && (
                    <button
                      type="button"
                      aria-label="pagina anterior"
                      disabled={featuredCurrentPage === 0}
                      onClick={() => setCameraPage((page) => Math.max(0, page - 1))}
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-box border text-sm transition ${featuredCurrentPage === 0 ? "cursor-not-allowed border-room-line text-room-ink-3" : "border-room-line text-room-ink-2 hover:bg-room-tile hover:text-room-ink"}`}
                    >
                      ←
                    </button>
                  )}
                  <div className="grid min-w-0 flex-1 grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-4">
                  {featuredPageTiles.map((tile) =>
                    tile.kind === "screen" ? (
                      <div key={tile.key} className="relative aspect-video overflow-hidden rounded-box bg-black ring-1 ring-room-line">
                        <video
                          autoPlay
                          muted={sharing}
                          playsInline
                          data-testid="screen-video"
                          ref={(el) => {
                            if (el && screenStream && el.srcObject !== screenStream) {
                              el.srcObject = screenStream;
                            }
                          }}
                          className="h-full w-full object-contain"
                        />
                        <p className="absolute bottom-2 left-3 text-sm text-white/90">{sharerName}</p>
                      </div>
                    ) : tile.kind === "local" ? (
                      <div key={tile.key} className="relative aspect-video overflow-hidden rounded-box bg-black ring-1 ring-room-line">
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
                        {!cameraOn && (
                          <p className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-room-ink-3">
                            <CameraOffIcon className="h-5 w-5" />
                            camera desativada
                          </p>
                        )}
                        <p className="absolute bottom-2 left-3 text-sm text-white/90">{user?.name ?? "Convidado"}</p>
                      </div>
                    ) : (
                      <div key={tile.key} className="relative aspect-video overflow-hidden rounded-box bg-black ring-1 ring-room-line">
                        <video
                          autoPlay
                          playsInline
                          data-testid={`remote-video-${tile.key}`}
                          ref={(el) => {
                            if (el && el.srcObject !== tile.stream) {
                              el.srcObject = tile.stream;
                            }
                          }}
                          className="h-full w-full object-cover"
                        />
                        <p className="absolute bottom-2 left-3 text-sm text-white/90">
                          {participants.find((participant) => participant.participantId === tile.key)?.name ?? "participante"}
                        </p>
                      </div>
                    ),
                  )}
                  </div>
                  {featuredTotalPages > 1 && (
                    <button
                      type="button"
                      aria-label="proxima pagina"
                      disabled={featuredCurrentPage >= featuredTotalPages - 1}
                      onClick={() => setCameraPage((page) => page + 1)}
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-box border text-sm transition ${featuredCurrentPage >= featuredTotalPages - 1 ? "cursor-not-allowed border-room-line text-room-ink-3" : "border-room-line text-room-ink-2 hover:bg-room-tile hover:text-room-ink"}`}
                    >
                      →
                    </button>
                  )}
                </div>
                {featuredTotalPages > 1 && (
                  <span className="min-w-[3rem] text-center text-sm text-room-ink-3">
                    {featuredCurrentPage + 1} / {featuredTotalPages}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setShowAllCameras(false)}
                  className="rounded-box border border-room-line px-4 py-2 text-sm font-medium text-room-ink-2 transition hover:bg-room-tile hover:text-room-ink"
                >
                  voltar para a tela
                </button>
              </>
            ) : (
              <div className="flex w-full max-w-6xl items-start gap-4">
                <div className="flex w-56 shrink-0 flex-col gap-3">
                  <div className="relative aspect-video overflow-hidden rounded-box bg-black ring-1 ring-room-line">
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
                    {!cameraOn && (
                      <p className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-room-ink-3">
                        <CameraOffIcon className="h-5 w-5" />
                        camera desativada
                      </p>
                    )}
                    <p className="absolute bottom-2 left-3 text-sm text-white/90">{user?.name ?? "Convidado"}</p>
                  </div>
                  {visibleCameraStreams.map(({ participantId, stream }) => (
                    <div key={participantId} className="relative aspect-video overflow-hidden rounded-box bg-black ring-1 ring-room-line">
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
                  {hiddenCameraCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowAllCameras((value) => !value)}
                      className="flex aspect-video w-full items-center justify-center gap-2 rounded-box bg-room-tile text-sm font-medium text-room-ink-2 transition hover:bg-black hover:text-room-ink"
                    >
                      <CameraIcon className="h-5 w-5" />
                      {`+${hiddenCameraCount} participantes`}
                    </button>
                  )}
                </div>
                <div className="relative aspect-video flex-1 overflow-hidden rounded-box bg-black ring-1 ring-room-line">
                  <video
                    autoPlay
                    muted={sharing}
                    playsInline
                    data-testid="screen-video"
                    ref={(el) => {
                      if (el && screenStream && el.srcObject !== screenStream) {
                        el.srcObject = screenStream;
                      }
                    }}
                    className="h-full w-full object-contain"
                  />
                  <p className="absolute bottom-2 left-3 text-sm text-white/90">{sharerName}</p>
                </div>
              </div>
            )
          ) : (
            <>
              <div className="flex w-full max-w-5xl items-center justify-center gap-3">
                {totalPages > 1 && (
                  <button
                    type="button"
                    aria-label="pagina anterior"
                    disabled={currentPage === 0}
                    onClick={() => setCameraPage((page) => Math.max(0, page - 1))}
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-box border text-sm transition ${currentPage === 0 ? "cursor-not-allowed border-room-line text-room-ink-3" : "border-room-line text-room-ink-2 hover:bg-room-tile hover:text-room-ink"}`}
                  >
                    ←
                  </button>
                )}
                <div className="grid min-w-0 flex-1 grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-4">
                {pageTiles.map((tile) =>
                  tile.kind === "local" ? (
                    <div key={tile.key} className="relative aspect-video overflow-hidden rounded-box bg-black ring-1 ring-room-line">
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
                      {!cameraOn && (
                        <p className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-room-ink-3">
                          <CameraOffIcon className="h-5 w-5" />
                          camera desativada
                        </p>
                      )}
                      <p className="absolute bottom-2 left-3 text-sm text-white/90">{user?.name ?? "Convidado"}</p>
                    </div>
                  ) : (
                    <div key={tile.key} className="relative aspect-video overflow-hidden rounded-box bg-black ring-1 ring-room-line">
                      <video
                        autoPlay
                        playsInline
                        data-testid={`remote-video-${tile.key}`}
                        ref={(el) => {
                          if (el && el.srcObject !== tile.stream) {
                            el.srcObject = tile.stream;
                          }
                        }}
                        className="h-full w-full object-cover"
                      />
                      <p className="absolute bottom-2 left-3 text-sm text-white/90">
                        {participants.find((participant) => participant.participantId === tile.key)?.name ?? "participante"}
                      </p>
                    </div>
                  ),
                )}
                {remoteStreams.length === 0 && (
                  <div className="flex aspect-video items-center justify-center rounded-box bg-room-tile text-sm text-room-ink-3">
                    aguardando outros participantes
                  </div>
                )}
                </div>
                {totalPages > 1 && (
                  <button
                    type="button"
                    aria-label="proxima pagina"
                    disabled={currentPage >= totalPages - 1}
                    onClick={() => setCameraPage((page) => page + 1)}
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-box border text-sm transition ${currentPage >= totalPages - 1 ? "cursor-not-allowed border-room-line text-room-ink-3" : "border-room-line text-room-ink-2 hover:bg-room-tile hover:text-room-ink"}`}
                  >
                    →
                  </button>
                )}
              </div>
              {totalPages > 1 && (
                <span className="min-w-[3rem] text-center text-sm text-room-ink-3">
                  {currentPage + 1} / {totalPages}
                </span>
              )}
            </>
          )}
          </div>

          <div className="flex shrink-0 items-center justify-center gap-3 pb-4 pt-3">
            <button
              type="button"
              onClick={toggleMic}
              aria-label={micOn ? "desligar microfone" : "ligar microfone"}
              aria-pressed={!micOn}
              className={`flex h-12 w-12 items-center justify-center rounded-box text-white transition ${micOn ? "bg-room-tile hover:bg-black" : "bg-danger hover:bg-danger-strong"}`}
            >
              {micOn ? <MicIcon className="h-5 w-5" /> : <MicOffIcon className="h-5 w-5" />}
            </button>
            <button
              type="button"
              onClick={toggleCamera}
              aria-label={cameraOn ? "desligar camera" : "ligar camera"}
              aria-pressed={!cameraOn}
              className={`flex h-12 w-12 items-center justify-center rounded-box text-white transition ${cameraOn ? "bg-room-tile hover:bg-black" : "bg-danger hover:bg-danger-strong"}`}
            >
              {cameraOn ? <CameraIcon className="h-5 w-5" /> : <CameraOffIcon className="h-5 w-5" />}
            </button>
            <button
              type="button"
              onClick={handleShareScreen}
              aria-label={sharing ? "parar de compartilhar a tela" : "compartilhar tela"}
              className={`flex h-12 items-center justify-center gap-2 rounded-box px-5 text-sm font-medium text-white transition ${sharing ? "bg-accent hover:bg-accent-strong" : "bg-room-tile hover:bg-black"}`}
            >
              {sharing ? <StopScreenShareIcon className="h-5 w-5" /> : <ScreenShareIcon className="h-5 w-5" />}
              {sharing ? "parar" : "compartilhar tela"}
            </button>
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label="alternar tela cheia"
              className="flex h-12 w-12 items-center justify-center rounded-box bg-room-tile text-white transition hover:bg-black"
            >
              <FullscreenIcon className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={handleLeave}
              className="flex h-12 items-center justify-center gap-2 rounded-box bg-danger px-6 text-sm font-medium text-white transition hover:bg-danger-strong"
            >
              <LeaveIcon className="h-5 w-5" />
              sair da reuniao
            </button>
          </div>

          {participantsOpen && (
            <aside className="absolute right-4 bottom-40 top-28 flex w-80 flex-col overflow-hidden rounded-box border border-room-line bg-room-surface shadow-ambient">
              <div className="flex items-center justify-between border-b border-room-line px-4 py-3 text-sm font-medium text-room-ink">
                participantes
                <button
                  type="button"
                  onClick={() => setParticipantsOpen(false)}
                  aria-label="fechar participantes"
                  className="flex h-8 w-8 items-center justify-center rounded-box text-room-ink-3 transition hover:bg-room-tile hover:text-room-ink"
                >
                  <CloseIcon className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3">
                {participants.map((participant) => (
                  <div key={participant.participantId} className="mb-3 flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-medium text-white">
                      {participant.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm text-room-ink">{participant.name}</span>
                    {participant.participantId === selfId && (
                      <span className="text-xs text-room-ink-3">(voce)</span>
                    )}
                  </div>
                ))}
              </div>
            </aside>
          )}

          {chatOpen && (
            <aside className="absolute right-4 bottom-40 top-28 flex w-80 flex-col overflow-hidden rounded-box border border-room-line bg-room-surface shadow-ambient">
              <div className="flex items-center justify-between border-b border-room-line px-4 py-3 text-sm font-medium text-room-ink">
                chat
                <button
                  type="button"
                  onClick={() => setChatOpen(false)}
                  aria-label="fechar chat"
                  className="flex h-8 w-8 items-center justify-center rounded-box text-room-ink-3 transition hover:bg-room-tile hover:text-room-ink"
                >
                  <CloseIcon className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3">
                {chatMessages.length === 0 && <p className="text-sm text-room-ink-3">nenhuma mensagem ainda</p>}
                {chatMessages.map((message, index) => (
                  <div key={index} className="mb-2 rounded-box bg-room-tile px-3 py-2">
                    <span className="text-xs font-medium text-room-ink-3">{message.name}</span>
                    <p className="text-sm text-room-ink">{message.text}</p>
                  </div>
                ))}
              </div>
              <form
                className="flex items-center gap-2 border-t border-room-line p-3"
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
                  className="flex-1 rounded-box border border-room-line bg-room px-4 py-2 text-sm text-room-ink outline-none transition placeholder:text-room-ink-3 focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
                <button
                  type="submit"
                  aria-label="enviar mensagem"
                  className="flex h-10 w-10 items-center justify-center rounded-box bg-accent text-white transition hover:bg-accent-strong"
                >
                  <SendIcon className="h-4 w-4" />
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
        <Logo />
        {user && (
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-medium text-white">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <span className="text-sm text-ink-2">{user.name}</span>
          </div>
        )}
      </header>

      <main
        id="main"
        className="flex flex-1 flex-col items-center justify-center gap-6 px-6 pb-16"
      >
        {error && !meeting && (
          <div
            role="alert"
            className="flex w-full max-w-lg flex-col items-center gap-4 rounded-box border border-line bg-surface p-8 text-center shadow-near"
          >
            <h1 className="font-display text-xl font-semibold text-ink">
              Algo deu errado
            </h1>
            <p className="text-danger">{error}</p>
            {error !== "reuniao nao encontrada" ? (
              <button
                type="button"
                onClick={handleRetry}
                className="rounded-box bg-accent px-6 py-2.5 text-sm font-medium text-white transition hover:bg-accent-strong"
              >
                tentar novamente
              </button>
            ) : (
              <Link
                href="/"
                className="rounded-box border border-line px-6 py-2.5 text-sm font-medium text-ink transition hover:border-accent hover:text-accent"
              >
                voltar ao inicio
              </Link>
            )}
          </div>
        )}

        {meeting && (
          <div className="flex w-full max-w-lg flex-col items-center gap-6 text-center">
            <div className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-box bg-room text-room-ink-3">
              <CameraOffIcon className="h-8 w-8" />
              câmera desativada
            </div>
            <div>
              <h1 className="font-display text-2xl font-semibold text-ink">
                Reunião com {meeting.hostName}
              </h1>
              <p className="mt-1 text-ink-3">
                código: <span className="font-mono font-semibold text-ink">{meeting.code}</span>
              </p>
            </div>
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={handleJoin}
                disabled={joining}
                aria-busy={joining}
                className="rounded-box bg-accent px-6 py-3 text-sm font-medium text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
              >
                {joining ? "entrando..." : "entrar na reuniao"}
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-2 rounded-box border border-line bg-surface px-6 py-3 text-sm font-medium text-ink transition hover:border-accent hover:text-accent"
              >
                {copied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
                {copied ? "link copiado" : "copiar link de convite"}
              </button>
              {copyError && (
                <p role="alert" className="text-sm text-danger">
                  nao foi possivel copiar o link
                </p>
              )}
              <p className="text-sm text-ink-3">convide alguém colando o link no navegador</p>
            </div>
          </div>
        )}

        {!meeting && !error && (
          <div className="flex w-full max-w-lg flex-col items-center gap-6" aria-busy="true" aria-live="polite">
            <h1 className="sr-only">Carregando reuniao</h1>
            <div className="h-40 w-full animate-pulse rounded-box bg-line" />
            <div className="flex w-full flex-col items-center gap-2">
              <div className="h-7 w-64 animate-pulse rounded-box bg-line" />
              <div className="h-4 w-40 animate-pulse rounded-box bg-line" />
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="h-11 w-48 animate-pulse rounded-box bg-line" />
              <div className="h-11 w-56 animate-pulse rounded-box bg-line" />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
