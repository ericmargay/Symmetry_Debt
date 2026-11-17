"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { HeroPalette, HeroScene as Scene, RGB } from "./hero-scene-gl";

const FALLBACK_LIGHT = {
  agreed: [0.0, 0.37, 0.36],
  personal: [0.36, 0.4, 0.48],
  waiting: [0.78, 0.55, 0.12],
  ink: [0.13, 0.15, 0.18],
} satisfies Record<string, RGB>;

const FALLBACK_DARK = {
  agreed: [0.45, 0.8, 0.78],
  personal: [0.66, 0.7, 0.78],
  waiting: [0.95, 0.75, 0.3],
  ink: [0.93, 0.93, 0.9],
} satisfies Record<string, RGB>;

/**
 * Reads a theme colour (written in oklch) as sRGB by painting it on a 1×1 canvas. A browser
 * that cannot parse the value leaves the sentinel colour in place, and the fallback is used.
 */
function readColor(context: CanvasRenderingContext2D, name: string, fallback: RGB): RGB {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!value) return fallback;
  const sentinel = "#010203";
  context.fillStyle = sentinel;
  context.fillStyle = value;
  if (context.fillStyle === sentinel) return fallback;
  context.clearRect(0, 0, 1, 1);
  context.fillRect(0, 0, 1, 1);
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
  return [r / 255, g / 255, b / 255];
}

function readPalette(): HeroPalette {
  const dark = document.documentElement.classList.contains("dark");
  const fallback = dark ? FALLBACK_DARK : FALLBACK_LIGHT;
  const probe = document.createElement("canvas");
  probe.width = 1;
  probe.height = 1;
  const context = probe.getContext("2d", { willReadFrequently: true });
  if (!context) return { ...fallback, dark };
  return {
    agreed: readColor(context, "--agreed", fallback.agreed),
    personal: readColor(context, "--personal", fallback.personal),
    waiting: readColor(context, "--waiting", fallback.waiting),
    ink: readColor(context, "--foreground", fallback.ink),
    dark,
  };
}

/**
 * The 3D centrepiece of the hero (see `hero-scene-gl.ts`). Until three.js has loaded — and for
 * good when WebGL is not available — the static two-halves backdrop stands in for it.
 *
 * The scene listens to the page: scrolling through the hero or hovering the illustration
 * (`[data-hero-visual]`) brings the halves together; on touch screens a tap does it for a moment.
 * It only animates while it is on screen and the tab is visible, and draws one still frame when
 * the visitor prefers reduced motion.
 */
export function HeroScene({ className }: { className?: string }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    const stage = stageRef.current;
    const host = canvasRef.current;
    if (!stage || !host) return;

    let cancelled = false;
    let scene: Scene | null = null;
    const cleanups: Array<() => void> = [];
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const modest = stage.clientWidth < 420 || (navigator.hardwareConcurrency ?? 8) <= 4;

    import("./hero-scene-gl")
      .then(({ createHeroScene }) => {
        if (cancelled) return;
        scene = createHeroScene(host, readPalette(), {
          reducedMotion,
          pointsPerHalf: modest ? 1800 : 3200,
          onContextLost: () => setState("failed"),
        });
        if (!scene) {
          setState("failed");
          return;
        }
        const active = scene;

        const resize = new ResizeObserver(([entry]) => {
          const { width, height } = entry.contentRect;
          active.resize(Math.round(width), Math.round(height));
        });
        resize.observe(host);
        cleanups.push(() => resize.disconnect());

        let onScreen = false;
        const sync = () => active.setRunning(onScreen && document.visibilityState === "visible");
        const visibility = new IntersectionObserver(([entry]) => {
          onScreen = entry.isIntersecting;
          sync();
        });
        visibility.observe(stage);
        document.addEventListener("visibilitychange", sync);
        cleanups.push(() => {
          visibility.disconnect();
          document.removeEventListener("visibilitychange", sync);
        });

        // The theme can change at any time (toggle, or the system setting).
        const theme = new MutationObserver(() => active.setPalette(readPalette()));
        theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
        cleanups.push(() => theme.disconnect());

        if (!reducedMotion) {
          const section = stage.closest("section");
          const onScroll = () => {
            if (!section) return;
            const rect = section.getBoundingClientRect();
            active.setScroll(-rect.top / Math.max(1, rect.height * 0.5));
          };
          onScroll();
          window.addEventListener("scroll", onScroll, { passive: true });
          cleanups.push(() => window.removeEventListener("scroll", onScroll));

          if (window.matchMedia("(pointer: fine)").matches) {
            const onMove = (event: PointerEvent) =>
              active.setPointer((event.clientX / window.innerWidth) * 2 - 1, (event.clientY / window.innerHeight) * 2 - 1);
            window.addEventListener("pointermove", onMove, { passive: true });
            cleanups.push(() => window.removeEventListener("pointermove", onMove));
          }

          const visual = stage.closest<HTMLElement>("[data-hero-visual]");
          if (visual) {
            let release = 0;
            const enter = (event: PointerEvent) => {
              if (event.pointerType === "mouse") active.setHover(true);
            };
            const leave = (event: PointerEvent) => {
              if (event.pointerType === "mouse") active.setHover(false);
            };
            // Touch has no hover: a tap closes the halves for a moment.
            const tap = (event: PointerEvent) => {
              if (event.pointerType === "mouse") return;
              active.setHover(true);
              window.clearTimeout(release);
              release = window.setTimeout(() => active.setHover(false), 2600);
            };
            visual.addEventListener("pointerenter", enter);
            visual.addEventListener("pointerleave", leave);
            visual.addEventListener("pointerdown", tap);
            cleanups.push(() => {
              window.clearTimeout(release);
              visual.removeEventListener("pointerenter", enter);
              visual.removeEventListener("pointerleave", leave);
              visual.removeEventListener("pointerdown", tap);
            });
          }
        }

        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("failed");
      });

    return () => {
      cancelled = true;
      for (const cleanup of cleanups) cleanup();
      scene?.dispose();
    };
  }, []);

  return (
    <div ref={stageRef} aria-hidden data-hero-scene={state} className={cn("pointer-events-none", className)}>
      {/* Static stand-in: two half discs, one per side. */}
      <div
        className={cn(
          "absolute inset-[18%] transition-opacity duration-1000",
          state === "ready" ? "opacity-0" : "opacity-100",
        )}
      >
        <div className="absolute inset-y-0 left-0 w-[calc(50%-0.4rem)] rounded-l-full bg-personal/[0.12]" />
        <div className="absolute inset-y-0 right-0 w-[calc(50%-0.4rem)] rounded-r-full bg-agreed/[0.14]" />
      </div>
      <div ref={canvasRef} className={cn("absolute inset-0 transition-opacity duration-1000", state === "ready" ? "opacity-100" : "opacity-0")} />
    </div>
  );
}
