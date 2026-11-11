// Starts each Carousel block's Bootstrap Carousel at once, so arrow keys and
// swipe work before the first click, keeps its caption below the photo in
// step with the slide, and loads the target photo and its neighbours just
// before they come into view.
//
// With autoplay the block owns the cycle instead of Bootstrap's `ride`, so a
// visitor's Pause stays paused: it holds while the pointer is inside, stops
// for good when the visitor navigates or focuses it, never starts for
// visitors who ask for reduced motion, and its optional Play and Pause
// Buttons always show the current state.
const bound = new WeakSet();

/** Indexes of the slide at `to` and its neighbours, wrapping around. */
export function nearbySlides(to, total) {
  if (!(total > 0)) return [];
  return [...new Set([to, (to + 1) % total, (to - 1 + total) % total])];
}

/** The autoplay interval in milliseconds, or 0 when autoplay is off. */
export function autoplayInterval(value) {
  const interval = Number(value);
  return Number.isInteger(interval) && interval >= 1000 ? interval : 0;
}

function prefersReducedMotion(view) {
  return Boolean(view?.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

export function initCarousels(Carousel, root = document) {
  for (const element of root.querySelectorAll("[data-moo-carousel]")) {
    if (bound.has(element)) continue;
    bound.add(element);
    const interval = autoplayInterval(element.dataset.mooCarouselAutoplay);
    const carousel = Carousel.getOrCreateInstance(element, {
      interval: interval || false,
      ride: false,
      pause: false,
    });
    const slides = Array.from(element.querySelectorAll(".carousel-item"));
    const captions = Array.from(element.querySelectorAll("[data-carousel-caption]"));
    element.addEventListener("slide.bs.carousel", (event) => {
      for (const index of nearbySlides(event.to, slides.length)) {
        const image = slides[index]?.querySelector("img[loading='lazy']");
        if (image) image.loading = "eager";
      }
      captions.forEach((caption, index) => caption.classList.toggle("d-none", index !== event.to));
    });
    if (!interval || slides.length < 2) continue;

    const play = element.querySelector("[data-carousel-play]");
    const pause = element.querySelector("[data-carousel-pause]");
    const live = element.querySelector("[data-carousel-live]");
    let playing = !prefersReducedMotion(element.ownerDocument?.defaultView);
    let held = false;
    const render = () => {
      play?.classList.toggle("d-none", playing);
      pause?.classList.toggle("d-none", !playing);
      // A rotating carousel must not announce every slide.
      live?.setAttribute("aria-live", playing ? "off" : "polite");
      if (playing && !held) {
        // The next slide is about to show, so load it now.
        const active = slides.findIndex((slide) => slide.classList.contains("active"));
        for (const index of nearbySlides(Math.max(active, 0), slides.length)) {
          const image = slides[index].querySelector("img[loading='lazy']");
          if (image) image.loading = "eager";
        }
        carousel.cycle();
      } else {
        carousel.pause();
      }
    };
    play?.addEventListener("click", () => {
      playing = true;
      held = false;
      render();
      pause?.focus();
    });
    pause?.addEventListener("click", () => {
      playing = false;
      render();
      play?.focus();
    });
    // The pointer only holds the cycle while it is inside.
    element.addEventListener("mouseenter", () => {
      held = true;
      if (playing) render();
    });
    element.addEventListener("mouseleave", () => {
      held = false;
      if (playing) render();
    });
    // Any navigation by the visitor stops the cycle until Play is pressed,
    // which is also how a carousel without a Pause Button can be stopped.
    const stop = () => {
      if (!playing) return;
      playing = false;
      render();
    };
    element.addEventListener("pointerdown", (event) => {
      if (!event.target.closest("[data-carousel-play], [data-carousel-pause]")) stop();
    });
    element.addEventListener("keydown", stop);
    // Keyboard focus entering the carousel stops it until Play is pressed.
    element.addEventListener("focusin", (event) => {
      if (playing && !element.contains(event.relatedTarget)) {
        playing = false;
        render();
      }
    });
    render();
  }
}
