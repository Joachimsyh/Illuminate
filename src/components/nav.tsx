"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import clsx from "clsx";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/events", label: "Events" },
];

export function Nav() {
  const pathname = usePathname();
  const { data: session } = useSession();

  if (
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/" ||
    pathname === "/onboarding"
  )
    return null;

  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="sticky top-0 z-40 border-b border-white/5 bg-ink-950/60 backdrop-blur-xl"
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/dashboard" className="group flex items-center gap-2.5">
          <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-lumen-400/15 ring-1 ring-lumen-300/30">
            <Sparkles className="h-4 w-4 text-lumen-300" />
            <span className="absolute inset-0 animate-pulse-soft rounded-xl bg-lumen-400/10" />
          </span>
          <span className="font-display text-lg tracking-tight text-mist-100">
            Illumi<span className="text-lumen-300">nate</span>
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          {links.map((link) => {
            const active = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={clsx(
                  "relative rounded-lg px-3 py-2 text-sm transition",
                  active ? "text-white" : "text-mist-300 hover:text-mist-100"
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-lg bg-white/5 ring-1 ring-white/10"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{link.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          {session?.user && (
            <>
              <Link
                href="/profile"
                className="group flex items-center gap-3 rounded-full py-1 pl-1 pr-2 transition hover:bg-white/5"
                title="Open profile"
              >
                <div className="hidden text-right sm:block">
                  <p className="text-sm text-mist-100 group-hover:text-lumen-200">
                    {session.user.name}
                  </p>
                  <p className="text-xs text-mist-400">
                    {session.user.headline || "Edit profile"}
                  </p>
                </div>
                {session.user.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={session.user.image}
                    alt=""
                    className="h-9 w-9 rounded-full ring-2 ring-lumen-400/30 transition group-hover:ring-lumen-300/60"
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-lumen-400/20 text-sm font-semibold text-lumen-200 ring-2 ring-lumen-400/30">
                    {(session.user.name || "?").slice(0, 1).toUpperCase()}
                  </div>
                )}
              </Link>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="rounded-lg px-2.5 py-1.5 text-xs text-mist-400 transition hover:bg-white/5 hover:text-mist-100"
              >
                Sign out
              </button>
            </>
          )}
        </div>
      </div>
    </motion.header>
  );
}
