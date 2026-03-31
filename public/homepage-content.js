function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setText(selector, value) {
  if (value === null || value === undefined) return;
  const node = document.querySelector(selector);
  if (node) {
    node.textContent = String(value);
  }
}

function applyHomepageSection(section) {
  const key = String(section?.section_key || "").trim().toLowerCase();
  const title = section?.title || "";
  const body = section?.body || "";

  if (!key) return;

  const map = {
    about: {
      title: "#about .section-title",
      body: "#about .about-lead"
    },
    signature_experience: {
      title: ".wide-banner-copy h2",
      body: ".wide-banner-copy p"
    },
    flavour_collection: {
      title: "#flavours .section-title",
      body: "#flavours .section-intro"
    },
    featured_products: {
      title: "#products .section-title",
      body: "#products .section-intro"
    },
    bundles: {
      title: "#bundles .section-title",
      body: "#bundles .bundles-story-copy > p"
    },
    testimonials: {
      title: "#testimonials .section-title",
      body: "#testimonials .testimonials-intro"
    },
    faq: {
      title: "#faq .section-title",
      body: "#faq .faq-intro"
    }
  };

  const target = map[key];
  if (!target) return;

  setText(target.title, title);
  setText(target.body, body);
}

async function loadHomepageContent() {
  try {
    const response = await fetch("/api/homepage");
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Failed to load homepage content");
    }

    const slides = Array.isArray(payload.slides) ? payload.slides : [];
    const sections = Array.isArray(payload.sections) ? payload.sections : [];

    const hero = document.querySelector(".hero");
    if (hero && slides.length > 0) {
      const prevBtn = hero.querySelector("#prevBtn");
      const dotsContainer = hero.querySelector(".dots");
      const heroBottomBar = hero.querySelector(".hero-bottom-bar");

      hero.querySelectorAll(".slide").forEach((slide) => slide.remove());
      if (dotsContainer) dotsContainer.innerHTML = "";

      slides.forEach((slide, index) => {
        const slideEl = document.createElement("div");
        slideEl.className = `slide${index === 0 ? " active" : ""}`;
        const hasVideo = Boolean(slide.video_url);
        const mediaMarkup = hasVideo
          ? `
            <div class="hero-media">
              <video autoplay muted loop playsinline preload="metadata" poster="${escapeHtml(slide.image_url || "")}" src="${escapeHtml(slide.video_url)}"></video>
            </div>
          `
          : `
            <div class="hero-media">
              <img src="${escapeHtml(slide.image_url)}" alt="${escapeHtml(slide.title || "Homepage slide")}">
            </div>
          `;
        slideEl.innerHTML = `
          ${mediaMarkup}
          <div class="hero-overlay"></div>
          <div class="hero-copy">
            <p class="hero-eyebrow">ThemeGood</p>
            <${index === 0 ? "h1" : "h2"}>${escapeHtml(slide.title || "Premium wellness nutrition for modern lifestyles.")}</${index === 0 ? "h1" : "h2"}>
            <p class="hero-support">${escapeHtml(slide.description || slide.subtitle || "Discover a cleaner, more elevated way to explore ThemeGood products online.")}</p>
            <div class="slide-cta">
              <a href="${escapeHtml(slide.button_primary_link || "#products")}" class="btn btn-primary">${escapeHtml(slide.button_primary_text || "Buy Now")}</a>
              <a href="${escapeHtml(slide.button_secondary_link || "#about")}" class="btn btn-secondary">${escapeHtml(slide.button_secondary_text || "Learn More")}</a>
            </div>
          </div>
        `;

        if (prevBtn) {
          hero.insertBefore(slideEl, prevBtn);
        } else if (dotsContainer) {
          hero.insertBefore(slideEl, dotsContainer);
        } else if (heroBottomBar) {
          hero.insertBefore(slideEl, heroBottomBar);
        } else {
          hero.appendChild(slideEl);
        }

        if (dotsContainer) {
          const dot = document.createElement("span");
          dot.className = `dot${index === 0 ? " active" : ""}`;
          dotsContainer.appendChild(dot);
        }
      });

      if (typeof window.initHomepageSlider === "function") {
        window.initHomepageSlider();
      }
    }

    sections.forEach(applyHomepageSection);

  } catch (error) {
    console.error("Failed to load homepage content:", error);
  }
}

document.addEventListener("DOMContentLoaded", loadHomepageContent);
