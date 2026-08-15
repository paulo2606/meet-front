import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AccountPage from "@/app/conta/page";
import type { AuthUser } from "@/lib/api";

const replaceMock = vi.fn();
const authRequestMock = vi.fn();
const updatePhotoMock = vi.fn();

let currentUser: AuthUser | null = { userId: "user-1", name: "Paulo", email: "paulo@test.com", photoUrl: null };
let currentLoading = false;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock("@/components/auth-context", () => ({
  useAuth: () => ({
    user: currentUser,
    isLoading: currentLoading,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    updatePhoto: updatePhotoMock,
    getAccessToken: vi.fn(async () => "token-acesso"),
    authRequest: authRequestMock,
  }),
}));

describe("conta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = { userId: "user-1", name: "Paulo", email: "paulo@test.com", photoUrl: null };
    currentLoading = false;
    authRequestMock.mockResolvedValue({ photoUrl: "/avatars/3.svg" });
    Object.defineProperty(URL, "createObjectURL", {
      value: vi.fn(() => "blob:preview"),
      configurable: true,
      writable: true,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      value: vi.fn(),
      configurable: true,
      writable: true,
    });
  });

  it("mostra os avatares prontos e escolher um atualiza o perfil", async () => {
    render(<AccountPage />);

    expect(screen.getAllByRole("button", { name: /escolher avatar/ })).toHaveLength(12);

    fireEvent.click(screen.getByRole("button", { name: "escolher avatar 3" }));

    await waitFor(() =>
      expect(authRequestMock).toHaveBeenCalledWith("/api/me/photo", {
        method: "PUT",
        body: JSON.stringify({ avatarId: 3 }),
      }),
    );
    await waitFor(() => expect(updatePhotoMock).toHaveBeenCalledWith("/avatars/3.svg"));
  });

  it("mostra erro quando falha ao escolher avatar", async () => {
    authRequestMock.mockRejectedValue(new Error("falha"));

    render(<AccountPage />);
    fireEvent.click(screen.getByRole("button", { name: "escolher avatar 3" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("nao foi possivel atualizar a foto");
  });

  it("recusa arquivo com tipo invalido", async () => {
    render(<AccountPage />);

    const file = new File(["ola"], "nota.txt", { type: "text/plain" });
    fireEvent.change(screen.getByLabelText("enviar foto do perfil"), { target: { files: [file] } });

    expect(await screen.findByRole("alert")).toHaveTextContent("tipo de arquivo invalido");
    expect(authRequestMock).not.toHaveBeenCalled();
  });

  it("recusa arquivo acima de 5 MB", async () => {
    render(<AccountPage />);

    const file = new File([new Uint8Array(6 * 1024 * 1024)], "foto.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("enviar foto do perfil"), { target: { files: [file] } });

    expect(await screen.findByRole("alert")).toHaveTextContent("arquivo muito grande (maximo 5 MB)");
    expect(authRequestMock).not.toHaveBeenCalled();
  });

  it("envia foto valida e atualiza o perfil", async () => {
    authRequestMock.mockResolvedValue({ photoUrl: "/uploads/user-1/foto.png" });

    render(<AccountPage />);

    const file = new File([new Uint8Array(8)], "foto.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("enviar foto do perfil"), { target: { files: [file] } });

    await waitFor(() => expect(authRequestMock).toHaveBeenCalled());
    const [path, init] = authRequestMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/me/photo/upload");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    await waitFor(() => expect(updatePhotoMock).toHaveBeenCalledWith("/uploads/user-1/foto.png"));
  });

  it("redireciona para o login quando nao esta autenticado", async () => {
    currentUser = null;

    render(<AccountPage />);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/login"));
  });
});
