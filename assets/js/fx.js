/* ==========================================================================
   Public-site motion layer (fx.js)
   Smooth scroll (Lenis), scroll reveals, scroll progress hairline, homepage
   hero intro + parallax, magnetic CTAs. Page-to-page View Transitions live in
   CSS (styles-17.css, "Site motion" block).

   Everything here is progressive enhancement: with JS off, reduced motion on,
   or an unsupported browser, the page renders exactly as it did before.
   ========================================================================== */
(() => {
  "use strict";

  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const root = document.documentElement;
  const body = document.body;
  const finePointer = matchMedia("(pointer: fine)").matches;
  // The <head> snippet in _layouts/default.html adds .fx-on before first paint
  // so hidden start states never flash; this confirms the script arrived.
  window.mmFxReady = true;
  root.classList.add("fx-on");

  /* ---------- 1. Smooth scroll (Lenis) ----------
     Desktop mouse/trackpad only, and never Safari: Safari's native scrolling
     runs off the main thread at full refresh rate; JS-driven smooth scroll is
     capped at 60fps there and hitches. Touch devices keep native scrolling. */
  const ua = navigator.userAgent;
  const isSafari = /safari/i.test(ua) && !/chrome|chromium|crios|fxios|edg|android/i.test(ua);

  if (window.Lenis && finePointer && !isSafari) {
    const lenis = new window.Lenis({
      lerp: 0.1,
      autoRaf: true,
      anchors: true, // honors each target's CSS scroll-margin-top (header clearance)
      prevent: (node) => !!(node.closest && node.closest(".lightbox, [data-lenis-prevent]")),
    });

    // Pause while the lightbox or mobile menu holds the page still.
    const syncLock = () => {
      const locked = body.style.overflow === "hidden" || body.classList.contains("menu-open");
      if (locked) lenis.stop();
      else lenis.start();
    };
    new MutationObserver(syncLock).observe(body, { attributes: true, attributeFilter: ["style", "class"] });
  }

  /* ---------- 2. Scroll progress hairline ---------- */
  const bar = document.createElement("div");
  bar.className = "fx-progress";
  bar.setAttribute("aria-hidden", "true");
  body.appendChild(bar);

  let progressQueued = false;
  const paintProgress = () => {
    progressQueued = false;
    const max = root.scrollHeight - innerHeight;
    // Short pages have nothing to track.
    bar.style.opacity = max > innerHeight * 0.5 ? "1" : "0";
    bar.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
  };
  const queueProgress = () => {
    if (progressQueued) return;
    progressQueued = true;
    requestAnimationFrame(paintProgress);
  };
  addEventListener("scroll", queueProgress, { passive: true });
  addEventListener("resize", queueProgress);
  addEventListener("load", queueProgress);
  paintProgress();

  /* ---------- 3. Homepage hero ---------- */
  const hero = document.querySelector("body.home .hero");
  if (hero) {
    // Headline word reveal + intro are pure CSS (word spans live in index.html).
    // Photo drifts inside its frame as the hero scrolls away.
    const img = hero.querySelector(".hero-media img");
    const copy = hero.querySelector(".hero-content");
    if (img) {
      let heroQueued = false;
      const paintHero = () => {
        heroQueued = false;
        const r = hero.getBoundingClientRect();
        if (r.bottom < 0) return;
        const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height))); // 0 → 1 as hero leaves
        img.style.transform = `translate3d(0, ${(p * 12 - 4).toFixed(2)}%, 0) scale(1.12)`;
        if (copy) {
          copy.style.transform = `translate3d(0, ${(p * 60).toFixed(1)}px, 0)`;
          copy.style.opacity = String(Math.max(0, 1 - p * 1.6));
        }
      };
      const queueHero = () => {
        if (heroQueued) return;
        heroQueued = true;
        requestAnimationFrame(paintHero);
      };
      addEventListener("scroll", queueHero, { passive: true });
      addEventListener("resize", queueHero);
      paintHero();
    }
  }

  /* ---------- 4. Scroll reveals ----------
     Content blocks only — never form fields, the track timeline, or anything
     interactive mid-task. Classes are removed once a reveal finishes so no
     transform/filter is left behind to affect layout or fixed children. */
  const REVEAL = [
    ".mm-section-intro",
    ".home-trust-cue",
    ".home-latest-article-row",
    ".home-newsletter-copy",
    ".home-trust-panel > div",
    ".home-service-item",
    ".home-actions",
    ".gallery-strip",
    ".reviews-grid",
    ".mm-final-actions",
    ".service-item",
    ".process-journey-item",
    ".process-shot",
    ".process-review-item",
    ".relacing-info-item",
    ".relacing-faq-item",
    ".care-index-item",
    ".about-photo",
    ".about-story",
  ].join(",");

  // CSS hides every REVEAL match from first paint; anything we won't animate
  // gets .fx-done right away so it shows.
  const all = Array.from(document.querySelectorAll(REVEAL));
  const settle = (el) => el.classList.add("fx-done");
  const targets = all.filter((el) => {
    const skip =
      el.parentElement.closest(".hero, form, .track-timeline, .lightbox") ||
      all.some((other) => other !== el && other.contains(el)); // nested: parent animates
    if (skip) settle(el);
    return !skip;
  });

  if (!("IntersectionObserver" in window)) targets.forEach(settle);
  else if (targets.length) {
    const finish = (el) => {
      el.classList.add("fx-done");
      el.classList.remove("is-in");
      el.style.transitionDelay = "";
    };
    const reveal = (el, delay) => {
      el.style.transitionDelay = `${delay}ms`;
      el.classList.add("is-in");
      el.addEventListener("transitionend", () => finish(el), { once: true });
      setTimeout(() => finish(el), 1400 + delay); // safety net
    };

    const pending = new Set();
    const release = (els) => {
      els
        .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
        .forEach((el, i) => {
          if (!pending.delete(el)) return;
          io.unobserve(el);
          reveal(el, Math.min(i, 5) * 80);
        });
    };

    const io = new IntersectionObserver(
      (entries) => release(entries.filter((e) => e.isIntersecting).map((e) => e.target)),
      { rootMargin: "0px 0px -8% 0px" }
    );

    // A jump (anchor link, End key, scrollbar drag) can carry blocks from below
    // the viewport to above it without ever intersecting; show those too.
    let sweepQueued = false;
    const sweep = () => {
      sweepQueued = false;
      release([...pending].filter((el) => el.getBoundingClientRect().top < innerHeight));
      if (!pending.size) removeEventListener("scroll", queueSweep);
    };
    const queueSweep = () => {
      if (sweepQueued) return;
      sweepQueued = true;
      requestAnimationFrame(sweep);
    };
    addEventListener("scroll", queueSweep, { passive: true });

    targets.forEach((el) => {
      // Anything already above the viewport (anchor/hash load) just shows.
      if (el.getBoundingClientRect().bottom < 0) return settle(el);
      pending.add(el);
      io.observe(el);
    });
  }

  /* ---------- 5. Stacking cards (homepage "How it works") ----------
     No pinning: progress comes from where the deck sits in the viewport.
     p = 0 when its top is near the bottom of the screen, 1 when it reaches
     ~45% from the top. Later cards rise onto the deck in turn; cards beneath
     get --fx-depth (0 → n) so they shrink and dim. */
  const deck = document.querySelector("body.home .home-process-grid");
  const stack = deck ? Array.from(deck.querySelectorAll(".home-process-step")) : [];
  if (stack.length > 1) {
    const n = stack.length;
    const clamp = (v) => Math.min(1, Math.max(0, v));
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    let stackQueued = false;
    const paintStack = () => {
      stackQueued = false;
      const r = deck.getBoundingClientRect();
      if (r.bottom < -200 || r.top > innerHeight + 200) return;
      const p = clamp((innerHeight * 0.92 - r.top) / (innerHeight * 0.47));
      const e = stack.map((_, i) => (i === 0 ? 1 : ease(clamp((p / 0.9) * (n - 1) - (i - 1)))));
      stack.forEach((el, i) => {
        let depth = 0;
        for (let j = i + 1; j < n; j++) depth += e[j];
        el.style.transform = `translate3d(0, ${((1 - e[i]) * 64).toFixed(1)}px, 0) scale(${(1 - depth * 0.05).toFixed(4)})`;
        el.style.opacity = i === 0 ? "" : clamp(e[i] * 1.6).toFixed(3);
        el.style.setProperty("--fx-depth", depth.toFixed(3));
      });
    };
    const queueStack = () => {
      if (stackQueued) return;
      stackQueued = true;
      requestAnimationFrame(paintStack);
    };
    addEventListener("scroll", queueStack, { passive: true });
    addEventListener("resize", queueStack);
    paintStack();
  }

  /* ---------- 6. Magnetic CTAs (mouse only) ---------- */
  if (finePointer) {
    document.querySelectorAll(".hero .btn-primary, .mm-final-cta .btn-primary").forEach((btn) => {
      let x = 0, y = 0, tx = 0, ty = 0, raf = 0;
      const step = () => {
        x += (tx - x) * 0.18;
        y += (ty - y) * 0.18;
        btn.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
        if (Math.abs(tx - x) > 0.1 || Math.abs(ty - y) > 0.1) raf = requestAnimationFrame(step);
        else raf = 0;
      };
      const kick = () => { if (!raf) raf = requestAnimationFrame(step); };
      btn.classList.add("fx-magnetic");
      btn.addEventListener("pointermove", (e) => {
        if (e.pointerType !== "mouse") return;
        const r = btn.getBoundingClientRect();
        tx = (e.clientX - r.left - r.width / 2) * 0.3;
        ty = (e.clientY - r.top - r.height / 2) * 0.3;
        kick();
      });
      btn.addEventListener("pointerleave", () => { tx = 0; ty = 0; kick(); });
    });
  }
})();
