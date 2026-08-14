import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "@/components/auth-context";
import { ApiError, authApi, type AuthUser, type TokenResponse } from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    authApi: {
      register: vi.fn(),
      login: vi.fn(),
      refresh: vi.fn(),
      logout: vi.fn(),
      me: vi.fn(),
    },
  };
});

const tokenResponse = (overrides: Partial<TokenResponse> = {}) => ({
  accessToken: "token-123",
  expiresAtUtc: "2030-01-01T00:00:00Z",
  userId: "user-1",
  name: "Paulo",
  email: "paulo@test.com",
  photoUrl: null,
  ...overrides,
});

const mocked = vi.mocked(authApi);

function Consumer() {
  const { user, isLoading, login, logout } = useAuth();
  return (
    <div>
      <span>{isLoading ? "carregando" : (user?.name ?? "deslogado")}</span>
      <button onClick={() => login("paulo@test.com", "senha-segura-123")}>entrar</button>
      <button onClick={() => logout()}>sair</button>
    </div>
  );
}

async function renderReady() {
  mocked.refresh.mockRejectedValue(new ApiError(401, ""));
  mocked.login.mockResolvedValue(tokenResponse());
  mocked.logout.mockResolvedValue();
  const utils = render(
    <AuthProvider>
      <Consumer />
    </AuthProvider>,
  );
  await waitFor(() => expect(screen.getByText("deslogado")).toBeInTheDocument());
  return utils;
}

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("restaura a sessao no carregamento inicial via refresh", async () => {
    mocked.refresh.mockResolvedValue(tokenResponse());

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText("Paulo")).toBeInTheDocument());
  });

  it("segue deslogado quando o refresh retorna 401", async () => {
    await renderReady();

    expect(screen.getByText("deslogado")).toBeInTheDocument();
  });

  it("login autentica e expoe o usuario", async () => {
    renderReady();

    await act(async () => {
      screen.getByRole("button", { name: "entrar" }).click();
    });

    expect(screen.getByText("Paulo")).toBeInTheDocument();
  });

  it("login expoe a foto do usuario", async () => {
    mocked.refresh.mockRejectedValue(new ApiError(401, ""));
    mocked.login.mockResolvedValue(tokenResponse({ photoUrl: "/avatars/1.svg" }));

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login("paulo@test.com", "senha-segura-123");
    });

    expect(result.current.user?.photoUrl).toBe("/avatars/1.svg");
  });

  it("updatePhoto atualiza a foto do usuario", async () => {
    mocked.refresh.mockRejectedValue(new ApiError(401, ""));
    mocked.login.mockResolvedValue(tokenResponse());

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login("paulo@test.com", "senha-segura-123");
    });

    await act(async () => {
      result.current.updatePhoto("/avatars/5.svg");
    });

    expect(result.current.user?.photoUrl).toBe("/avatars/5.svg");
  });

  it("logout limpa o usuario e chama a api", async () => {
    renderReady();

    await act(async () => {
      screen.getByRole("button", { name: "entrar" }).click();
    });
    expect(screen.getByText("Paulo")).toBeInTheDocument();

    await act(async () => {
      screen.getByRole("button", { name: "sair" }).click();
    });

    expect(mocked.logout).toHaveBeenCalledTimes(1);
    expect(screen.getByText("deslogado")).toBeInTheDocument();
  });

  it("authRequest tenta renovar a sessao ao receber 401 e refaz a requisicao", async () => {
    mocked.refresh.mockRejectedValue(new ApiError(401, ""));
    mocked.login.mockResolvedValue(tokenResponse({ accessToken: "token-velho" }));

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.login("paulo@test.com", "senha-segura-123");
    });

    let calls = 0;
    const mockFetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(null, { status: 401 });
      }
      return Response.json({ userId: "user-1", name: "Paulo", email: "paulo@test.com", photoUrl: null } satisfies AuthUser);
    });

    mocked.refresh.mockResolvedValue(tokenResponse({ accessToken: "token-novo" }));

    const data = await result.current.authRequest<AuthUser>("/api/me");

    expect(data.email).toBe("paulo@test.com");
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mocked.refresh).toHaveBeenCalledTimes(2);
    mockFetch.mockRestore();
  });
});
