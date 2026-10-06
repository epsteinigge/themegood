const adminToken = localStorage.getItem('adminToken');
if (!adminToken) window.location.href = 'admin-login.html';
const $ = id => document.getElementById(id);
const form = $('galleryForm');
let albums = [], photos = [], cover = '', busy = false, dirty = false;
const selected = new Set();
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function status(text) { $('galleryStatus').textContent = text; }
function setBusy(value) {
  busy = value;
  document.querySelectorAll('#galleryForm input, #galleryForm textarea, #galleryForm button, #galleryItemsList button, #galleryItemsList input, #refreshGalleryBtn').forEach(el => el.disabled = value);
  $('mergeAlbumsBtn').disabled = value || selected.size < 2;
}
async function request(url, body) {
  const response = await fetch(url, { method:body?'POST':'GET', headers:{'x-admin-token':adminToken,...(body && !(body instanceof FormData) ? {'Content-Type':'application/json'} : {})}, ...(body ? {body:body instanceof FormData ? body : JSON.stringify(body)} : {}) });
  let result;
  try { result = await response.json(); } catch { throw new Error('The server could not complete the request. Please try again.'); }
  if(response.status===401 || response.status===403) throw new Error('Your admin session has expired. Sign in again in another tab, then refresh after saving your work.');
  if(!response.ok) throw new Error(result.error || 'Request failed. Please try again.');
  return result;
}
function renderPhotos() {
  $('albumPhotos').innerHTML = photos.map((p,i)=>`<div class="admin-album-photo"><img src="${escapeHtml(p.image_url)}" alt="Photo ${i+1}" loading="lazy"><input data-caption="${i}" maxlength="300" aria-label="Optional caption for photo ${i+1}" placeholder="Optional photo caption" value="${escapeHtml(p.caption)}"><div><button type="button" data-photo="${i}" data-action="cover" aria-pressed="${cover===p.image_url}">${cover===p.image_url?'Cover photo':'Set cover'}</button><button type="button" data-photo="${i}" data-action="up" aria-label="Move photo ${i+1} earlier" ${i===0?'disabled':''}>←</button><button type="button" data-photo="${i}" data-action="down" aria-label="Move photo ${i+1} later" ${i===photos.length-1?'disabled':''}>→</button><button type="button" data-photo="${i}" data-action="remove">Remove</button></div></div>`).join('') || '<p>No photos added yet.</p>';
}
function resetForm() {
  form.reset(); $('galleryId').value=''; photos=[]; cover=''; dirty=false;
  $('editorHeading').textContent='Create Event Album'; $('saveGalleryBtn').textContent='Save Event Album'; status(''); renderPhotos();
}
function canDiscard() { return !dirty || confirm('Discard unsaved album changes?'); }
async function loadAlbums() {
  try {
    albums = await request('/api/admin/gallery'); selected.clear();
    $('mergeAlbumsBtn').disabled=true;
    $('galleryItemsList').innerHTML=albums.map(a=>`<article class="admin-list-card"><div class="admin-list-card-image"><img src="${escapeHtml(a.image_url)}" alt="${escapeHtml(a.title)}" loading="lazy"></div><div class="admin-list-card-body"><label><input type="checkbox" data-select="${a.id}"> Select to combine</label><h3>${escapeHtml(a.title || 'Untitled event')}</h3><p>${a.photos.length} photos · ${a.is_active?'Active':'Hidden'}</p><p>${escapeHtml([a.event_date,a.location].filter(Boolean).join(' · '))}</p><p>Sort order: ${a.sort_order}</p><div class="admin-inline-actions"><button type="button" data-edit="${a.id}">Edit album</button><button type="button" data-delete="${a.id}">Delete</button></div></div></article>`).join('') || '<p>No event albums yet.</p>';
  } catch(error) { $('galleryItemsList').textContent=error.message; }
}
function editAlbum(id) {
  if(!canDiscard()) return;
  const a=albums.find(a=>Number(a.id)===Number(id)); if(!a)return;
  $('galleryId').value=a.id; $('galleryTitle').value=a.title || ''; $('galleryCaption').value=a.caption || '';
  $('galleryDate').value=a.event_date || ''; $('galleryLocation').value=a.location || '';
  $('gallerySortOrder').value=a.sort_order || 0; $('galleryIsActive').checked=a.is_active;
  $('galleryImageFile').value=''; $('galleryImageUrl').value='';
  photos=a.photos.map(p=>({...p})); cover=a.image_url; dirty=false;
  $('editorHeading').textContent='Edit Event Album'; $('saveGalleryBtn').textContent='Update Event Album';
  status(''); renderPhotos(); form.scrollIntoView({behavior:'smooth'});
}
function addUrl() {
  const url=$('galleryImageUrl').value.trim(); if(!url)return;
  if(!/^(\/[^/\\]|https?:\/\/)/i.test(url) || /[\s<>"\\]/.test(url) || url.length>500) throw new Error('Enter a valid local or HTTP(S) image URL.');
  if(photos.length>=500) throw new Error('An album can contain up to 500 photos.');
  photos.push({image_url:url,caption:''}); if(!cover)cover=url;
  $('galleryImageUrl').value=''; dirty=true; renderPhotos();
}
async function uploadSelected() {
  const files=Array.from($('galleryImageFile').files);
  if(photos.length+files.length>500) throw new Error('An album can contain up to 500 photos.');
  if(files.some(f=>!['image/jpeg','image/png','image/webp'].includes(f.type) || f.size>50*1024*1024)) throw new Error('Choose JPG, PNG, or WebP photos, each up to 50 MB.');
  const failed=[]; let uploadError='';
  for(let i=0;i<files.length;i++) {
    status(`Uploading photo ${i+1} of ${files.length}…`);
    const data=new FormData(); data.append('image',files[i]);
    try { const result=await request('/api/upload-gallery-image',data); photos.push({image_url:result.image_url,caption:''}); if(!cover)cover=result.image_url; dirty=true; }
    catch(error) { failed.push(files[i]); uploadError=error.message; }
  }
  // Keep only failed files selected so retry never duplicates successful uploads.
  const remaining=new DataTransfer(); failed.forEach(file=>remaining.items.add(file)); $('galleryImageFile').files=remaining.files;
  renderPhotos();
  if(failed.length) throw new Error(`${failed.length} photo(s) failed to upload: ${uploadError} Successful uploads are kept. Click Upload selected photos to retry the remaining files, or clear the file selection to save the others.`);
  if(files.length) status(`${files.length} photos uploaded. Save the album to publish your changes.`);
}
$('uploadGalleryImageBtn').addEventListener('click',async()=>{
  if(busy)return;
  if(!$('galleryImageFile').files.length) {status('Choose photos first.');return;}
  setBusy(true); try{await uploadSelected();}catch(error){status(error.message);}finally{setBusy(false);}
});
$('addPhotoUrl').addEventListener('click',()=>{try{addUrl();}catch(error){status(error.message);}});
$('albumPhotos').addEventListener('input',e=>{if(e.target.dataset.caption!==undefined){photos[Number(e.target.dataset.caption)].caption=e.target.value;dirty=true;}});
$('albumPhotos').addEventListener('click',e=>{
  if(busy)return; const button=e.target.closest('[data-photo]'); if(!button)return;
  const i=Number(button.dataset.photo), action=button.dataset.action;
  if(action==='cover')cover=photos[i].image_url;
  if(action==='remove') { photos.splice(i,1); if(!photos.some(p=>p.image_url===cover))cover=photos[0]?.image_url || ''; }
  const j=action==='up'?i-1:action==='down'?i+1:-1;
  if((action==='up'||action==='down')&&j>=0&&j<photos.length) [photos[i],photos[j]]=[photos[j],photos[i]];
  dirty=true;renderPhotos();
});
form.addEventListener('input',()=>{dirty=true;});
form.addEventListener('submit',async e=>{
  e.preventDefault(); if(busy)return; setBusy(true);
  try {
    addUrl(); await uploadSelected();
    if(!photos.length)throw new Error('Add at least one photo before saving.');
    const id=Number($('galleryId').value)||undefined;
    const payload={id,title:$('galleryTitle').value.trim(),caption:$('galleryCaption').value.trim(),event_date:$('galleryDate').value||null,location:$('galleryLocation').value.trim(),image_url:cover,photos,sort_order:Number($('gallerySortOrder').value),is_active:$('galleryIsActive').checked};
    await request(id?'/api/update-gallery-item':'/api/add-gallery-item',payload);
    resetForm(); status('Event album saved.'); await loadAlbums();
  }catch(error){status(error.message);}finally{setBusy(false);}
});
$('resetGalleryBtn').addEventListener('click',()=>{if(!busy&&canDiscard())resetForm();});
$('galleryItemsList').addEventListener('change',e=>{
  if(e.target.dataset.select){const id=Number(e.target.dataset.select);e.target.checked?selected.add(id):selected.delete(id);$('mergeAlbumsBtn').disabled=selected.size<2;}
});
$('galleryItemsList').addEventListener('click',async e=>{
  if(busy)return;
  const edit=e.target.closest('[data-edit]'); if(edit){editAlbum(edit.dataset.edit);return;}
  const del=e.target.closest('[data-delete]'); if(!del)return;
  const id=Number(del.dataset.delete);
  if(!confirm('Delete this entire event album and remove it from the gallery?'))return;
  if(Number($('galleryId').value)===id&&!canDiscard())return;
  setBusy(true);
  try{await request('/api/delete-gallery-item',{id});if(Number($('galleryId').value)===id)resetForm();await loadAlbums();}catch(error){status(error.message);}finally{setBusy(false);}
});
$('mergeAlbumsBtn').addEventListener('click',async()=>{
  if(busy||selected.size<2||!canDiscard())return;
  const ids=Array.from(selected), first=albums.find(a=>Number(a.id)===ids[0]);
  if(!confirm(`Combine ${ids.length} albums into “${first.title}”? All photos will be kept. The other selected album entries and their event descriptions will be replaced by this album. All selected albums must have the same visibility.`))return;
  setBusy(true);
  try{const result=await request('/api/admin/gallery/merge',{ids});resetForm();await loadAlbums();editAlbum(result.id);status('Albums combined. You can now edit the event details.');}catch(error){status(error.message);}finally{setBusy(false);}
});
$('refreshGalleryBtn').addEventListener('click',loadAlbums);
function logout(){if(!canDiscard())return;localStorage.removeItem('adminToken');dirty=false;location.href='admin-login.html';}
$('adminLogoutLink').addEventListener('click',logout);$('logoutBtnTop').addEventListener('click',logout);
window.addEventListener('beforeunload',e=>{if(dirty||busy){e.preventDefault();e.returnValue='';}});
resetForm();loadAlbums();
