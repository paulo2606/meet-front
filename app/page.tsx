"use client";

import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/components/auth-context";
import { CameraIcon, PlusIcon } from "@/components/logo";

const HERO_IMAGE =
  "https://images.pexels.com/photos/4226140/pexels-photo-4226140.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2";

export default function Home() {
  const { user, isLoading, logout } = useAuth();

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-3">
          <CameraIcon className="h-8 w-8 text-blue-700" />
          <span className="text-xl font-medium text-zinc-900">Meet</span>
        </Link>
        {!isLoading &&
          (user ? (
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-700 text-sm font-medium text-white">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <button
                type="button"
                onClick={() => logout()}
                className="text-sm font-medium text-blue-700 hover:underline"
              >
                sair
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="text-sm font-medium text-blue-700 hover:underline"
            >
              entrar
            </Link>
          ))}
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center gap-10 px-6 pb-16 lg:flex-row lg:gap-16">
        <div className="flex max-w-xl flex-col items-center gap-6 text-center lg:items-start lg:text-left">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight text-zinc-900 sm:text-5xl">
            Videoconferências de alta qualidade, para todos
          </h1>
          <p className="text-lg leading-relaxed text-zinc-600">
            Conecte-se, colabore e celebre com as pessoas da sua vida no Meet,
            direto do navegador, sem instalar nada.
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            {user ? (
              <>
                <button
                  type="button"
                  disabled
                  className="flex cursor-not-allowed items-center gap-2 rounded-full bg-blue-700 px-6 py-3 text-sm font-medium text-white opacity-50"
                >
                  <PlusIcon className="h-5 w-5" />
                  nova reunião
                </button>
                <p className="text-sm text-zinc-500">
                  conectado como {user.email}
                </p>
              </>
            ) : (
              <>
                <Link
                  href="/register"
                  className="rounded-full bg-blue-700 px-6 py-3 text-sm font-medium text-white hover:bg-blue-800"
                >
                  criar conta
                </Link>
                <Link
                  href="/login"
                  className="rounded-full border border-blue-700 px-6 py-3 text-sm font-medium text-blue-700 hover:bg-blue-50"
                >
                  entrar
                </Link>
              </>
            )}
          </div>
        </div>
        <div className="w-full max-w-lg">
          <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-xl shadow-zinc-200/60">
            <Image
              src={HERO_IMAGE}
              alt="Pessoa em videoconferencia no computador"
              width={1260}
              height={750}
              priority
              className="h-auto w-full object-cover"
            />
          </div>
        </div>
      </main>

      <footer className="px-6 pb-8 text-center text-xs text-zinc-500">
        Compartilhe um link e converse com qualquer pessoa, em qualquer lugar.
      </footer>
    </div>
  );
}
