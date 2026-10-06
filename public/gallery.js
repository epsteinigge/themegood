function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

document.addEventListener('DOMContentLoaded', async () => {
  const grid = document.getElementById('galleryGrid');
  const view = document.getElementById('albumView');
  const albumDialog = document.getElementById('albumDialog');
  const albumClose = document.getElementById('albumClose');
  let albumOpener, background = [];
  const lightbox = document.getElementById('galleryLightbox');
  const image = document.getElementById('lightboxImage');
  const stage = document.getElementById('lightboxStage');
  const close = document.getElementById('lightboxClose');
  const prev = document.getElementById('lightboxPrev');
  const next = document.getElementById('lightboxNext');
  let albums = [], photos = [], index = 0, zoom = 1, opener, pointer, panX = 0, panY = 0;
  const meta = album => [album.event_date && new Date(`${album.event_date}T12:00:00`).toLocaleDateString(undefined, {day:'numeric',month:'short',year:'numeric'}), album.location].filter(Boolean).join(' · ');
  function renderPhoto() {
    const photo = photos[index];
    image.src = photo.image_url;
    image.alt = photo.caption || `Event photo ${index + 1}`;
    image.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
    document.getElementById('zoomLevel').textContent = `${Math.round(zoom * 100)}%`;
    document.getElementById('photoCounter').textContent = `${index + 1} of ${photos.length}`;
    document.getElementById('photoCaption').textContent = photo.caption || '';
    prev.hidden = next.hidden = photos.length < 2;
    stage.classList.toggle('is-zoomed', zoom > 1);
  }
  function changePhoto(step) { index = (index + step + photos.length) % photos.length; zoom = 1; panX = panY = 0; renderPhoto(); }
  function closePhoto() {
    lightbox.classList.remove('open');
    lightbox.setAttribute('aria-hidden','true');
    if (albumDialog.hidden) document.body.classList.remove('no-scroll');
    albumDialog.inert = false;
    albumDialog.removeAttribute('aria-hidden');
    opener?.focus({preventScroll:true});
  }
  function openPhoto(i, button) {
    index = i; zoom = 1; panX = panY = 0; opener = button;
    lightbox.classList.add('open');
    lightbox.setAttribute('aria-hidden','false');
    document.body.classList.add('no-scroll');
    renderPhoto(); close.focus();
    albumDialog.inert = true;
    albumDialog.setAttribute('aria-hidden','true');
  }
  function closeAlbum() {
    if (lightbox.classList.contains('open')) closePhoto();
    albumDialog.hidden = true;
    document.body.classList.remove('no-scroll');
    background.forEach(([node, wasInert]) => { node.inert = wasInert; });
    background = [];
    albumOpener?.focus({preventScroll:true});
    if (new URLSearchParams(location.hash.slice(1)).has('event')) history.replaceState(null, '', location.pathname + location.search);
  }
  function openAlbum(album, button) {
    albumOpener = button || grid.querySelector('.event-card');
    photos = album.photos;
    view.innerHTML = `<div class="album-heading"><h2 id="albumTitle">${escapeHtml(album.title || 'Event album')}</h2><p class="album-meta">${escapeHtml(meta(album))}${meta(album) ? ' ? ' : ''}${photos.length} photos</p><p>${escapeHtml(album.caption)}</p></div><div class="album-photo-grid">${photos.map((p,i) => `<button class="album-photo" data-index="${i}" aria-label="Open photo ${i+1}${p.caption ? ': '+escapeHtml(p.caption) : ''}"><img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.caption || album.title || 'Event photo')}" loading="lazy" decoding="async"></button>`).join('')}</div>`;
    if (albumDialog.hidden) {
      background = Array.from(document.body.children).filter(node => node !== albumDialog && node !== lightbox && !['SCRIPT', 'STYLE'].includes(node.tagName)).map(node => [node, node.inert]);
      background.forEach(([node]) => { node.inert = true; });
    }
    albumDialog.hidden = false;
    view.scrollTop = 0;
    document.body.classList.add('no-scroll');
    albumClose.focus({preventScroll:true});
  }
  function renderGallery() {
    grid.innerHTML = albums.length ? albums.map(a => `<a class="event-card" href="#event=${a.id}" data-album="${a.id}" aria-haspopup="dialog"><div class="event-card-cover"><img src="${escapeHtml(a.image_url)}" alt="${escapeHtml(a.title || 'Event cover')}" loading="lazy" decoding="async"><span class="event-count">${a.photos.length} ${a.photos.length === 1 ? 'photo' : 'photos'}</span></div><div class="event-card-body"><h2>${escapeHtml(a.title || 'Event album')}</h2>${meta(a) ? `<p>${escapeHtml(meta(a))}</p>` : ''}<span class="event-link">View album &rarr;</span></div></a>`).join('') : '<p class="empty-state">No events to display yet.</p>';
  }
  function openLinkedAlbum() {
    const id = new URLSearchParams(location.hash.slice(1)).get('event');
    const album = albums.find(a => String(a.id) === id);
    if (album) openAlbum(album);
    else if (!albumDialog.hidden) closeAlbum();
  }
  grid.addEventListener('click', e => {
    const card = e.target.closest('[data-album]');
    if (!card || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    const album = albums.find(a => String(a.id) === card.dataset.album);
    if (album) { e.preventDefault(); openAlbum(album, card); }
  });
  view.addEventListener('click', e => { const button = e.target.closest('[data-index]'); if(button) openPhoto(Number(button.dataset.index),button); });
  albumClose.addEventListener('click', closeAlbum);
  albumDialog.addEventListener('click', e => { if (e.target === albumDialog) closeAlbum(); });
  window.addEventListener('hashchange', openLinkedAlbum);
  close.addEventListener('click',closePhoto);
  prev.addEventListener('click',() => changePhoto(-1));
  next.addEventListener('click',() => changePhoto(1));
  for (const [id,delta] of [['zoomIn',.2],['zoomOut',-.2]]) document.getElementById(id).addEventListener('click',() => { zoom = Math.max(1,Math.min(3,zoom+delta)); if(zoom===1) panX=panY=0; renderPhoto(); });
  lightbox.addEventListener('click', e => { if(e.target === lightbox) closePhoto(); });
  stage.addEventListener('pointerdown', e => { pointer = {id:e.pointerId,x:e.clientX,y:e.clientY,panX,panY}; stage.setPointerCapture(e.pointerId); });
  stage.addEventListener('pointermove', e => {
    if(!pointer || e.pointerId !== pointer.id || zoom <= 1) return;
    const maxX = stage.clientWidth * (zoom-1)/2, maxY = stage.clientHeight * (zoom-1)/2;
    panX = Math.max(-maxX,Math.min(maxX,pointer.panX+e.clientX-pointer.x));
    panY = Math.max(-maxY,Math.min(maxY,pointer.panY+e.clientY-pointer.y));
    image.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  });
  stage.addEventListener('pointerup',e => { if(pointer && zoom === 1) { const dx=e.clientX-pointer.x, dy=e.clientY-pointer.y; if(Math.abs(dx)>50 && Math.abs(dx)>Math.abs(dy)) changePhoto(dx<0?1:-1); } pointer=null; });
  stage.addEventListener('pointercancel',()=>{pointer=null;});
  image.addEventListener('dragstart',e=>e.preventDefault());
  document.addEventListener('keydown',e => {
    const photoOpen = lightbox.classList.contains('open');
    if(!photoOpen && albumDialog.hidden) return;
    if(e.key==='Escape') { e.preventDefault(); photoOpen ? closePhoto() : closeAlbum(); return; }
    if(photoOpen && e.key==='ArrowRight') changePhoto(1);
    if(photoOpen && e.key==='ArrowLeft') changePhoto(-1);
    if(e.key==='Tab') {
      const buttons=Array.from((photoOpen ? lightbox : albumDialog).querySelectorAll('button')).filter(b=>!b.hidden);
      const first=buttons[0], last=buttons[buttons.length-1];
      if(e.shiftKey && document.activeElement===first) { e.preventDefault(); last.focus(); }
      else if(!e.shiftKey && document.activeElement===last) { e.preventDefault(); first.focus(); }
    }
  });
  async function load() {
    grid.innerHTML='<p class="empty-state">Loading events…</p>';
    try {
      const response=await fetch('/api/gallery'); const data=await response.json();
      if(!response.ok || !Array.isArray(data)) throw new Error('Unable to load albums');
      albums=data;
      renderGallery();
      openLinkedAlbum();
    } catch(error) { grid.hidden=false; grid.innerHTML='<p class="empty-state">Unable to load events. <button id="retryGallery">Try again</button></p>'; document.getElementById('retryGallery').addEventListener('click',load); }
  }
  await load();
});
