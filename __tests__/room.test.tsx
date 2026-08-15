import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RoomPage from "@/app/room/[id]/page";
import type { MeetingResponse } from "@/lib/api";

const { pushMock, authRequestMock, apiRequestMock, guestTokenMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  authRequestMock: vi.fn(),
  apiRequestMock: vi.fn(),
  guestTokenMock: vi.fn(),
}));

let currentUser: { userId: string; name: string; email: string; photoUrl: string | null } | null = {
  userId: "user-1",
  name: "Paulo",
  email: "paulo@test.com",
  photoUrl: "/avatars/1.svg",
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useParams: () => ({ id: "meeting-1" }),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    apiRequest: apiRequestMock,
    authApi: { ...actual.authApi, guestToken: guestTokenMock },
  };
});

vi.mock("@/components/auth-context", () => ({
  useAuth: () => ({
    user: currentUser,
    isLoading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    updatePhoto: vi.fn(),
    getAccessToken: vi.fn(async () => "token-acesso"),
    authRequest: authRequestMock,
  }),
}));

const { fakeConnections, FakeHubConnectionBuilder, FakeRTCPeerConnection, hubBuilderOptions } = vi.hoisted(() => {
  type Handler = (...args: never[]) => void;

  class FakeHubConnection {
    handlers = new Map<string, Handler>();
    invokes: { method: string; args: unknown[] }[] = [];
    started = false;
    stopped = false;
    startCount = 0;
    onreconnected: (() => void) | null = null;
    onclose: ((error?: Error) => void) | null = null;

    on(name: string, handler: Handler) {
      this.handlers.set(name, handler);
    }

    invoke(method: string, ...args: unknown[]) {
      this.invokes.push({ method, args });
      return Promise.resolve();
    }

    start() {
      this.started = true;
      this.startCount += 1;
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

  const hubBuilderOptions: {
    url: string;
    options: { accessTokenFactory?: () => Promise<string> } | null;
  } = { url: "", options: null };

  class FakeHubConnectionBuilder {
    withUrl(url: string, options?: { accessTokenFactory?: () => Promise<string> }) {
      hubBuilderOptions.url = url;
      hubBuilderOptions.options = options ?? null;
      return this;
    }

    withAutomaticReconnect() {
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
    senders: { track: { kind: string } | null; replaceTrack: ReturnType<typeof vi.fn> }[];

    constructor(public config: RTCConfiguration) {
      FakeRTCPeerConnection.instances.push(this);
      this.senders = [
        { track: { kind: "video" }, replaceTrack: vi.fn() },
        { track: { kind: "audio" }, replaceTrack: vi.fn() },
      ];
    }

    getSenders() {
      return this.senders;
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
  return { fakeConnections, FakeHubConnectionBuilder, FakeRTCPeerConnection, hubBuilderOptions };
});

vi.mock("@microsoft/signalr", () => ({
  HubConnectionBuilder: FakeHubConnectionBuilder,
}));

const { createBackgroundEffectEngineMock, BackgroundEffectEngineMock, engineInstances, backgroundEffectsList } = vi.hoisted(
  () => {
    const engineInstances: {
      setEffect: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
      processedTrack: { kind: string; enabled: boolean; stop: ReturnType<typeof vi.fn> };
    }[] = [];
    class BackgroundEffectEngineMock {
      setEffect = vi.fn();
      stop = vi.fn();
      processedTrack = { kind: "video", enabled: true, stop: vi.fn() };
      constructor() {
        engineInstances.push(this);
      }
    }
    const createBackgroundEffectEngineMock = vi.fn();
    const backgroundEffectsList = [
      { id: "none", label: "sem efeito", effect: { kind: "none" } },
      { id: "blur", label: "desfoque", effect: { kind: "blur" } },
      { id: "color-1", label: "azul", effect: { kind: "color", color: "#0f172a" } },
      { id: "color-2", label: "verde", effect: { kind: "color", color: "#14532d" } },
      { id: "gradient-1", label: "gradiente", effect: { kind: "gradient", from: "#0f172a", to: "#4c1d95" } },
    ];
    return { createBackgroundEffectEngineMock, BackgroundEffectEngineMock, engineInstances, backgroundEffectsList };
  },
);

vi.mock("@/lib/background-effects", () => ({
  createBackgroundEffectEngine: createBackgroundEffectEngineMock,
  BackgroundEffectEngine: BackgroundEffectEngineMock,
  BACKGROUND_EFFECTS: backgroundEffectsList,
}));

const { getPhotoColorMock, usePhotoColorMock } = vi.hoisted(() => ({
  getPhotoColorMock: vi.fn(),
  usePhotoColorMock: vi.fn(),
}));

vi.mock("@/lib/photo-color", () => ({
  getPhotoColor: getPhotoColorMock,
  usePhotoColor: usePhotoColorMock,
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
const screenTrack = fakeTrack("video");
const streamTracks: { kind: string; enabled: boolean; stop: ReturnType<typeof vi.fn> }[] = [videoTrack, audioTrack];
const fakeStream = {
  getTracks: () => streamTracks,
  getAudioTracks: () => streamTracks.filter((track) => track.kind === "audio"),
  getVideoTracks: () => streamTracks.filter((track) => track.kind === "video"),
  addTrack(track: { kind: string; enabled: boolean; stop: ReturnType<typeof vi.fn> }) {
    streamTracks.push(track);
  },
  removeTrack(track: { kind: string; enabled: boolean; stop: ReturnType<typeof vi.fn> }) {
    const index = streamTracks.indexOf(track);
    if (index >= 0) {
      streamTracks.splice(index, 1);
    }
  },
};
const fakeScreenStream = {
  getTracks: () => [screenTrack],
  getAudioTracks: () => [],
  getVideoTracks: () => [screenTrack],
};

function makeRemoteStream() {
  return { getTracks: () => [], getAudioTracks: () => [], getVideoTracks: () => [] } as unknown as MediaStream;
}

function addPeerWithStream(connection: { trigger: (name: string, ...args: unknown[]) => void }, participantId: string, name: string) {
  connection.trigger("PeerJoined", participantId, name);
  const peer = FakeRTCPeerConnection.instances[FakeRTCPeerConnection.instances.length - 1];
  peer.ontrack?.({ streams: [makeRemoteStream()] });
}

async function joinRoomWithPeer() {
  render(<RoomPage />);
  await screen.findByText(/Reunião com Paulo/);
  fireEvent.click(screen.getByRole("button", { name: /entrar na reuniao/ }));
  await screen.findByTestId("local-video");
  const connection = fakeConnections[0];
  addPeerWithStream(connection, "peer-1", "Bruno");
  await screen.findByTestId("remote-video-peer-1");
  return connection;
}
const getUserMediaMock = vi.fn();
const getDisplayMediaMock = vi.fn();
const enumerateDevicesMock = vi.fn();
const requestFullscreenMock = vi.fn();
const exitFullscreenMock = vi.fn();

describe("RoomPage WebRTC", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    currentUser = { userId: "user-1", name: "Paulo", email: "paulo@test.com", photoUrl: "/avatars/1.svg" };
    authRequestMock.mockResolvedValue(meeting);
    apiRequestMock.mockResolvedValue(meeting);
    guestTokenMock.mockResolvedValue({ accessToken: "token-convidado" });
    fakeConnections.length = 0;
    FakeRTCPeerConnection.instances = [];
    hubBuilderOptions.url = "";
    hubBuilderOptions.options = null;
    engineInstances.length = 0;
    createBackgroundEffectEngineMock.mockReset();
    createBackgroundEffectEngineMock.mockImplementation(() => Promise.resolve(new BackgroundEffectEngineMock()));
    getPhotoColorMock.mockReset();
    getPhotoColorMock.mockResolvedValue(null);
    usePhotoColorMock.mockReset();
    usePhotoColorMock.mockReturnValue(null);
    streamTracks.length = 0;
    streamTracks.push(videoTrack, audioTrack);
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
    getDisplayMediaMock.mockReset();
    getDisplayMediaMock.mockResolvedValue(fakeScreenStream);
    enumerateDevicesMock.mockReset();
    enumerateDevicesMock.mockResolvedValue([
      { kind: "audioinput", deviceId: "mic-1", label: "microfone padrão" },
      { kind: "videoinput", deviceId: "cam-1", label: "câmera padrão" },
    ]);
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: getUserMediaMock,
        getDisplayMedia: getDisplayMediaMock,
        enumerateDevices: enumerateDevicesMock,
      },
      configurable: true,
    });
    Object.defineProperty(document, "fullscreenElement", {
      value: null,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      value: requestFullscreenMock,
      configurable: true,
    });
    Object.defineProperty(document, "exitFullscreen", {
      value: exitFullscreenMock,
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
    expect(fakeConnections[0].invokes.some((i) => i.method === "Join" && i.args[0] === "meeting-1" && i.args[1] === "participant-1" && i.args[2] === "Paulo" && i.args[3] === "/avatars/1.svg")).toBe(true);
  });

  it("usa o token de acesso ao conectar no hub", async () => {
    render(<RoomPage />);
    await screen.findByText(/Reunião com Paulo/);

    fireEvent.click(screen.getByRole("button", { name: /entrar na reuniao/ }));
    await screen.findByTestId("local-video");

    expect(hubBuilderOptions.url).toContain("/hubs/meeting");
    await expect(hubBuilderOptions.options?.accessTokenFactory?.()).resolves.toBe("token-acesso");
  });

  it("reconecta e refaz o join apos a conexao cair", async () => {
    render(<RoomPage />);
    await screen.findByText(/Reunião com Paulo/);
    fireEvent.click(screen.getByRole("button", { name: /entrar na reuniao/ }));
    await screen.findByTestId("local-video");

    const connection = fakeConnections[0];
    addPeerWithStream(connection, "peer-1", "Bruno");
    await screen.findByTestId("remote-video-peer-1");
    const connectionsBefore = FakeRTCPeerConnection.instances.length;

    connection.onreconnected?.();

    await waitFor(() => expect(connection.invokes.filter((i) => i.method === "Join")).toHaveLength(2));
    expect(screen.queryByTestId("remote-video-peer-1")).not.toBeInTheDocument();

    connection.trigger("Peers", [{ participantId: "peer-1", name: "Bruno" }]);
    await waitFor(() => expect(FakeRTCPeerConnection.instances.length).toBeGreaterThan(connectionsBefore));
  });

  it("mostra aviso de conexao perdida e permite tentar reconectar", async () => {
    render(<RoomPage />);
    await screen.findByText(/Reunião com Paulo/);
    fireEvent.click(screen.getByRole("button", { name: /entrar na reuniao/ }));
    await screen.findByTestId("local-video");

    const connection = fakeConnections[0];
    act(() => {
      connection.onclose?.(new Error("timeout"));
    });

    expect(screen.getByText(/conexao perdida/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /tentar reconectar/ }));

    await waitFor(() => expect(connection.startCount).toBe(2));
    await waitFor(() => expect(connection.invokes.filter((i) => i.method === "Join")).toHaveLength(2));
    expect(screen.queryByText(/conexao perdida/)).not.toBeInTheDocument();
  });

  it("convidado pode definir o nome antes de entrar e envia no join", async () => {
    currentUser = null;

    render(<RoomPage />);
    await screen.findByTestId("preview-video");

    const nameInput = screen.getByLabelText("seu nome");
    expect(nameInput).toHaveValue("Convidado");

    fireEvent.change(nameInput, { target: { value: "Bia" } });
    fireEvent.click(screen.getByRole("button", { name: /entrar na reuniao/ }));

    await screen.findByTestId("local-video");
    expect(fakeConnections[0].invokes.some((i) => i.method === "Join" && i.args[2] === "Bia")).toBe(true);
  });

  it("convidado busca token de convidado para carregar a sala e conectar no hub", async () => {
    currentUser = null;

    render(<RoomPage />);
    await screen.findByTestId("preview-video");

    expect(guestTokenMock).toHaveBeenCalled();
    expect(apiRequestMock).toHaveBeenCalledWith("/api/meetings/meeting-1", {}, "token-convidado");

    fireEvent.click(screen.getByRole("button", { name: /entrar na reuniao/ }));
    await screen.findByTestId("local-video");

    const token = await hubBuilderOptions.options?.accessTokenFactory?.();
    expect(token).toBe("token-convidado");
  });

  it("mostra preview de camera e mic antes de entrar", async () => {
    render(<RoomPage />);

    await screen.findByTestId("preview-video");
    expect(getUserMediaMock).toHaveBeenCalledWith({ video: true, audio: true });
    expect(screen.getByRole("meter", { name: "nível do microfone" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /desligar camera no preview/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /desligar microfone no preview/ })).toBeInTheDocument();
  });

  it("mostra os dispositivos de microfone e camera no preview", async () => {
    enumerateDevicesMock.mockResolvedValue([
      { kind: "audioinput", deviceId: "mic-1", label: "microfone padrão" },
      { kind: "videoinput", deviceId: "cam-1", label: "câmera padrão" },
      { kind: "audioinput", deviceId: "mic-2", label: "microfone usb" },
      { kind: "videoinput", deviceId: "cam-2", label: "câmera usb" },
    ]);

    render(<RoomPage />);
    await screen.findByTestId("preview-video");

    expect(enumerateDevicesMock).toHaveBeenCalled();
    expect(screen.getByLabelText("microfone do preview")).toBeInTheDocument();
    expect(screen.getByLabelText("câmera do preview")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "microfone padrão" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "câmera usb" })).toBeInTheDocument();
  });

  it("trocar de camera no preview refaz o stream com o dispositivo escolhido", async () => {
    enumerateDevicesMock.mockResolvedValue([
      { kind: "videoinput", deviceId: "cam-1", label: "câmera padrão" },
      { kind: "videoinput", deviceId: "cam-2", label: "câmera usb" },
    ]);

    render(<RoomPage />);
    await screen.findByTestId("preview-video");
    getUserMediaMock.mockClear();
    getUserMediaMock.mockResolvedValue(fakeStream);

    fireEvent.change(screen.getByLabelText("câmera do preview"), { target: { value: "cam-2" } });

    await waitFor(() =>
      expect(getUserMediaMock).toHaveBeenCalledWith({ video: { deviceId: { exact: "cam-2" } }, audio: true })
    );
  });

  it("trocar de microfone no preview refaz o stream com o dispositivo escolhido", async () => {
    enumerateDevicesMock.mockResolvedValue([
      { kind: "audioinput", deviceId: "mic-1", label: "microfone padrão" },
      { kind: "audioinput", deviceId: "mic-2", label: "microfone usb" },
    ]);

    render(<RoomPage />);
    await screen.findByTestId("preview-video");
    getUserMediaMock.mockClear();

    fireEvent.change(screen.getByLabelText("microfone do preview"), { target: { value: "mic-2" } });

    await waitFor(() =>
      expect(getUserMediaMock).toHaveBeenCalledWith({ video: true, audio: { deviceId: { exact: "mic-2" } } })
    );
  });

  it("troca a camera durante a reuniao e renegocia com os participantes", async () => {
    enumerateDevicesMock.mockResolvedValue([
      { kind: "videoinput", deviceId: "cam-1", label: "câmera padrão" },
      { kind: "videoinput", deviceId: "cam-2", label: "câmera usb" },
    ]);

    render(<RoomPage />);
    await screen.findByTestId("preview-video");
    fireEvent.click(screen.getByRole("button", { name: /entrar na reuniao/ }));
    await screen.findByTestId("local-video");

    const connection = fakeConnections[0];
    addPeerWithStream(connection, "peer-1", "Bruno");
    await screen.findByTestId("remote-video-peer-1");

    getUserMediaMock.mockClear();

    fireEvent.click(screen.getByRole("button", { name: /dispositivos/ }));
    const camSelect = await screen.findByLabelText("câmera da reunião");
    fireEvent.change(camSelect, { target: { value: "cam-2" } });

    await waitFor(() =>
      expect(getUserMediaMock).toHaveBeenCalledWith({ video: { deviceId: { exact: "cam-2" } }, audio: false })
    );
    const peer = FakeRTCPeerConnection.instances.find((instance) => instance.addedTracks.length > 0);
    const videoSender = peer?.getSenders().find((sender) => sender.track?.kind === "video");
    expect(videoSender?.replaceTrack).toHaveBeenCalled();
    expect(connection.invokes.some((i) => i.method === "Offer")).toBe(true);
    expect(connection.invokes.some((i) => i.method === "CameraState" && i.args[1] === true)).toBe(true);
  });

  it("troca o microfone durante a reuniao e renegocia com os participantes", async () => {
    enumerateDevicesMock.mockResolvedValue([
      { kind: "audioinput", deviceId: "mic-1", label: "microfone padrão" },
      { kind: "audioinput", deviceId: "mic-2", label: "microfone usb" },
    ]);

    render(<RoomPage />);
    await screen.findByTestId("preview-video");
    fireEvent.click(screen.getByRole("button", { name: /entrar na reuniao/ }));
    await screen.findByTestId("local-video");

    const connection = fakeConnections[0];
    addPeerWithStream(connection, "peer-1", "Bruno");
    await screen.findByTestId("remote-video-peer-1");

    getUserMediaMock.mockClear();

    fireEvent.click(screen.getByRole("button", { name: /dispositivos/ }));
    const micSelect = await screen.findByLabelText("microfone da reunião");
    fireEvent.change(micSelect, { target: { value: "mic-2" } });

    await waitFor(() =>
      expect(getUserMediaMock).toHaveBeenCalledWith({ video: false, audio: { deviceId: { exact: "mic-2" } } })
    );
    const peer = FakeRTCPeerConnection.instances.find((instance) => instance.addedTracks.length > 0);
    const audioSender = peer?.getSenders().find((sender) => sender.track?.kind === "audio");
    expect(audioSender?.replaceTrack).toHaveBeenCalled();
    expect(connection.invokes.some((i) => i.method === "Offer")).toBe(true);
  });

  it("ajustes do preview valem ao entrar na sala", async () => {
    render(<RoomPage />);
    await screen.findByTestId("preview-video");

    fireEvent.click(screen.getByRole("button", { name: /desligar camera no preview/ }));
    fireEvent.click(screen.getByRole("button", { name: /desligar microfone no preview/ }));

    fireEvent.click(screen.getByRole("button", { name: /entrar na reuniao/ }));

    await waitFor(() => expect(screen.getByTestId("local-photo")).toBeInTheDocument());
    expect(getUserMediaMock).toHaveBeenCalledTimes(1);
    expect(videoTrack.enabled).toBe(false);
    expect(audioTrack.enabled).toBe(false);
    expect(fakeConnections[0].invokes.some((i) => i.method === "CameraState" && i.args[0] === "meeting-1" && i.args[1] === false)).toBe(true);
    expect(screen.getByRole("button", { name: /ligar camera/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ligar microfone/ })).toBeInTheDocument();
  });

  it("reinicia o preview apos sair da reuniao", async () => {
    render(<RoomPage />);
    await screen.findByTestId("preview-video");

    fireEvent.click(screen.getByRole("button", { name: /entrar na reuniao/ }));
    await screen.findByTestId("local-video");

    fireEvent.click(screen.getByRole("button", { name: /sair da reuniao/ }));

    await waitFor(() => expect(screen.getByTestId("preview-video")).toBeInTheDocument());
    expect(getUserMediaMock).toHaveBeenCalledTimes(2);
  });

  it("com outros participantes na sala, envia offer de video para cada um", async () => {
    render(<RoomPage />);
    await screen.findByText(/Reunião com Paulo/);
    fireEvent.click(screen.getByRole("button", { name: /entrar na reuniao/ }));
    await screen.findByTestId("local-video");

    const connection = fakeConnections[0];
    connection.trigger("Peers", [
      { participantId: "peer-1", name: "Bruno" },
      { participantId: "peer-2", name: "Carla" },
    ]);

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
    connection.trigger("PeerJoined", "peer-1", "Bruno");
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
    connection.trigger("PeerJoined", "peer-1", "Bruno");
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
    connection.trigger("PeerJoined", "peer-1", "Bruno");
    const peer = FakeRTCPeerConnection.instances[0];

    fireEvent.click(screen.getByRole("button", { name: /sair da reuniao/ }));

    await waitFor(() => expect(peer.closed).toBe(true));
    await waitFor(() => expect(connection.stopped).toBe(true));
    expect(videoTrack.stop).toHaveBeenCalled();
    expect(audioTrack.stop).toHaveBeenCalled();
    expect(screen.queryByTestId("local-video")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /entrar na reuniao/ })).toBeInTheDocument();
  });

  it("entra na sala mesmo quando a permissao de camera/mic e negada", async () => {
    getUserMediaMock.mockRejectedValue(new Error("denied"));

    render(<RoomPage />);
    await screen.findByText(/nao foi possivel acessar camera e microfone/);
    expect(screen.queryByTestId("preview-video")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /entrar na reuniao/ }));

    await waitFor(() => expect(screen.getByTestId("local-photo")).toBeInTheDocument());
    expect(fakeConnections).toHaveLength(1);
    expect(fakeConnections[0].started).toBe(true);
  });

  it("lista participantes com nome conforme entram e saem", async () => {
    render(<RoomPage />);
    await screen.findByText(/Reunião com Paulo/);
    fireEvent.click(screen.getByRole("button", { name: /entrar na reuniao/ }));
    await screen.findByTestId("local-video");

    const connection = fakeConnections[0];
    connection.trigger("Peers", [{ participantId: "peer-1", name: "Bruno" }]);
    connection.trigger("PeerJoined", "peer-2", "Carla");
    fireEvent.click(screen.getByRole("button", { name: /participantes/i }));

    expect(await screen.findByText("Bruno")).toBeInTheDocument();
    expect(screen.getByText("Carla")).toBeInTheDocument();
    expect(screen.getByText("(voce)")).toBeInTheDocument();

    connection.trigger("PeerLeft", "peer-1");

    await waitFor(() => expect(screen.queryByText("Bruno")).not.toBeInTheDocument());
    expect(screen.getByText("Carla")).toBeInTheDocument();
  });

  it("envia mensagem no chat pelo hub", async () => {
    render(<RoomPage />);
    await screen.findByText(/Reunião com Paulo/);
    fireEvent.click(screen.getByRole("button", { name: /entrar na reuniao/ }));
    await screen.findByTestId("local-video");

    fireEvent.click(screen.getByRole("button", { name: /chat/i }));
    fireEvent.change(screen.getByLabelText("mensagem do chat"), { target: { value: "ola pessoal" } });
    fireEvent.click(screen.getByRole("button", { name: /enviar/ }));

    await waitFor(() =>
      expect(fakeConnections[0].invokes.some((i) => i.method === "SendMessage" && i.args[0] === "meeting-1" && i.args[1] === "ola pessoal")).toBe(true),
    );
  });

  it("mostra mensagem recebida no chat", async () => {
    render(<RoomPage />);
    await screen.findByText(/Reunião com Paulo/);
    fireEvent.click(screen.getByRole("button", { name: /entrar na reuniao/ }));
    await screen.findByTestId("local-video");

    fireEvent.click(screen.getByRole("button", { name: /chat/i }));
    fakeConnections[0].trigger("Message", "peer-1", "Bruno", "bom dia");

    expect(await screen.findByText("bom dia")).toBeInTheDocument();
    expect(screen.getByText("Bruno")).toBeInTheDocument();
  });

  it("compartilha a tela substituindo o track de video das conexoes", async () => {
    render(<RoomPage />);
    await screen.findByText(/Reunião com Paulo/);
    fireEvent.click(screen.getByRole("button", { name: /entrar na reuniao/ }));
    await screen.findByTestId("local-video");

    const connection = fakeConnections[0];
    connection.trigger("PeerJoined", "peer-1", "Bruno");
    const peer = FakeRTCPeerConnection.instances[0];

    fireEvent.click(screen.getByRole("button", { name: /compartilhar tela/ }));

    await waitFor(() => expect(getDisplayMediaMock).toHaveBeenCalled());
    await waitFor(() => expect(peer.senders[0].replaceTrack).toHaveBeenCalledWith(screenTrack));
    expect(peer.senders[1].replaceTrack).not.toHaveBeenCalled();
    expect(await screen.findByTestId("screen-video")).toBeInTheDocument();
    expect(screen.getByTestId("local-video")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /parar de compartilhar a tela/ })).toBeInTheDocument();
    expect(fakeConnections[0].invokes.some((i) => i.method === "ScreenShare" && i.args[0] === "meeting-1" && i.args[1] === true)).toBe(true);
  });

  it("para de compartilhar a tela e restaura a camera", async () => {
    render(<RoomPage />);
    await screen.findByText(/Reunião com Paulo/);
    fireEvent.click(screen.getByRole("button", { name: /entrar na reuniao/ }));
    await screen.findByTestId("local-video");

    const connection = fakeConnections[0];
    connection.trigger("PeerJoined", "peer-1", "Bruno");
    const peer = FakeRTCPeerConnection.instances[0];

    fireEvent.click(screen.getByRole("button", { name: /compartilhar tela/ }));
    await waitFor(() => expect(peer.senders[0].replaceTrack).toHaveBeenCalledWith(screenTrack));

    fireEvent.click(screen.getByRole("button", { name: /parar de compartilhar a tela/ }));

    await waitFor(() => expect(peer.senders[0].replaceTrack).toHaveBeenCalledWith(videoTrack));
    expect(screenTrack.stop).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId("screen-video")).not.toBeInTheDocument());
    expect(screen.getByTestId("local-video")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /compartilhar tela/ })).toBeInTheDocument();
    expect(fakeConnections[0].invokes.some((i) => i.method === "ScreenShare" && i.args[0] === "meeting-1" && i.args[1] === false)).toBe(true);
  });

  it("mostra tela compartilhada de participante remoto em destaque", async () => {
    render(<RoomPage />);
    await screen.findByText(/Reunião com Paulo/);
    fireEvent.click(screen.getByRole("button", { name: /entrar na reuniao/ }));
    await screen.findByTestId("local-video");

    const connection = fakeConnections[0];
    addPeerWithStream(connection, "peer-1", "Bruno");
    connection.trigger("ScreenShare", "peer-1", true);

    expect(await screen.findByTestId("screen-video")).toBeInTheDocument();
    expect(screen.getByTestId("local-video")).toBeInTheDocument();
    expect(screen.queryByTestId("remote-video-peer-1")).not.toBeInTheDocument();
  });

  it("mostra grade com cameras e transmissao ao expandir", async () => {
    render(<RoomPage />);
    await screen.findByText(/Reunião com Paulo/);
    fireEvent.click(screen.getByRole("button", { name: /entrar na reuniao/ }));
    await screen.findByTestId("local-video");

    const connection = fakeConnections[0];
    addPeerWithStream(connection, "peer-1", "Bruno");
    addPeerWithStream(connection, "peer-2", "Carla");
    addPeerWithStream(connection, "peer-3", "Davi");
    addPeerWithStream(connection, "peer-4", "Eva");
    connection.trigger("ScreenShare", "peer-1", true);

    expect(await screen.findByTestId("screen-video")).toBeInTheDocument();
    expect(screen.getByTestId("remote-video-peer-2")).toBeInTheDocument();
    expect(screen.getByTestId("remote-video-peer-3")).toBeInTheDocument();
    expect(screen.queryByTestId("remote-video-peer-4")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /\+1 participantes/ }));

    expect(screen.getByTestId("screen-video")).toBeInTheDocument();
    expect(screen.getByTestId("remote-video-peer-4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /voltar para a tela/ })).toBeInTheDocument();
    expect(screen.queryByText("1 / 1")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /voltar para a tela/ }));

    await waitFor(() => expect(screen.queryByTestId("remote-video-peer-4")).not.toBeInTheDocument());
    expect(screen.getByTestId("screen-video")).toBeInTheDocument();
  });

  it("pagina a grade de ver mais durante a transmissao", async () => {
    render(<RoomPage />);
    await screen.findByText(/Reunião com Paulo/);
    fireEvent.click(screen.getByRole("button", { name: /entrar na reuniao/ }));
    await screen.findByTestId("local-video");

    const connection = fakeConnections[0];
    for (let index = 1; index <= 10; index++) {
      addPeerWithStream(connection, `peer-${index}`, `Peer ${index}`);
    }
    await screen.findByTestId("remote-video-peer-1");

    connection.trigger("ScreenShare", "peer-1", true);
    await screen.findByTestId("screen-video");

    fireEvent.click(screen.getByRole("button", { name: /\+7 participantes/ }));

    expect(screen.getByTestId("screen-video")).toBeInTheDocument();
    expect(screen.getByTestId("remote-video-peer-8")).toBeInTheDocument();
    expect(screen.queryByTestId("remote-video-peer-9")).not.toBeInTheDocument();
    expect(screen.getByText("1 / 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /proxima pagina/ }));

    expect(await screen.findByTestId("remote-video-peer-9")).toBeInTheDocument();
    expect(screen.getByTestId("remote-video-peer-10")).toBeInTheDocument();
    expect(screen.queryByTestId("remote-video-peer-2")).not.toBeInTheDocument();
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
  });

  it("pagina as cameras no grid com limite de 9", async () => {
    render(<RoomPage />);
    await screen.findByText(/Reunião com Paulo/);
    fireEvent.click(screen.getByRole("button", { name: /entrar na reuniao/ }));
    await screen.findByTestId("local-video");

    const connection = fakeConnections[0];
    for (let index = 1; index <= 10; index++) {
      addPeerWithStream(connection, `peer-${index}`, `Mock ${index}`);
    }

    expect(await screen.findByTestId("remote-video-peer-1")).toBeInTheDocument();
    expect(screen.getByTestId("remote-video-peer-8")).toBeInTheDocument();
    expect(screen.queryByTestId("remote-video-peer-9")).not.toBeInTheDocument();
    expect(screen.getByText("1 / 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /proxima pagina/ }));

    expect(await screen.findByTestId("remote-video-peer-9")).toBeInTheDocument();
    expect(screen.getByTestId("remote-video-peer-10")).toBeInTheDocument();
    expect(screen.queryByTestId("remote-video-peer-1")).not.toBeInTheDocument();
    expect(screen.getByText("2 / 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /pagina anterior/ }));

    expect(await screen.findByTestId("remote-video-peer-1")).toBeInTheDocument();
    expect(screen.queryByTestId("remote-video-peer-9")).not.toBeInTheDocument();
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
  });

  it("volta ao grid quando o compartilhamento remoto para", async () => {
    render(<RoomPage />);
    await screen.findByText(/Reunião com Paulo/);
    fireEvent.click(screen.getByRole("button", { name: /entrar na reuniao/ }));
    await screen.findByTestId("local-video");

    const connection = fakeConnections[0];
    addPeerWithStream(connection, "peer-1", "Bruno");
    connection.trigger("ScreenShare", "peer-1", true);
    await screen.findByTestId("screen-video");

    connection.trigger("ScreenShare", "peer-1", false);

    await waitFor(() => expect(screen.queryByTestId("screen-video")).not.toBeInTheDocument());
    expect(screen.getByTestId("remote-video-peer-1")).toBeInTheDocument();
  });

  it("mostra card com foto quando a camera local e desligada", async () => {
    render(<RoomPage />);
    await screen.findByText(/Reunião com Paulo/);
    fireEvent.click(screen.getByRole("button", { name: /entrar na reuniao/ }));
    await screen.findByTestId("local-video");

    fireEvent.click(screen.getByRole("button", { name: /desligar camera/ }));

    await waitFor(() => expect(screen.getByTestId("local-photo")).toBeInTheDocument());
    expect(screen.queryByTestId("local-video")).not.toBeInTheDocument();
    expect(fakeConnections[0].invokes.some((i) => i.method === "CameraState" && i.args[0] === "meeting-1" && i.args[1] === false)).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /ligar camera/ }));

    await waitFor(() => expect(screen.getByTestId("local-video")).toBeInTheDocument());
    expect(screen.queryByTestId("local-photo")).not.toBeInTheDocument();
  });

  it("usa a cor dominante da foto de perfil como fundo do tile com camera desligada", async () => {
    usePhotoColorMock.mockReturnValue("#334155");
    render(<RoomPage />);
    await screen.findByText(/Reunião com Paulo/);
    fireEvent.click(screen.getByRole("button", { name: /entrar na reuniao/ }));
    await screen.findByTestId("local-video");

    fireEvent.click(screen.getByRole("button", { name: /desligar camera/ }));

    await waitFor(() => expect(screen.getByTestId("local-photo")).toHaveStyle({ backgroundColor: "#334155" }));
    expect(usePhotoColorMock).toHaveBeenCalledWith("/avatars/1.svg", true);
  });

  it("mostra card com foto quando a camera de participante remoto e desligada", async () => {
    render(<RoomPage />);
    await screen.findByText(/Reunião com Paulo/);
    fireEvent.click(screen.getByRole("button", { name: /entrar na reuniao/ }));
    await screen.findByTestId("local-video");

    const connection = fakeConnections[0];
    connection.trigger("PeerJoined", "peer-1", "Bruno", "/avatars/3.svg");
    const peer = FakeRTCPeerConnection.instances[FakeRTCPeerConnection.instances.length - 1];
    peer.ontrack?.({ streams: [makeRemoteStream()] });
    await screen.findByTestId("remote-video-peer-1");

    connection.trigger("CameraState", "peer-1", false);

    await waitFor(() => expect(screen.getByTestId("remote-photo-peer-1")).toBeInTheDocument());
    expect(screen.queryByTestId("remote-video-peer-1")).not.toBeInTheDocument();

    connection.trigger("CameraState", "peer-1", true);

    await waitFor(() => expect(screen.getByTestId("remote-video-peer-1")).toBeInTheDocument());
    expect(screen.queryByTestId("remote-photo-peer-1")).not.toBeInTheDocument();
  });

  it("alterna a tela cheia", async () => {
    render(<RoomPage />);
    await screen.findByText(/Reunião com Paulo/);
    fireEvent.click(screen.getByRole("button", { name: /entrar na reuniao/ }));
    await screen.findByTestId("local-video");

    fireEvent.click(screen.getByRole("button", { name: /alternar tela cheia/ }));
    expect(requestFullscreenMock).toHaveBeenCalled();

    Object.defineProperty(document, "fullscreenElement", {
      value: {},
      configurable: true,
      writable: true,
    });
    fireEvent.click(screen.getByRole("button", { name: /alternar tela cheia/ }));
    expect(exitFullscreenMock).toHaveBeenCalled();
  });

  it("aplica efeito no preview antes de entrar e envia a track processada", async () => {
    render(<RoomPage />);
    await screen.findByTestId("preview-video");

    fireEvent.click(screen.getByRole("button", { name: /efeitos/ }));
    fireEvent.click(screen.getByRole("button", { name: "desfoque" }));

    await waitFor(() => expect(createBackgroundEffectEngineMock).toHaveBeenCalledWith(videoTrack));
    expect(screen.getByRole("button", { name: "desfoque" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: /entrar na reuniao/ }));
    await screen.findByTestId("local-video");

    addPeerWithStream(fakeConnections[0], "peer-1", "Bruno");
    await screen.findByTestId("remote-video-peer-1");

    const peer = FakeRTCPeerConnection.instances[FakeRTCPeerConnection.instances.length - 1];
    expect(peer.addedTracks).toContain(engineInstances[0].processedTrack);
  });

  it("trocar de efeito no preview nao recria o motor", async () => {
    render(<RoomPage />);
    await screen.findByTestId("preview-video");

    fireEvent.click(screen.getByRole("button", { name: /efeitos/ }));
    fireEvent.click(screen.getByRole("button", { name: "desfoque" }));
    await waitFor(() => expect(createBackgroundEffectEngineMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "azul" }));

    await waitFor(() =>
      expect(engineInstances[0].setEffect).toHaveBeenCalledWith({ kind: "color", color: "#0f172a" })
    );
    expect(createBackgroundEffectEngineMock).toHaveBeenCalledTimes(1);
  });

  it("aplica efeito durante a reuniao e troca a track enviada", async () => {
    const connection = await joinRoomWithPeer();

    fireEvent.click(screen.getByRole("button", { name: /efeitos/ }));
    fireEvent.click(screen.getByRole("button", { name: "desfoque" }));

    await waitFor(() => expect(createBackgroundEffectEngineMock).toHaveBeenCalledWith(videoTrack));
    const peer = FakeRTCPeerConnection.instances.find((instance) => instance.addedTracks.length > 0);
    const videoSender = peer?.getSenders().find((sender) => sender.track?.kind === "video");
    await waitFor(() => expect(videoSender?.replaceTrack).toHaveBeenCalledWith(engineInstances[0].processedTrack));
    expect(connection.invokes.some((i) => i.method === "Offer")).toBe(true);
    expect(screen.getByRole("button", { name: "desfoque" })).toHaveAttribute("aria-pressed", "true");
  });

  it("trocar de efeito na reuniao nao renegocia de novo", async () => {
    await joinRoomWithPeer();

    fireEvent.click(screen.getByRole("button", { name: /efeitos/ }));
    fireEvent.click(screen.getByRole("button", { name: "desfoque" }));
    await waitFor(() => expect(createBackgroundEffectEngineMock).toHaveBeenCalledTimes(1));
    const peer = FakeRTCPeerConnection.instances.find((instance) => instance.addedTracks.length > 0);
    const videoSender = peer?.getSenders().find((sender) => sender.track?.kind === "video");
    await waitFor(() => expect(videoSender?.replaceTrack).toHaveBeenCalledWith(engineInstances[0].processedTrack));
    const offersBefore = fakeConnections[0].invokes.filter((i) => i.method === "Offer").length;
    videoSender?.replaceTrack.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "azul" }));

    await waitFor(() =>
      expect(engineInstances[0].setEffect).toHaveBeenCalledWith({ kind: "color", color: "#0f172a" })
    );
    expect(videoSender?.replaceTrack).not.toHaveBeenCalled();
    expect(fakeConnections[0].invokes.filter((i) => i.method === "Offer")).toHaveLength(offersBefore);
  });

  it("desativa o efeito e restaura a camera original", async () => {
    await joinRoomWithPeer();

    fireEvent.click(screen.getByRole("button", { name: /efeitos/ }));
    fireEvent.click(screen.getByRole("button", { name: "desfoque" }));
    await waitFor(() => expect(createBackgroundEffectEngineMock).toHaveBeenCalledTimes(1));
    const peer = FakeRTCPeerConnection.instances.find((instance) => instance.addedTracks.length > 0);
    const videoSender = peer?.getSenders().find((sender) => sender.track?.kind === "video");
    await waitFor(() => expect(videoSender?.replaceTrack).toHaveBeenCalledWith(engineInstances[0].processedTrack));

    fireEvent.click(screen.getByRole("button", { name: "sem efeito" }));

    await waitFor(() => expect(videoSender?.replaceTrack).toHaveBeenCalledWith(videoTrack));
    expect(engineInstances[0].stop).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "sem efeito" })).toHaveAttribute("aria-pressed", "true");
  });

  it("mantem o efeito apos parar o compartilhamento de tela", async () => {
    await joinRoomWithPeer();

    fireEvent.click(screen.getByRole("button", { name: /efeitos/ }));
    fireEvent.click(screen.getByRole("button", { name: "desfoque" }));
    await waitFor(() => expect(createBackgroundEffectEngineMock).toHaveBeenCalledTimes(1));
    const peer = FakeRTCPeerConnection.instances.find((instance) => instance.addedTracks.length > 0);
    const videoSender = peer?.getSenders().find((sender) => sender.track?.kind === "video");

    fireEvent.click(screen.getByRole("button", { name: /compartilhar tela/ }));
    await waitFor(() => expect(videoSender?.replaceTrack).toHaveBeenCalledWith(screenTrack));

    fireEvent.click(screen.getByRole("button", { name: /parar de compartilhar a tela/ }));

    await waitFor(() => expect(videoSender?.replaceTrack).toHaveBeenCalledWith(engineInstances[0].processedTrack));
  });

  it("nao aplica efeito durante o compartilhamento de tela", async () => {
    await joinRoomWithPeer();

    fireEvent.click(screen.getByRole("button", { name: /compartilhar tela/ }));
    await screen.findByTestId("screen-video");

    fireEvent.click(screen.getByRole("button", { name: /efeitos/ }));
    fireEvent.click(screen.getByRole("button", { name: "desfoque" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/pare o compartilhamento/);
    expect(createBackgroundEffectEngineMock).not.toHaveBeenCalled();
  });
});
