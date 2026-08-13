import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RoomPage from "@/app/room/[id]/page";
import type { MeetingResponse } from "@/lib/api";

const pushMock = vi.fn();
const authRequestMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useParams: () => ({ id: "meeting-1" }),
}));

vi.mock("@/components/auth-context", () => ({
  useAuth: () => ({
    user: { userId: "user-1", name: "Paulo", email: "paulo@test.com" },
    isLoading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    authRequest: authRequestMock,
  }),
}));

const { fakeConnections, FakeHubConnectionBuilder, FakeRTCPeerConnection } = vi.hoisted(() => {
  type Handler = (...args: never[]) => void;

  class FakeHubConnection {
    handlers = new Map<string, Handler>();
    invokes: { method: string; args: unknown[] }[] = [];
    started = false;
    stopped = false;

    on(name: string, handler: Handler) {
      this.handlers.set(name, handler);
    }

    invoke(method: string, ...args: unknown[]) {
      this.invokes.push({ method, args });
      return Promise.resolve();
    }

    start() {
      this.started = true;
      return Promise.resolve();
    }

    stop() {
      this.stopped = true;
      return Promise.resolve();
    }

    trigger<TArgs extends unknown[]>(name: string, ...args: TArgs) {
      const handler = this.handlers.get(name);
      if (handler) {
        (handler as unknown as (...handlerArgs: TArgs) => void)(...args);
      }
    }
  }

  class FakeHubConnectionBuilder {
    withUrl() {
      return this;
    }

    build() {
      const connection = new FakeHubConnection();
      fakeConnections.push(connection);
      return connection;
    }
  }

  class FakeRTCPeerConnection {
    static instances: FakeRTCPeerConnection[] = [];
    localDescription: RTCSessionDescriptionInit | null = null;
    remoteDescription: RTCSessionDescriptionInit | null = null;
    addedTracks: MediaStreamTrack[] = [];
    addedCandidate: unknown = null;
    createdOffer = false;
    createdAnswer = false;
    closed = false;
    onicecandidate: ((event: { candidate: unknown }) => void) | null = null;
    ontrack: ((event: { streams: MediaStream[] }) => void) | null = null;

    constructor(public config: RTCConfiguration) {
      FakeRTCPeerConnection.instances.push(this);
    }

    addTrack(track: MediaStreamTrack) {
      this.addedTracks.push(track);
    }

    createOffer() {
      this.createdOffer = true;
      return Promise.resolve({ type: "offer", sdp: "offer-sdp" });
    }

    createAnswer() {
      this.createdAnswer = true;
      return Promise.resolve({ type: "answer", sdp: "answer-sdp" });
    }

    setLocalDescription(description: RTCSessionDescriptionInit) {
      this.localDescription = description;
      return Promise.resolve();
    }

    setRemoteDescription(description: RTCSessionDescriptionInit) {
      this.remoteDescription = description;
      return Promise.resolve();
    }

    addIceCandidate(candidate: RTCIceCandidateInit) {
      this.addedCandidate = candidate;
      return Promise.resolve();
    }

    close() {
      this.closed = true;
    }
  }

  const fakeConnections: FakeHubConnection[] = [];
  return { fakeConnections, FakeHubConnectionBuilder, FakeRTCPeerConnection };
});

vi.mock("@microsoft/signalr", () => ({
  HubConnectionBuilder: FakeHubConnectionBuilder,
}));

const meeting: MeetingResponse = {
  id: "meeting-1",
  code: "ABC2345",
  createdAtUtc: "2026-08-13T00:00:00Z",
  hostName: "Paulo",
};

const fakeTrack = (kind: string) => ({ kind, enabled: true, stop: vi.fn() });
const videoTrack = fakeTrack("video");
const audioTrack = fakeTrack("audio");
const fakeStream = {
  getTracks: () => [videoTrack, audioTrack],
  getAudioTracks: () => [audioTrack],
  getVideoTracks: () => [videoTrack],
};
const getUserMediaMock = vi.fn();

describe("RoomPage WebRTC", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    authRequestMock.mockResolvedValue(meeting);
    fakeConnections.length = 0;
    FakeRTCPeerConnection.instances = [];
    Object.defineProperty(globalThis, "RTCPeerConnection", {
      value: FakeRTCPeerConnection,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis.crypto, "randomUUID", {
      value: () => "participant-1",
      configurable: true,
    });
    getUserMediaMock.mockReset();
    getUserMediaMock.mockResolvedValue(fakeStream);
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: getUserMediaMock,
      },
      configurable: true,
    });
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("entra na reuniao: pede camera/mic, conecta no hub e anuncia o join", async () => {
    render(<RoomPage />);
    await screen.findByText(/Reunião com Paulo/);

    fireEvent.click(screen.getByRole("button", { name: /entrar na reuniao/ }));

    await waitFor(() => expect(getUserMediaMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId("local-video")).toBeInTheDocument());
    expect(fakeConnections).toHaveLength(1);
    expect(fakeConnections[0].started).toBe(true);
    expect(fakeConnections[0].invokes.some((i) => i.method === "Join" && i.args[0] === "meeting-1" && i.args[1] === "participant-1" && i.args[2] === "Paulo")).toBe(true);
  });

  it("com outros participantes na sala, envia offer de video para cada um", async () => {
    render(<RoomPage />);
    await screen.findByText(/Reunião com Paulo/);
    fireEvent.click(screen.getByRole("button", { name: /entrar na reuniao/ }));
    await screen.findByTestId("local-video");

    const connection = fakeConnections[0];
    connection.trigger("Peers", ["peer-1", "peer-2"]);

    await waitFor(() => expect(FakeRTCPeerConnection.instances).toHaveLength(2));
    const offers = connection.invokes.filter((i) => i.method === "Offer");
    expect(offers).toHaveLength(2);
    expect(offers.map((o) => o.args[1]).sort()).toEqual(["peer-1", "peer-2"]);
    expect(JSON.parse(offers[0].args[2] as string).type).toBe("offer");
  });

  it("recebe offer de outro participante e responde com answer sem gerar glare", async () => {
    render(<RoomPage />);
    await screen.findByText(/Reunião com Paulo/);
    fireEvent.click(screen.getByRole("button", { name: /entrar na reuniao/ }));
    await screen.findByTestId("local-video");

    const connection = fakeConnections[0];
    connection.trigger("PeerJoined", "peer-1");
    const peer = FakeRTCPeerConnection.instances[0];

    await waitFor(() => expect(peer.createdOffer).toBe(false));
    expect(connection.invokes.some((i) => i.method === "Offer")).toBe(false);

    connection.trigger("Offer", "meeting-1", "peer-1", JSON.stringify({ type: "offer", sdp: "x" }));

    await waitFor(() => expect(peer.createdAnswer).toBe(true));
    await waitFor(() =>
      expect(connection.invokes.some((i) => i.method === "Answer" && i.args[1] === "peer-1")).toBe(true),
    );
    expect(peer.remoteDescription).toEqual({ type: "offer", sdp: "x" });
  });

  it("recebe ice candidate e aplica na conexao do participante", async () => {
    render(<RoomPage />);
    await screen.findByText(/Reunião com Paulo/);
    fireEvent.click(screen.getByRole("button", { name: /entrar na reuniao/ }));
    await screen.findByTestId("local-video");

    const connection = fakeConnections[0];
    connection.trigger("PeerJoined", "peer-1");
    const peer = FakeRTCPeerConnection.instances[0];

    connection.trigger("IceCandidate", "meeting-1", "peer-1", JSON.stringify({ candidate: "cand-1" }));

    await waitFor(() => expect(peer.addedCandidate).toEqual({ candidate: "cand-1" }));
  });

  it("sai da reuniao e volta para a tela de informacoes", async () => {
    render(<RoomPage />);
    await screen.findByText(/Reunião com Paulo/);
    fireEvent.click(screen.getByRole("button", { name: /entrar na reuniao/ }));
    await screen.findByTestId("local-video");

    const connection = fakeConnections[0];
    connection.trigger("PeerJoined", "peer-1");
    const peer = FakeRTCPeerConnection.instances[0];

    fireEvent.click(screen.getByRole("button", { name: /sair da reuniao/ }));

    await waitFor(() => expect(peer.closed).toBe(true));
    await waitFor(() => expect(connection.stopped).toBe(true));
    expect(videoTrack.stop).toHaveBeenCalled();
    expect(audioTrack.stop).toHaveBeenCalled();
    expect(screen.queryByTestId("local-video")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /entrar na reuniao/ })).toBeInTheDocument();
  });

  it("mostra erro quando a permissao de camera/mic falha", async () => {
    getUserMediaMock.mockRejectedValue(new Error("denied"));

    render(<RoomPage />);
    await screen.findByText(/Reunião com Paulo/);
    fireEvent.click(screen.getByRole("button", { name: /entrar na reuniao/ }));

    expect(await screen.findByText("nao foi possivel entrar na reuniao")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /entrar na reuniao/ })).toBeInTheDocument();
  });
});
