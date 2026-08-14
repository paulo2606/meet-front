"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { HubConnectionBuilder, type HubConnection } from "@microsoft/signalr";
import { useAuth } from "@/components/auth-context";
import { Avatar } from "@/components/avatar";
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
  photoUrl: string | null;
};

type ChatMessage = {
  participantId: string;
  name: string;
  text: string;
};

type MediaDeviceOption = {
  deviceId: string;
  label: string;
};

function deviceOptions(devices: MediaDeviceOption[], selected: string): MediaDeviceOption[] {
  const selectedOption =
    devices.find((device) => device.deviceId === selected) ?? { deviceId: "default", label: "padrão" };
  return [selectedOption, ...devices.filter((device) => device.deviceId !== selected)];
}

type LocalTileProps = {
  name: string;
  photoUrl: string | null | undefined;
  cameraOn: boolean;
  onVideoReady: (el: HTMLVideoElement | null) => void;
};

function LocalTile({ name, photoUrl, cameraOn, onVideoReady }: LocalTileProps) {
  if (!cameraOn) {
    return (
      <div
        className="relative aspect-video overflow-hidden rounded-box bg-room-tile ring-1 ring-room-line"
        data-testid="local-photo"
      >
        <div className="flex h-full w-full items-center justify-center">
          <div className="h-24 w-24 overflow-hidden rounded-full ring-4 ring-room-line">
            <Avatar photoUrl={photoUrl} name={name} />
          </div>
        </div>
        <p className="absolute bottom-2 left-3 text-sm text-white/90">{name}</p>
      </div>
    );
  }
  return (
    <div className="relative aspect-video overflow-hidden rounded-box bg-black ring-1 ring-room-line">
      <video
        autoPlay
        muted
        playsInline
        data-testid="local-video"
        ref={onVideoReady}
        className="h-full w-full object-cover"
      />
      <p className="absolute bottom-2 left-3 text-sm text-white/90">{name}</p>
    </div>
  );
}

type RemoteTileProps = {
  participantId: string;
  stream: MediaStream;
  name: string;
  photoUrl: string | null | undefined;
  cameraOff: boolean;
};

function MicLevelMeter({ level }: { level: number }) {
  return (
    <div
      role="meter"
      aria-label="nível do microfone"
      aria-valuenow={Math.round(level * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="flex h-8 items-end gap-0.5"
    >
      {Array.from({ length: 12 }, (_, index) => (
        <span
          key={index}
          className={`w-1.5 rounded-sm ${(index + 1) / 12 <= level ? "bg-accent" : "bg-line"}`}
          style={{ height: `${((index + 1) / 12) * 100}%` }}
        />
      ))}
    </div>
  );
}

function RemoteTile({ participantId, stream, name, photoUrl, cameraOff }: RemoteTileProps) {
  if (cameraOff) {
    return (
      <div
        className="relative aspect-video overflow-hidden rounded-box bg-room-tile ring-1 ring-room-line"
        data-testid={`remote-photo-${participantId}`}
      >
        <div className="flex h-full w-full items-center justify-center">
          <div className="h-24 w-24 overflow-hidden rounded-full ring-4 ring-room-line">
            <Avatar photoUrl={photoUrl} name={name} />
          </div>
        </div>
        <p className="absolute bottom-2 left-3 text-sm text-white/90">{name}</p>
      </div>
    );
  }
  return (
    <div className="relative aspect-video overflow-hidden rounded-box bg-black ring-1 ring-room-line">
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
      <p className="absolute bottom-2 left-3 text-sm text-white/90">{name}</p>
    </div>
  );
}

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
  const [camerasOff, setCamerasOff] = useState<Record<string, boolean>>({});
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
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [previewMicOn, setPreviewMicOn] = useState(true);
  const [previewCameraOn, setPreviewCameraOn] = useState(true);
  const [micLevel, setMicLevel] = useState(0);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceOption[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceOption[]>([]);
  const [audioDeviceId, setAudioDeviceId] = useState("default");
  const [videoDeviceId, setVideoDeviceId] = useState("default");
  const [deviceError, setDeviceError] = useState("");
  const previewStreamRef = useRef<MediaStream | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewAudioContextRef = useRef<AudioContext | null>(null);
  const previewAnalyserRef = useRef<AnalyserNode | null>(null);
  const previewRafRef = useRef<number | null>(null);
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

  const stopMicMeter = useCallback(() => {
    if (previewRafRef.current !== null) {
      cancelAnimationFrame(previewRafRef.current);
      previewRafRef.current = null;
    }
    previewAnalyserRef.current?.disconnect?.();
    previewAnalyserRef.current = null;
    void previewAudioContextRef.current?.close?.();
    previewAudioContextRef.current = null;
  }, []);

  const startMicMeter = useCallback(
    (stream: MediaStream) => {
      try {
        if (typeof window.AudioContext === "undefined") {
          return;
        }
        const context = new window.AudioContext();
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        previewAudioContextRef.current = context;
        previewAnalyserRef.current = analyser;
        const data = new Uint8Array(analyser.fftSize);
        const loop = () => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (const sample of data) {
            const value = (sample - 128) / 128;
            sum += value * value;
          }
          setMicLevel(Math.sqrt(sum / data.length));
          previewRafRef.current = requestAnimationFrame(loop);
        };
        previewRafRef.current = requestAnimationFrame(loop);
      } catch {
        stopMicMeter();
      }
    },
    [stopMicMeter],
  );

  const refreshDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAudioDevices(
        devices
          .filter((device) => device.kind === "audioinput")
          .map(({ deviceId, label }) => ({ deviceId, label })),
      );
      setVideoDevices(
        devices
          .filter((device) => device.kind === "videoinput")
          .map(({ deviceId, label }) => ({ deviceId, label })),
      );
    } catch {
      setAudioDevices([]);
      setVideoDevices([]);
    }
  }, []);

  const startPreview = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      previewStreamRef.current?.getTracks().forEach((track) => track.stop());
      previewStreamRef.current = stream;
      setMicLevel(0);
      setPreviewMicOn(true);
      setPreviewCameraOn(true);
      setPreviewing(true);
      setAudioDeviceId("default");
      setVideoDeviceId("default");
      setDeviceError("");
      stopMicMeter();
      startMicMeter(stream);
      await refreshDevices();
    } catch {
      setPreviewing(false);
      setPreviewError("nao foi possivel acessar camera e microfone");
    }
  }, [startMicMeter, stopMicMeter, refreshDevices]);

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        previewStreamRef.current = stream;
        setMicLevel(0);
        setPreviewMicOn(true);
        setPreviewCameraOn(true);
        setPreviewing(true);
        startMicMeter(stream);
        void refreshDevices();
      })
      .catch(() => {
        if (!cancelled) {
          setPreviewing(false);
          setPreviewError("nao foi possivel acessar camera e microfone");
        }
      });
    return () => {
      stopMicMeter();
      previewStreamRef.current?.getTracks().forEach((track) => track.stop());
      previewStreamRef.current = null;
      cancelled = true;
    };
  }, [startMicMeter, stopMicMeter, refreshDevices]);

  function togglePreviewMic() {
    const next = !previewMicOn;
    previewStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = next;
    });
    setPreviewMicOn(next);
    if (!next) {
      setMicLevel(0);
    }
  }

  function togglePreviewCamera() {
    const next = !previewCameraOn;
    previewStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = next;
    });
    setPreviewCameraOn(next);
  }

  async function switchDevices(audioId: string, videoId: string) {
    setDeviceError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioId === "default" ? true : { deviceId: { exact: audioId } },
        video: videoId === "default" ? true : { deviceId: { exact: videoId } },
      });
      previewStreamRef.current?.getTracks().forEach((track) => track.stop());
      previewStreamRef.current = stream;
      if (previewVideoRef.current) {
        previewVideoRef.current.srcObject = stream;
      }
      setAudioDeviceId(audioId);
      setVideoDeviceId(videoId);
      stopMicMeter();
      startMicMeter(stream);
      setMicLevel(0);
      setPreviewing(true);
    } catch {
      setDeviceError("nao foi possivel usar o dispositivo selecionado");
    }
  }

  async function handleJoin() {
    setJoining(true);
    setError("");
    try {
      const stream = previewStreamRef.current;
      localStreamRef.current = stream;
      const initialCameraOn = stream ? previewCameraOn : false;
      const initialMicOn = stream ? previewMicOn : false;
      setCameraOn(initialCameraOn);
      setMicOn(initialMicOn);
      if (stream) {
        cameraTrackRef.current = stream.getVideoTracks()[0] ?? null;
        stream.getVideoTracks().forEach((track) => {
          track.enabled = initialCameraOn;
        });
        stream.getAudioTracks().forEach((track) => {
          track.enabled = initialMicOn;
        });
      } else {
        cameraTrackRef.current = null;
      }
      stopMicMeter();
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      const connection = new HubConnectionBuilder().withUrl(`${API_URL}/hubs/meeting`).build();
      hubRef.current = connection;
      participantIdRef.current = newParticipantId();
      setSelfId(participantIdRef.current);
      const selfName = user?.name ?? "Convidado";
      const selfPhotoUrl = user?.photoUrl ?? null;
      setParticipants([{ participantId: participantIdRef.current, name: selfName, photoUrl: selfPhotoUrl }]);

      const addParticipant = (participant: Participant) => {
        setParticipants((prev) =>
          prev.some((existing) => existing.participantId === participant.participantId) ? prev : [...prev, participant],
        );
      };

      connection.on("Peers", (peers: Participant[]) => {
        peers.forEach((peer) => {
          addParticipant({ ...peer, photoUrl: peer.photoUrl ?? null });
          createPeer(peer.participantId, true);
        });
      });
      connection.on("PeerJoined", (participantId: string, name: string, photoUrl?: string | null) => {
        addParticipant({ participantId, name, photoUrl: photoUrl ?? null });
        createPeer(participantId, false);
      });
      connection.on("PeerLeft", (participantId: string) => {
        removePeer(participantId);
        setParticipants((prev) => prev.filter((participant) => participant.participantId !== participantId));
        setCamerasOff((prev) => {
          const next = { ...prev };
          delete next[participantId];
          return next;
        });
        setSharingParticipantId((current) => (current === participantId ? null : current));
      });
      connection.on("CameraState", (participantId: string, on: boolean) => {
        setCamerasOff((prev) => ({ ...prev, [participantId]: !on }));
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
      await connection.invoke("Join", id, participantIdRef.current, selfName, selfPhotoUrl);
      if (!initialCameraOn && hubRef.current) {
        hubRef.current.invoke("CameraState", id, false).catch(() => undefined);
      }
      setJoined(true);
    } catch {
      setError("nao foi possivel entrar na reuniao");
      setJoined(false);
      stopMicMeter();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      previewStreamRef.current = null;
      setPreviewing(false);
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
    setCamerasOff({});
    setChatMessages([]);
    setChatOpen(false);
    setSharing(false);
    setSharingParticipantId(null);
    setShowAllCameras(false);
    setLocalScreenStream(null);
    setJoined(false);
    await hubRef.current?.stop();
    hubRef.current = null;
    stopMicMeter();
    previewStreamRef.current = null;
    setPreviewing(false);
    void startPreview();
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
    const next = !cameraOn;
    localStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = next;
    });
    setCameraOn(next);
    hubRef.current?.invoke("CameraState", id, next).catch(() => undefined);
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
      newParticipants.push({ participantId: `mock-${index + 1}`, name, photoUrl: null });
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
            <div className="h-9 w-9 overflow-hidden rounded-full bg-accent">
              <Avatar photoUrl={user?.photoUrl} name={user?.name ?? "Convidado"} />
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
                      <div key={tile.key}>
                        <LocalTile
                          name={user?.name ?? "Convidado"}
                          photoUrl={user?.photoUrl}
                          cameraOn={cameraOn}
                          onVideoReady={(el) => {
                            localVideoRef.current = el;
                            if (el && localStreamRef.current && el.srcObject !== localStreamRef.current) {
                              el.srcObject = localStreamRef.current;
                            }
                          }}
                        />
                      </div>
                    ) : (
                      <div key={tile.key}>
                        <RemoteTile
                          participantId={tile.key}
                          stream={tile.stream}
                          name={participants.find((participant) => participant.participantId === tile.key)?.name ?? "participante"}
                          photoUrl={participants.find((participant) => participant.participantId === tile.key)?.photoUrl}
                          cameraOff={camerasOff[tile.key] ?? false}
                        />
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
                  <LocalTile
                    name={user?.name ?? "Convidado"}
                    photoUrl={user?.photoUrl}
                    cameraOn={cameraOn}
                    onVideoReady={(el) => {
                      localVideoRef.current = el;
                      if (el && localStreamRef.current && el.srcObject !== localStreamRef.current) {
                        el.srcObject = localStreamRef.current;
                      }
                    }}
                  />
                  {visibleCameraStreams.map(({ participantId, stream }) => (
                    <div key={participantId}>
                      <RemoteTile
                        participantId={participantId}
                        stream={stream}
                        name={participants.find((participant) => participant.participantId === participantId)?.name ?? "participante"}
                        photoUrl={participants.find((participant) => participant.participantId === participantId)?.photoUrl}
                        cameraOff={camerasOff[participantId] ?? false}
                      />
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
                    <div key={tile.key}>
                      <LocalTile
                        name={user?.name ?? "Convidado"}
                        photoUrl={user?.photoUrl}
                        cameraOn={cameraOn}
                        onVideoReady={(el) => {
                          localVideoRef.current = el;
                          if (el && localStreamRef.current && el.srcObject !== localStreamRef.current) {
                            el.srcObject = localStreamRef.current;
                          }
                        }}
                      />
                    </div>
                  ) : (
                    <div key={tile.key}>
                      <RemoteTile
                        participantId={tile.key}
                        stream={tile.stream}
                        name={participants.find((participant) => participant.participantId === tile.key)?.name ?? "participante"}
                        photoUrl={participants.find((participant) => participant.participantId === tile.key)?.photoUrl}
                        cameraOff={camerasOff[tile.key] ?? false}
                      />
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
                    <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-accent">
                      <Avatar photoUrl={participant.photoUrl} name={participant.name} />
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
            <div className="h-9 w-9 overflow-hidden rounded-full bg-accent">
              <Avatar photoUrl={user.photoUrl} name={user.name} />
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
            <div className="w-full">
              {previewing ? (
                <>
                  <div className="relative aspect-video w-full overflow-hidden rounded-box bg-black ring-1 ring-room-line">
                    <video
                      autoPlay
                      muted
                      playsInline
                      data-testid="preview-video"
                      ref={(el) => {
                        previewVideoRef.current = el;
                        if (el && previewStreamRef.current && el.srcObject !== previewStreamRef.current) {
                          el.srcObject = previewStreamRef.current;
                        }
                      }}
                      className="h-full w-full object-cover"
                    />
                    {!previewCameraOn && (
                      <div className="absolute inset-0 flex items-center justify-center bg-room-tile">
                        <div className="h-24 w-24 overflow-hidden rounded-full ring-4 ring-room-line">
                          <Avatar photoUrl={user?.photoUrl} name={user?.name ?? "Convidado"} />
                        </div>
                      </div>
                    )}
                    <p className="absolute bottom-2 left-3 text-sm text-white/90">{user?.name ?? "Convidado"}</p>
                  </div>
                  <div className="mt-4 flex items-center justify-center gap-3">
                    <MicLevelMeter level={micLevel} />
                    <button
                      type="button"
                      onClick={togglePreviewMic}
                      aria-label={previewMicOn ? "desligar microfone no preview" : "ligar microfone no preview"}
                      aria-pressed={!previewMicOn}
                      className={`flex h-11 w-11 items-center justify-center rounded-box border transition ${
                        previewMicOn
                          ? "border-line bg-surface text-ink hover:border-accent hover:text-accent"
                          : "border-danger bg-danger text-white"
                      }`}
                    >
                      {previewMicOn ? <MicIcon className="h-5 w-5" /> : <MicOffIcon className="h-5 w-5" />}
                    </button>
                    <button
                      type="button"
                      onClick={togglePreviewCamera}
                      aria-label={previewCameraOn ? "desligar camera no preview" : "ligar camera no preview"}
                      aria-pressed={!previewCameraOn}
                      className={`flex h-11 w-11 items-center justify-center rounded-box border transition ${
                        previewCameraOn
                          ? "border-line bg-surface text-ink hover:border-accent hover:text-accent"
                          : "border-danger bg-danger text-white"
                      }`}
                    >
                      {previewCameraOn ? <CameraIcon className="h-5 w-5" /> : <CameraOffIcon className="h-5 w-5" />}
                    </button>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-4">
                    <label className="flex flex-col items-start gap-1 text-xs font-medium text-ink-3">
                      microfone
                      <select
                        aria-label="microfone do preview"
                        value={audioDeviceId}
                        onChange={(event) => void switchDevices(event.target.value, videoDeviceId)}
                        className="rounded-box border border-line bg-surface px-3 py-2 text-sm text-ink outline-none transition focus:border-accent"
                      >
                        {deviceOptions(audioDevices, audioDeviceId).map((device) => (
                          <option key={device.deviceId} value={device.deviceId}>
                            {device.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col items-start gap-1 text-xs font-medium text-ink-3">
                      câmera
                      <select
                        aria-label="câmera do preview"
                        value={videoDeviceId}
                        onChange={(event) => void switchDevices(audioDeviceId, event.target.value)}
                        className="rounded-box border border-line bg-surface px-3 py-2 text-sm text-ink outline-none transition focus:border-accent"
                      >
                        {deviceOptions(videoDevices, videoDeviceId).map((device) => (
                          <option key={device.deviceId} value={device.deviceId}>
                            {device.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {deviceError && (
                    <p role="alert" className="mt-3 text-sm text-danger">
                      {deviceError}
                    </p>
                  )}
                </>
              ) : (
                <div className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-box bg-room text-room-ink-3">
                  <CameraOffIcon className="h-8 w-8" />
                  <p>{previewError || "câmera desativada"}</p>
                  <button
                    type="button"
                    onClick={() => void startPreview()}
                    className="text-sm font-medium text-accent-bright transition hover:underline"
                  >
                    tentar novamente
                  </button>
                </div>
              )}
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
