"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth-context";
import { Avatar } from "@/components/avatar";
import { Logo } from "@/components/logo";
import { resolvePhotoUrl } from "@/lib/api";

const AVATAR_IDS = Array.from({ length: 12 }, (_, index) => index + 1);
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export default function AccountPage() {
  const { user, isLoading, authRequest, updatePhoto } = useAuth();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [saving, setSaving] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [isLoading, user, router]);

  if (isLoading || !user) {
    return null;
  }

  async function chooseAvatar(avatarId: number) {
    setSaving(avatarId);
    setError("");
    try {
      const result = await authRequest<{ photoUrl: string }>("/api/me/photo", {
        method: "PUT",
        body: JSON.stringify({ avatarId }),
      });
      updatePhoto(result.photoUrl);
      setPreview(null);
    } catch {
      setError("nao foi possivel atualizar a foto");
    } finally {
      setSaving(null);
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file) {
      return;
    }
    setError("");
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("tipo de arquivo invalido (use jpg, png ou webp)");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError("arquivo muito grande (maximo 5 MB)");
      return;
    }
    setPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await authRequest<{ photoUrl: string }>("/api/me/photo/upload", {
        method: "POST",
        body: formData,
      });
      updatePhoto(result.photoUrl);
      setPreview(null);
    } catch {
      setError("nao foi possivel enviar a foto");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <Logo />
        <Link
          href="/"
          className="rounded-box px-4 py-2 text-sm font-medium text-accent transition hover:bg-accent-soft"
        >
          voltar
        </Link>
      </header>

      <main
        id="main"
        className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 pb-16"
      >
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 shrink-0">
            <Avatar photoUrl={user.photoUrl} name={user.name} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold text-ink">conta</h1>
            <p className="text-sm text-ink-3">{user.email}</p>
          </div>
        </div>

        <section
          aria-labelledby="avatar-title"
          className="rounded-box border border-line bg-surface p-6 shadow-near"
        >
          <h2 id="avatar-title" className="font-display text-lg font-semibold text-ink">
            escolher um avatar
          </h2>
          <div className="mt-4 grid grid-cols-4 gap-3 sm:grid-cols-6">
            {AVATAR_IDS.map((avatarId) => {
              const isSaving = saving === avatarId;
              const isSelected = user.photoUrl === `/avatars/${avatarId}.svg`;
              return (
                <button
                  key={avatarId}
                  type="button"
                  aria-label={`escolher avatar ${avatarId}`}
                  aria-pressed={isSelected}
                  disabled={saving !== null && !isSaving}
                  onClick={() => chooseAvatar(avatarId)}
                  className={`relative aspect-square overflow-hidden rounded-box transition ${
                    isSelected
                      ? "ring-2 ring-accent"
                      : "ring-1 ring-line hover:ring-accent"
                  }`}
                >
                  {isSaving ? (
                    <span className="flex h-full w-full items-center justify-center bg-line text-sm text-ink-2">
                      salvando...
                    </span>
                  ) : (
                    <Image
                      src={resolvePhotoUrl(`/avatars/${avatarId}.svg`) ?? ""}
                      alt=""
                      fill
                      unoptimized
                      sizes="6rem"
                      className="object-cover"
                    />
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-4 text-sm text-ink-3">
            avatares prontos do estúdio. também pode enviar sua própria foto abaixo.
          </p>
        </section>

        <section
          aria-labelledby="upload-title"
          className="rounded-box border border-line bg-surface p-6 shadow-near"
        >
          <h2 id="upload-title" className="font-display text-lg font-semibold text-ink">
            enviar uma foto
          </h2>
          <div className="mt-4 flex items-center gap-4">
            {preview && (
              <div className="relative h-16 w-16 overflow-hidden rounded-full">
                <Image
                  src={preview}
                  alt="prévia da foto"
                  fill
                  unoptimized
                  sizes="4rem"
                  className="object-cover"
                />
              </div>
            )}
            <label className="flex h-11 cursor-pointer items-center justify-center rounded-box border border-line bg-surface px-5 text-sm font-medium text-ink transition hover:border-accent hover:text-accent">
              {uploading ? "enviando..." : "escolher arquivo"}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label="enviar foto do perfil"
                className="sr-only"
                disabled={uploading}
                onChange={(event) => {
                  void handleFile(event.target.files?.[0]);
                }}
              />
            </label>
            <p className="text-sm text-ink-3">jpg, png ou webp · até 5 MB</p>
          </div>
        </section>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </main>
    </div>
  );
}
