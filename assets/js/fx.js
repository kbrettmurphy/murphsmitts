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
    // Headline rises word by word from behind a mask.
    const h1 = hero.querySelector("h1");
    if (h1 && h1.children.length === 0) {
      const text = h1.textContent.trim();
      h1.setAttribute("aria-label", text);
      h1.textContent = "";
      text.split(/\s+/).forEach((word, i, all) => {
        const mask = document.createElement("span");
        mask.className = "fx-word";
        mask.setAttribute("aria-hidden", "true");
        const inner = document.createElement("span");
        inner.textContent = word;
        inner.style.animationDelay = `${0.1 + i * 0.07}s`;
        mask.appendChild(inner);
        h1.appendChild(mask);
        if (i < all.length - 1) h1.appendChild(document.createTextNode(" "));
      });
    }
    hero.classList.add("fx-hero");

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
    ".home-process-step",
    ".home-actions",
    ".home-similar-search",
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

  const targets = Array.from(document.querySelectorAll(REVEAL)).filter(
    (el) => !el.closest(".hero, form, .track-timeline, .lightbox") && !el.parentElement.closest(".fx-reveal")
  );

  if (targets.length && "IntersectionObserver" in window) {
    const finish = (el) => {
      el.classList.remove("fx-reveal", "is-in");
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
      if (el.getBoundingClientRect().bottom < 0) return;
      el.classList.add("fx-reveal");
      pending.add(el);
      io.observe(el);
    });
  }

  /* ---------- 5. Magnetic CTAs (mouse only) ---------- */
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
