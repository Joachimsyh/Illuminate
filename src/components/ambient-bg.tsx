"use client";

import { motion, useMotionValue, useSpring } from "framer-motion";
import { useEffect } from "react";

export function AmbientBg() {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 40, damping: 20 });
  const springY = useSpring(y, { stiffness: 40, damping: 20 });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      x.set((e.clientX / window.innerWidth - 0.5) * 40);
      y.set((e.clientY / window.innerHeight - 0.5) * 40);
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [x, y]);

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-ink-950" />
      <div className="absolute inset-0 bg-aurora" />
      <motion.div
        style={{ x: springX, y: springY }}
        className="absolute -left-24 top-10 h-[420px] w-[420px] rounded-full bg-lumen-400/20 blur-[100px]"
      />
      <motion.div
        style={{ x: springX, y: springY }}
        className="absolute right-[-80px] top-32 h-[380px] w-[380px] rounded-full bg-sky-500/15 blur-[110px]"
      />
      <motion.div
        animate={{ opacity: [0.35, 0.7, 0.35], scale: [1, 1.08, 1] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        className="absolute bottom-[-120px] left-1/3 h-[420px] w-[520px] rounded-full bg-lumen-500/10 blur-[120px]"
      />
      <div className="absolute inset-0 bg-grain opacity-60 mix-blend-overlay" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-ink-950/80" />
    </div>
  );
}
