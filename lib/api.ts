export type AuthUser = {
  userId: string;
  name: string;
  email: string;
  photoUrl: string | null;
};

export type MeetingResponse = {
  id: string;
  code: string;
  createdAtUtc: string;
  hostName: string;
};

export type TokenResponse = AuthUser & {
  accessToken: string;
  expiresAtUtc: string;
};

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5028";

export function resolvePhotoUrl(photoUrl: string | null | undefined): string | null {
  if (!photoUrl) {
    return null;
  }
  return photoUrl.startsWith("/") ? `${API_URL}${photoUrl}` : photoUrl;
}

async function readMessage(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  if (body && typeof body.message === "string") {
    return body.message;
  }
  if (Array.isArray(body) && body.length > 0 && typeof body[0] === "string") {
    return body.join("; ");
  }
  return "";
}

export async function apiRequest<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    throw new ApiError(response.status, await readMessage(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const authApi = {
  register(name: string, email: string, password: string) {
    return apiRequest<TokenResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    });
  },

  login(email: string, password: string) {
    return apiRequest<TokenResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  refresh() {
    return apiRequest<TokenResponse>("/api/auth/refresh", {
      method: "POST",
    });
  },

  logout() {
    return apiRequest<void>("/api/auth/logout", {
      method: "POST",
    });
  },

  guestToken() {
    return apiRequest<{ accessToken: string }>("/api/auth/guest-token", {
      method: "POST",
    });
  },

  me(token: string) {
    return apiRequest<AuthUser>("/api/me", { method: "GET" }, token);
  },
};
