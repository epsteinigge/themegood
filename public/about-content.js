async function loadAboutContent() {
  try {
    const response = await fetch("/api/about-content");
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Failed to load about content");
    }

    const pillars = Array.isArray(payload.pillars) ? payload.pillars : [];
    const stats = Array.isArray(payload.stats) ? payload.stats : [];

    const pillarsContainer = document.querySelector("#about .about-pillars");
    if (pillarsContainer) {
      pillarsContainer.innerHTML = pillars.map((item) => `
        <article class="about-pillar">
          <h3>${item.title || ""}</h3>
          <p>${item.body || ""}</p>
        </article>
      `).join("");
    }

    const statsContainer = document.querySelector("#about .about-stats");
    if (statsContainer) {
      statsContainer.innerHTML = stats.map((item) => `
        <div class="about-stat">
          <strong>${item.stat_value || ""}</strong>
          <span>${item.stat_label || ""}</span>
        </div>
      `).join("");
    }

    if (typeof window.initAboutStatsCounter === "function") {
      requestAnimationFrame(() => {
        window.initAboutStatsCounter();
      });
    }
  } catch (error) {
    console.error("Failed to load about content:", error);
  }
}

document.addEventListener("DOMContentLoaded", loadAboutContent);
