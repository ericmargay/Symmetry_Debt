"use client";

import { useEffect } from "react";
import { formatMoney } from "@/domain/money";

/**
 * Motion for the landing page, driven by data attributes so the sections stay server components:
 *
 *   data-reveal        fades and rises into place the first time it scrolls into view. Only what
 *                      is still below the fold when the page loads is hidden first, so nothing the
 *                      visitor has already seen ever disappears, and without JavaScript everything
 *                      is simply there. Elements entering together are staggered.
 *   data-tilt          leans towards a fine pointer (mouse, trackpad), with a soft glare.
 *   data-countup       an amount (minor units) that counts up when it is revealed. Its own text
 *                      is put back at the end, so the final figure is exactly the server's.
 *   html[data-at-top]  set while the page is at the very top, for the header.
 *
 * All of it is skipped when the visitor prefers reduced motion (the header state excepted).
 */
export function LandingEffects() {
  useEffect(() => {
    const root = document.documentElement;
    const cleanups: Array<() => void> = [];

    const onScroll = () => root.toggleAttribute("data-at-top", window.scrollY <= 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    cleanups.push(() => {
      window.removeEventListener("scroll", onScroll);
      root.removeAttribute("data-at-top");
    });

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) return () => cleanups.forEach((cleanup) => cleanup());

    // ── Reveal ──
    if ("IntersectionObserver" in window) {
      const fold = window.innerHeight * 0.9;
      const pending = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]")).filter(
        (element) => element.getBoundingClientRect().top > fold,
      );
      for (const element of pending) element.dataset.reveal = "pending";

      const observer = new IntersectionObserver(
        (entries) => {
          const entering = entries
            .filter((entry) => entry.isIntersecting)
            .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left);
          entering.forEach((entry, index) => {
            const element = entry.target as HTMLElement;
            observer.unobserve(element);
            const delay = Math.min(index, 6) * 80;
            element.style.setProperty("--reveal-delay", `${delay}ms`);
            element.dataset.reveal = "shown";
            for (const amount of element.querySelectorAll<HTMLElement>("[data-countup]")) countUp(amount, delay + 150);
          });
        },
        { rootMargin: "0px 0px -6% 0px", threshold: 0.06 },
      );
      for (const element of pending) observer.observe(element);

      // Printing (or saving as PDF) must show everything.
      const showAll = () => {
        for (const element of pending) element.dataset.reveal = "shown";
      };
      window.addEventListener("beforeprint", showAll);
      cleanups.push(() => {
        observer.disconnect();
        window.removeEventListener("beforeprint", showAll);
      });
    }

    // ── Tilt ──
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      for (const element of document.querySelectorAll<HTMLElement>("[data-tilt]")) {
        const strength = Number(element.dataset.tilt) || 6;
        let frame = 0;
        const move = (event: PointerEvent) => {
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(() => {
            const rect = element.getBoundingClientRect();
            const x = (event.clientX - rect.left) / rect.width;
            const y = (event.clientY - rect.top) / rect.height;
            element.style.setProperty("--tilt-x", `${((0.5 - y) * strength).toFixed(2)}deg`);
            element.style.setProperty("--tilt-y", `${((x - 0.5) * strength).toFixed(2)}deg`);
            element.style.setProperty("--glare-x", `${(x * 100).toFixed(1)}%`);
            element.style.setProperty("--glare-y", `${(y * 100).toFixed(1)}%`);
            element.dataset.tilting = "";
          });
        };
        const leave = () => {
          cancelAnimationFrame(frame);
          delete element.dataset.tilting;
          element.style.setProperty("--tilt-x", "0deg");
          element.style.setProperty("--tilt-y", "0deg");
        };
        element.addEventListener("pointermove", move);
        element.addEventListener("pointerleave", leave);
        cleanups.push(() => {
          cancelAnimationFrame(frame);
          element.removeEventListener("pointermove", move);
          element.removeEventListener("pointerleave", leave);
        });
      }
    }

    return () => cleanups.forEach((cleanup) => cleanup());
  }, []);

  return null;
}

/** Counts an amount up from zero, then restores the exact text the server rendered. */
function countUp(element: HTMLElement, delay: number) {
  const target = Number(element.dataset.countup);
  const currency = element.dataset.currency;
  const locale = element.dataset.locale;
  if (!Number.isFinite(target) || !currency || !locale) return;
  const original = element.textContent;
  const prefix = element.dataset.prefix ?? "";
  const duration = 1100;
  let start = 0;
  const step = (now: number) => {
    if (!start) start = now;
    const t = Math.min(1, (now - start - delay) / duration);
    if (t >= 1) {
      element.textContent = original;
      return;
    }
    const eased = t <= 0 ? 0 : 1 - (1 - t) ** 3;
    element.textContent = prefix + formatMoney(BigInt(Math.round(target * eased)), currency, locale);
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
