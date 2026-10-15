"use client";

import { useEffect, useState } from "react";

import { formatNumber } from "@/lib/format";

const DURATION = 900;

/** A number that rolls up to its value when it first appears (skipped with reduced motion). */
export function CountUp({ value, digits }: { value: number; digits?: number }) {
  const [shown, setShown] = useState(value * 0.85);

  useEffect(() => {
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : DURATION;
    const from = value * 0.85;
    const start = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const t = duration ? Math.min((now - start) / duration, 1) : 1;
      setShown(from + (value - from) * (1 - (1 - t) ** 3));
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [value]);

  // Digits follow the final value so the width doesn't jump when crossing 100.
  return <span className="tabular-nums">{formatNumber(shown, digits ?? (Math.abs(value) >= 100 ? 0 : 1))}</span>;
}
