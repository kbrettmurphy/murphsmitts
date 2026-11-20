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

  /* ---------- 5. Stacking cards ----------
     Card 1 sits alone on the deck; later cards wait just below its bottom
     edge (hidden by a CSS mask fade at the deck's bottom) and rise onto it in turn as the deck's
     top travels from `from` to `to` (fractions of viewport height), tracking
     the scroll 1:1. Each card lands `peek` px below the previous one. Cards
     beneath get --fx-depth (0 → n) so they shrink and dim.
       Homepage "How it works": tight 16px deck (a teaser; links to Process).
       Process "From request to return": ~50px peek so every step's number
       and title stays readable in the finished deck, like file tabs. */
  const setupStack = (deck, cardSel, opts) => {
    const stack = deck ? Array.from(deck.querySelectorAll(cardSel)) : [];
    if (stack.length < 2) return;
    const n = stack.length;
    const clamp = (v) => Math.min(1, Math.max(0, v));
    const smooth = (t) => t * t * (3 - 2 * t); // gentle in/out at each card's ends only
    let drop = [];
    const measure = () => {
      // Every card gets the tallest card's natural height, so empty space
      // doesn't compound layer by layer (CSS sets align-self: start).
      stack.forEach((el) => { el.style.minHeight = ""; });
      const tallest = Math.max(...stack.map((el) => el.offsetHeight));
      stack.forEach((el) => { el.style.minHeight = `${tallest}px`; });
      // Distance that puts each card's top below the deck's bottom edge plus
      // its 32px fade band. offsetTop ignores transforms.
      const cs = getComputedStyle(deck);
      const content = deck.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const base = stack[0].offsetTop;
      drop = stack.map((el) => content - (el.offsetTop - base) + 32);
    };
    let queued = false;
    const paint = () => {
      queued = false;
      const r = deck.getBoundingClientRect();
      if (r.bottom < -400 || r.top > innerHeight + 400) return;
      const p = clamp((innerHeight * opts.from - r.top) / (innerHeight * (opts.from - opts.to)));
      const e = stack.map((_, i) => (i === 0 ? 1 : smooth(clamp(p * (n - 1) - (i - 1)))));
      stack.forEach((el, i) => {
        let depth = 0;
        for (let j = i + 1; j < n; j++) depth += e[j];
        el.style.transform = `translate3d(0, ${(drop[i] * (1 - e[i])).toFixed(1)}px, 0) scale(${(1 - depth * opts.shrink).toFixed(4)})`;
        el.style.setProperty("--fx-depth", depth.toFixed(3));
      });
    };
    const queue = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(paint);
    };
    addEventListener("scroll", queue, { passive: true });
    addEventListener("resize", () => { measure(); queue(); });
    addEventListener("load", () => { measure(); queue(); }); // images/fonts can change card heights
    measure();
    paint();
  };
  setupStack(document.querySelector("body.home .home-process-grid"), ".home-process-step", { from: 0.62, to: 0.22, shrink: 0.05 });
  setupStack(document.querySelector(".process-journey-list"), ".process-journey-item", { from: 0.72, to: 0.12, shrink: 0.025 });

  /* ---------- 6. Photo wheel ----------
     Homepage "Recent glove work" strip and Process photos. The strip stays a
     native horizontal scroller (swipe on phones, trackpad, keyboard), and
     each photo turns away in 3D by its distance from the center.
     Desktop mouse: the cursor's left-right position across the strip IS the
     wheel position (8% dead zone each side), eased so it glides and stops
     when the mouse stops. Photos stay the same buttons the lightbox uses. */
  const setupWheel = (strip, itemSel) => {
    if (!strip) return;
    strip.classList.add("fx-wheel");
    let items = [];
    let unit = 1;
    let pos = 0;
    let target = null;
    let raf = 0;
    let paintQueued = false;

    const paint = () => {
      paintQueued = false;
      const mid = strip.scrollLeft + strip.clientWidth / 2;
      items.forEach((el) => {
        const d = Math.max(-3, Math.min(3, (el.offsetLeft + el.offsetWidth / 2 - mid) / unit));
        const a = Math.abs(d);
        // Turn up to 35deg, push back with distance, and pull side photos in
        // toward the center (more for outer ones, which project narrower) so
        // each tucks behind its neighbor by about the same amount.
        const sign = d < 0 ? -1 : 1;
        const pull = (a <= 1 ? a * 0.3 : 0.3 + (a - 1) * 0.45) * unit;
        el.style.transform = `translateX(${(-sign * pull).toFixed(1)}px) perspective(1000px) rotateY(${(-sign * Math.min(a, 1) * 35).toFixed(2)}deg) translateZ(${(-a * 90).toFixed(1)}px)`;
        el.style.opacity = (1 - Math.max(0, a - 1.4) * 0.4).toFixed(3);
        el.style.zIndex = String(100 - Math.round(a * 10));
      });
    };
    const queuePaint = () => {
      if (paintQueued) return;
      paintQueued = true;
      requestAnimationFrame(paint);
    };
    const measure = () => {
      items = Array.from(strip.querySelectorAll(itemSel));
      if (!items.length) return;
      const w = items[0].offsetWidth;
      const gap = items[1] ? items[1].offsetLeft - items[0].offsetLeft - w : 12;
      unit = Math.max(1, w + gap);
      // Pad so the first and last photos can sit dead center.
      strip.style.paddingInline = `${Math.max(0, Math.round((strip.clientWidth - w) / 2))}px`;
      paint();
    };

    const glide = () => {
      raf = 0;
      if (target === null) return;
      const diff = target - pos;
      if (Math.abs(diff) < 0.5) {
        pos = target;
        strip.scrollLeft = pos;
        return;
      }
      pos += diff * 0.14;
      strip.scrollLeft = pos;
      raf = requestAnimationFrame(glide);
    };

    if (finePointer) {
      strip.addEventListener("pointermove", (e) => {
        if (e.pointerType !== "mouse") return;
        const r = strip.getBoundingClientRect();
        const t = Math.max(0, Math.min(1, ((e.clientX - r.left) / r.width - 0.08) / 0.84));
        const max = strip.scrollWidth - strip.clientWidth;
        // Soft detents: lean 70% toward the nearest photo's centered position
        // (photo i is centered at i * unit), so a photo settles dead center.
        const raw = t * max;
        const snapped = Math.round(raw / unit) * unit;
        target = Math.max(0, Math.min(max, snapped + (raw - snapped) * 0.3));
        if (!raf) {
          pos = strip.scrollLeft;
          raf = requestAnimationFrame(glide);
        }
      });
      // A trackpad swipe takes over until the cursor moves again.
      strip.addEventListener("wheel", () => { target = null; }, { passive: true });
      strip.addEventListener("pointerleave", () => { target = null; });
    }

    // Arrow keys step one photo.
    strip.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      target = null;
      strip.scrollBy({ left: e.key === "ArrowRight" ? unit : -unit, behavior: "smooth" });
    });

    strip.addEventListener("scroll", queuePaint, { passive: true });
    addEventListener("resize", measure);
    addEventListener("load", measure);
    new MutationObserver(measure).observe(strip, { childList: true }); // homepage photos arrive from the API
    measure();
  };
  setupWheel(document.getElementById("homeGalleryPreview"), ".gallery-thumb");
  setupWheel(document.querySelector(".process-gallery"), ".process-shot");

  /* ---------- 7. Section sheets (homepage experiment) ----------
     Each homepage section rides on a full-width "sheet". A sheet scrolls
     normally until its bottom reaches the bottom of the screen (or, if it's
     short, until it reaches the header), then pins there while the next
     sheet slides up over it; the covered sheet shrinks and dims slightly.
     Pinning only after a sheet has been fully seen means sections of any
     height work and nothing is hidden. Grouping is done here (no markup
     change): hero | trust cues + latest article + newsletter | each
     .home-section | final CTA. The lightbox stays outside the sheets (a
     transformed ancestor would break its position: fixed). */
  const main = document.querySelector("body.home main.home-sections");
  const heroEl = document.querySelector("body.home .hero");
  if (main && heroEl) {
    main.prepend(heroEl); // keep every sheet in one containing block
    const starts = [heroEl, main.querySelector(".home-trust-cues"), ...main.querySelectorAll(":scope > .home-section, :scope > .mm-final-cta")].filter(Boolean);
    const sheets = starts.map((start, i) => {
      const sheet = document.createElement("div");
      sheet.className = "fx-sheet";
      start.before(sheet);
      let node = start;
      while (node && node !== starts[i + 1] && !(node.classList && node.classList.contains("lightbox"))) {
        const next = node.nextElementSibling;
        sheet.appendChild(node);
        node = next;
      }
      return sheet;
    });
    main.classList.add("fx-sheets");

    let tops = [];
    const header = () => parseFloat(getComputedStyle(root).getPropertyValue("--headerH")) || 52;
    const place = () => {
      const h = header();
      tops = sheets.map((sh) => Math.min(h, innerHeight - sh.offsetHeight));
      sheets.forEach((sh, i) => {
        sh.style.top = `${Math.round(tops[i])}px`;
        sh.style.transformOrigin = `50% ${Math.round(Math.max(0, -tops[i]))}px`; // top of its visible part
      });
      queueSheets();
    };
    let sheetsQueued = false;
    const paintSheets = () => {
      sheetsQueued = false;
      sheets.forEach((sh, i) => {
        const next = sheets[i + 1];
        const t = next ? Math.min(1, Math.max(0, (innerHeight - next.getBoundingClientRect().top) / innerHeight)) : 0;
        sh.style.transform = t ? `scale(${(1 - t * 0.05).toFixed(4)})` : "";
        sh.style.setProperty("--fx-cover", t.toFixed(3));
      });
    };
    function queueSheets() {
      if (sheetsQueued) return;
      sheetsQueued = true;
      requestAnimationFrame(paintSheets);
    }
    addEventListener("scroll", queueSheets, { passive: true });
    addEventListener("resize", place);
    // Gallery photos and reviews load later and change sheet heights.
    if ("ResizeObserver" in window) {
      const ro = new ResizeObserver(place);
      sheets.forEach((sh) => ro.observe(sh));
    }
    place();
  }

  /* ---------- 8. Magnetic CTAs (mouse only) ---------- */
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
