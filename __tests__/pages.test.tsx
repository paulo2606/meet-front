import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";
import RoomPage from "@/app/room/[id]/page";
import type { MeetingResponse } from "@/lib/api";
import { ApiError } from "@/lib/api";

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

const meeting: MeetingResponse = {
  id: "meeting-1",
  code: "ABC2345",
  createdAtUtc: "2026-08-13T00:00:00Z",
  hostName: "Paulo",
};

describe("Home", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    authRequestMock.mockResolvedValue(meeting);
  });

  it("cria reuniao ao clicar em nova reuniao e redireciona para a sala", async () => {
    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: /nova reuni/i }));

    await waitFor(() => expect(authRequestMock).toHaveBeenCalledWith("/api/meetings", expect.objectContaining({ method: "POST" })));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/room/meeting-1"));
  });

  it("mostra erro quando a criacao da reuniao falha", async () => {
    authRequestMock.mockRejectedValue(new Error("falhou"));

    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: /nova reuni/i }));

    expect(await screen.findByText(/nao foi possivel criar a reuniao/)).toBeInTheDocument();
  });
});

describe("RoomPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    authRequestMock.mockResolvedValue(meeting);
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn().mockRejectedValue(new Error("denied")),
        getDisplayMedia: vi.fn(),
      },
      configurable: true,
    });
  });

  it("carrega e exibe os dados da reuniao", async () => {
    render(<RoomPage />);

    expect(await screen.findByText(/Reunião com Paulo/)).toBeInTheDocument();
    expect(screen.getByText("ABC2345")).toBeInTheDocument();
    expect(authRequestMock).toHaveBeenCalledWith("/api/meetings/meeting-1");
  });

  it("mostra erro quando a reuniao nao existe", async () => {
    authRequestMock.mockRejectedValue(new ApiError(404, ""));

    render(<RoomPage />);

    expect(await screen.findByText("reuniao nao encontrada")).toBeInTheDocument();
  });

  it("permite tentar novamente quando a reuniao nao carrega", async () => {
    authRequestMock
      .mockRejectedValueOnce(new ApiError(500, ""))
      .mockResolvedValueOnce(meeting);

    render(<RoomPage />);

    expect(await screen.findByText(/nao foi possivel carregar a reuniao/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /tentar novamente/i }));

    expect(await screen.findByText(/Reunião com Paulo/)).toBeInTheDocument();
  });

  it("mostra erro quando nao consegue copiar o link", async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });

    render(<RoomPage />);

    await screen.findByText(/Reunião com Paulo/);
    fireEvent.click(screen.getByRole("button", { name: /copiar link/i }));

    expect(await screen.findByText(/nao foi possivel copiar o link/)).toBeInTheDocument();
  });

  it("copia o link de convite", async () => {
    render(<RoomPage />);

    await screen.findByText(/Reunião com Paulo/);
    fireEvent.click(screen.getByRole("button", { name: /copiar link/i }));

    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());
    expect(await screen.findByText("link copiado")).toBeInTheDocument();
  });
});
