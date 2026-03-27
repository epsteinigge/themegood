function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

      hero.querySelectorAll(".slide").forEach((slide) => slide.remove());
      if (dotsContainer) dotsContainer.innerHTML = "";

      slides.forEach((slide, index) => {
        const slideEl = document.createElement("div");
        slideEl.className = `slide${index === 0 ? " active" : ""}`;
        slideEl.innerHTML = `
          <img src="${escapeHtml(slide.image_url)}" alt="${escapeHtml(slide.title || "Homepage slide")}">
          <div class="slide-cta">
            <a href="${escapeHtml(slide.button_primary_link || "#products")}" class="btn btn-primary">${escapeHtml(slide.button_primary_text || "Buy Now")}</a>
            <a href="${escapeHtml(slide.button_secondary_link || "#about")}" class="btn btn-secondary">${escapeHtml(slide.button_secondary_text || "Learn More")}</a>
          </div>
        `;

        if (prevBtn) {
          hero.insertBefore(slideEl, prevBtn);
        } else if (dotsContainer) {
          hero.insertBefore(slideEl, dotsContainer);
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

    const sectionMap = Object.fromEntries(
      sections.map((section) => [section.section_key, section])
    );

    if (sectionMap.about) {
      const title = document.querySelector("#about h2");
      const body = document.querySelector("#about .about-lead");
      if (title) title.textContent = sectionMap.about.title || "";
      if (body) body.textContent = sectionMap.about.body || "";
    }

    if (sectionMap.testimonials) {
      const title = document.querySelector("#testimonials .section-title");
      const body = document.querySelector("#testimonials .testimonials-intro");
      if (title) title.textContent = sectionMap.testimonials.title || "";
      if (body) body.textContent = sectionMap.testimonials.body || "";
    }

    if (sectionMap.faq) {
      const title = document.querySelector("#faq .section-title");
      const body = document.querySelector("#faq .faq-intro");
      if (title) title.textContent = sectionMap.faq.title || "";
      if (body) body.textContent = sectionMap.faq.body || "";
    }

    if (sectionMap.newsletter) {
      const title = document.querySelector(".newsletter h2");
      const body = document.querySelector(".newsletter p");
      if (title) title.textContent = sectionMap.newsletter.title || "";
      if (body) body.textContent = sectionMap.newsletter.body || "";
    }
  } catch (error) {
    console.error("Failed to load homepage content:", error);
  }
}

document.addEventListener("DOMContentLoaded", loadHomepageContent);
