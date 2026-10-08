// One header for every customer page, based on the homepage navigation.
(() => {
  const mount = document.querySelector('[data-site-header]');
  if (!mount) return;
  const template = document.createElement('template');
  template.innerHTML = `
<section class="site-announcement-bar" role="alert" aria-live="polite">
<div class="site-announcement-bar__content">
<strong class="site-notice-full">Shipping fee is not included in website prices.</strong>
<strong class="site-notice-compact">Prices exclude shipping.</strong>
<span>After placing your order, contact us on WhatsApp to confirm your shipping fee by location and pay the shipping amount separately.</span>
</div>
<a class="site-announcement-bar__action" href="https://wa.me/60187786000" target="_blank" rel="noopener noreferrer">WhatsApp 018-7786000</a>
</section>
<header class="site-header" data-account-controls="disabled">
<a href="index.html" class="logo-container" aria-label="ThemeGood home">
<img src="photos/Theme Good Logo-03.png" class="logo" alt="ThemeGood logo">
</a>

<button id="hamburgerBtn" type="button" aria-controls="navMenu" aria-expanded="false" aria-label="Open navigation">
<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path class="menu-icon-lines" d="M4 6h16M4 12h16M4 18h16"/></svg>
</button>

<nav id="navMenu" aria-label="Primary navigation">
<ul class="nav-links">
<li><a href="index.html#home" data-i18n="home">Home</a></li>
<li><a href="index.html#about" data-i18n="about">About</a></li>
<li><a href="index.html#flavours" data-i18n="flavours">Flavours</a></li>
<li><a href="index.html#testimonials" data-i18n="testimonials">Testimonials</a></li>
<li><a href="index.html#faq" data-i18n="faq">FAQ</a></li>
<li><a href="index.html#bundles" data-i18n="bundles">Bundles</a></li>
<li><a href="gallery.html" data-i18n="gallery">Gallery</a></li>
<li><a href="track-order.html" data-i18n="track_order">Track Order</a></li>
<li class="nav-item contact-nav">
<a href="index.html#contact" class="contact-link" data-i18n="contact_us">Contact</a>
<div class="contact-hover-card" aria-hidden="true">
<div class="contact-card-inner">
<div class="contact-card-image">
<img src="/photos/contact-support-agent.jpg" alt="Contact support">
</div>
<div class="contact-card-content">
<span class="contact-card-label">We're here to help</span>
<h4 data-i18n="contact_us">Contact Us</h4>
<p>Chat with our team for product enquiries, orders, and support.</p>
<div class="contact-card-actions">
<a href="https://api.whatsapp.com/send/?phone=60187786000" class="contact-action" target="_blank" rel="noopener noreferrer">
<span class="contact-action-icon"><i class="fab fa-whatsapp" aria-hidden="true"></i></span>
<span>WhatsApp Us</span>
</a>
<a href="mailto:themegood6000@email.com" class="contact-action secondary">
<span class="contact-action-icon"><i class="fa-regular fa-envelope" aria-hidden="true"></i></span>
<span>Email Us</span>
</a>
</div>
</div>
</div>
</div>
</li>
</ul>
</nav>

<div class="header-store-links" aria-label="Marketplace links">
<a class="store-badge store-badge-lazada" href="https://www.lazada.com.my/theme-good-121123223/" target="_blank" rel="noopener noreferrer" aria-label="ThemeGood on Lazada" title="Lazada"><img src="photos/Lazada_29_icon.webp" alt="Lazada"></a>
<a class="store-badge store-badge-shopee" href="https://shopee.com.my/themegood" target="_blank" rel="noopener noreferrer" aria-label="ThemeGood on Shopee" title="Shopee"><img src="photos/shopee.png" alt="Shopee"></a>
</div>

<div class="header-social-links" aria-label="Social media links">
<a href="https://www.facebook.com/www.themegood.com.my" target="_blank" rel="noopener noreferrer" aria-label="ThemeGood on Facebook"><i class="fab fa-facebook-f"></i></a>
<a href="https://www.instagram.com/themegood_malaysia" target="_blank" rel="noopener noreferrer" aria-label="ThemeGood on Instagram"><i class="fab fa-instagram"></i></a>
<a href="https://api.whatsapp.com/send/?phone=60187786000" target="_blank" rel="noopener noreferrer" aria-label="ThemeGood on WhatsApp"><i class="fab fa-whatsapp"></i></a>
</div>

<div class="header-actions">
<a href="shopping.html" class="btn header-shop-cta" data-i18n="shop_now">Shop Now</a>
<button id="cart-toggle" type="button" aria-label="Open shopping cart"><svg class="header-action-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3h2l2.4 12h11.2l2-8H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></svg><span class="header-action-label">Cart</span> <span id="cart-count">0</span></button>
<label class="lang-switch" aria-label="Language">
<span data-i18n="language">Language</span>
<select class="js-lang-switch">
<option value="en">EN</option>
<option value="ms">BM</option>
<option value="zh">&#20013;&#25991;</option>
</select>
</label>
</div>

<div id="menuOverlay"></div>

</header>
`;
  mount.replaceWith(template.content);

  const header = document.querySelector('header.site-header');
  const nav = header.querySelector('#navMenu');
  const toggle = header.querySelector('#hamburgerBtn');
  const overlay = header.querySelector('#menuOverlay');
  const actions = header.querySelector('.header-actions');
  const language = header.querySelector('.lang-switch');
  const mobile = window.matchMedia('(max-width: 1100px)');
  const root = document.documentElement;
  const notice = document.querySelector('.site-announcement-bar');
  let previousFocus = null;

  function closeMenu(restoreFocus = false) {
    nav.classList.remove('open');
    overlay.classList.remove('active');
    document.body.classList.remove('no-scroll');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open navigation');
    toggle.querySelector('.menu-icon-lines').setAttribute('d', 'M4 6h16M4 12h16M4 18h16');
    if (restoreFocus) (previousFocus || toggle).focus();
  }

  function measureHeader() {
    const noticeHeight = notice.getBoundingClientRect().height;
    const headerHeight = header.getBoundingClientRect().height;
    root.style.setProperty('--site-notice-height', `${noticeHeight}px`);
    root.style.setProperty('--site-header-height', `${headerHeight}px`);
    root.style.setProperty('--site-content-offset', `${noticeHeight + headerHeight + (window.matchMedia('(max-width: 760px)').matches ? 16 : 28)}px`);
  }

  function syncLayout() {
    closeMenu();
    language.classList.toggle('mobile-nav-utility', mobile.matches);
    (mobile.matches ? nav : actions).appendChild(language);
    measureHeader();
  }
  toggle.addEventListener('click', () => {
    if (nav.classList.contains('open')) return closeMenu(true);
    previousFocus = document.activeElement;
    nav.classList.add('open');
    overlay.classList.add('active');
    document.body.classList.add('no-scroll');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Close navigation');
    toggle.querySelector('.menu-icon-lines').setAttribute('d', 'M6 6l12 12M6 18L18 6');
    nav.querySelector('a')?.focus();
  });
  overlay.addEventListener('click', () => closeMenu(true));
  nav.addEventListener('click', (event) => {
    if (event.target.closest('a')) closeMenu();
  });
  header.querySelector('#cart-toggle').addEventListener('click', () => closeMenu());
  document.addEventListener('keydown', (event) => {
    if (!nav.classList.contains('open')) return;
    if (event.key === 'Escape') return closeMenu(true);
    if (event.key !== 'Tab') return;
    const focusable = [toggle, ...nav.querySelectorAll('a, button, select')]
      .filter((element) => element.getClientRects().length);
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  });
  mobile.addEventListener('change', syncLayout);
  new ResizeObserver(measureHeader).observe(header);
  new ResizeObserver(measureHeader).observe(notice);
  syncLayout();

  document.addEventListener('DOMContentLoaded', () => {
    const filterPanel = document.querySelector('.shopping-filter-panel');
    if (!filterPanel) return;
    const compactFilters = window.matchMedia('(max-width: 760px)');
    const syncFilters = () => { filterPanel.open = !compactFilters.matches; };
    compactFilters.addEventListener('change', syncFilters);
    syncFilters();
  });

  // Utility pages keep their existing forms and use checkout as their cart destination.
  if (document.body.matches('.account-page, .customer-login-page, .track-order-page, .order-success-page')) {
    const button = header.querySelector('#cart-toggle');
    const link = document.createElement('a');
    link.id = button.id;
    link.innerHTML = button.innerHTML;
    link.href = 'checkout.html';
    link.setAttribute('aria-label', 'View cart and checkout');
    button.replaceWith(link);
    const cart = JSON.parse(localStorage.getItem('cart') || '[]');
    const count = cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    header.querySelector('#cart-count').textContent = count;
    header.querySelector('#cart-count').classList.toggle('is-empty', count <= 0);
    const select = language.querySelector('select');
    select.value = localStorage.getItem('site_lang') || 'en';
    select.addEventListener('change', () => localStorage.setItem('site_lang', select.value));
  }
})();
