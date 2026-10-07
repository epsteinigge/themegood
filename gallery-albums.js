const fs = require('node:fs');
const path = require('node:path');

function photoList(row) {
  return Array.isArray(row.photos) && row.photos.length ? row.photos : [{ image_url: row.image_url, caption: '' }];
}

function validateAlbum(body) {
  const fail = (error) => ({ error });
  if (!body || typeof body !== 'object') return fail('Event details are required.');
  const title = String(body.title || '').trim();
  const caption = String(body.caption || '').trim();
  const location = String(body.location || '').trim();
  const event_date = body.event_date || null;
  const event_end_date = body.event_end_date || null;
  const sort_order = Number(body.sort_order ?? 0);
  if (!title || title.length > 150) return fail('Enter an event name of up to 150 characters.');
  if (caption.length > 1000 || location.length > 200) return fail('Description must be at most 1000 characters and location at most 200.');
  if (event_date && (!/^\d{4}-\d{2}-\d{2}$/.test(event_date) || !Number.isFinite(Date.parse(event_date)) || new Date(event_date).toISOString().slice(0, 10) !== event_date)) return fail('Enter a valid event date.');
  if (event_end_date && (!/^\d{4}-\d{2}-\d{2}$/.test(event_end_date) || !Number.isFinite(Date.parse(event_end_date)) || new Date(event_end_date).toISOString().slice(0, 10) !== event_end_date)) return fail('Enter a valid event end date.');
  if (event_end_date && (!event_date || event_end_date < event_date)) return fail('Event end date must be on or after the start date.');
  if (!Number.isInteger(sort_order) || sort_order < 0 || sort_order > 100000) return fail('Sort order must be a whole number from 0 to 100000.');
  if (typeof body.is_active !== 'boolean') return fail('Active status must be true or false.');
  if (!Array.isArray(body.photos) || !body.photos.length || body.photos.length > 500) return fail('Add between 1 and 500 photos per album.');
  const photos = [];
  for (const photo of body.photos) {
    const url = String(photo?.image_url || '').trim();
    const text = String(photo?.caption || '').trim();
    if (!url || url.length > 500 || !/^(\/[^/\\]|https?:\/\/)/i.test(url) || /[\s<>"\\]/.test(url) || text.length > 300) return fail('Photos need a valid local or HTTP(S) URL and captions of up to 300 characters.');
    photos.push({ image_url: url, caption: text });
  }
  const image_url = body.image_url || photos[0].image_url;
  if (!photos.some(photo => photo.image_url === image_url)) return fail('Choose a cover from the album photos.');
  return { value: { title, caption, location, event_date, event_end_date, sort_order, is_active: body.is_active, photos, image_url } };
}

function registerGalleryAlbums(app, pool, requireAdmin) {
  let schema;
  function ready() {
    if (!schema) schema = pool.query(fs.readFileSync(path.join(__dirname, 'migrations/2026-10-07-gallery-albums.sql'), 'utf8')).catch(error => { schema = null; throw error; });
    return schema;
  }
  const serialize = row => ({ ...row, photos: photoList(row) });
  async function list(req, res, admin) {
    try {
      await ready();
      const result = await pool.query(`SELECT *, to_char(event_date, 'YYYY-MM-DD') AS event_date, to_char(event_end_date, 'YYYY-MM-DD') AS event_end_date FROM gallery_items ${admin ? '' : 'WHERE is_active = TRUE'} ORDER BY sort_order ASC, gallery_items.event_date DESC NULLS LAST, created_at DESC, id DESC`);
      res.json(result.rows.map(serialize));
    } catch (error) {
      console.error('Load albums failed:', error);
      res.status(500).json({ error: 'Unable to load event albums. Please try again.' });
    }
  }
  app.get('/api/gallery', (req, res) => list(req, res, false));
  app.get('/api/admin/gallery', requireAdmin, (req, res) => list(req, res, true));
  async function save(req, res, editing) {
    const validation = validateAlbum(req.body);
    if (validation.error) return res.status(400).json(validation);
    const id = Number(req.body.id);
    if (editing && (!Number.isSafeInteger(id) || id < 1)) return res.status(400).json({ error: 'Invalid album ID.' });
    const a = validation.value;
    const values = [a.title, a.caption, a.image_url, a.sort_order, a.is_active, JSON.stringify(a.photos), a.event_date, a.location, a.event_end_date];
    try {
      await ready();
      const result = editing
        ? await pool.query(`UPDATE gallery_items SET title=$1, caption=$2, image_url=$3, sort_order=$4, is_active=$5, photos=$6::jsonb, event_date=$7, location=$8, event_end_date=$9 WHERE id=$10 RETURNING id`, [...values, id])
        : await pool.query(`INSERT INTO gallery_items (title,caption,image_url,sort_order,is_active,photos,event_date,location,event_end_date) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9) RETURNING id`, values);
      if (!result.rowCount) return res.status(404).json({ error: 'This album no longer exists. Refresh the list.' });
      res.json({ id: result.rows[0].id, message: 'Event album saved.' });
    } catch (error) {
      console.error('Save album failed:', error);
      res.status(500).json({ error: 'Unable to save this album. Your edits are still in the form.' });
    }
  }
  app.post('/api/add-gallery-item', requireAdmin, (req, res) => save(req, res, false));
  app.post('/api/update-gallery-item', requireAdmin, (req, res) => save(req, res, true));
  app.post('/api/delete-gallery-item', requireAdmin, async (req, res) => {
    const id = Number(req.body.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid album ID.' });
    try {
      const result = await pool.query('DELETE FROM gallery_items WHERE id=$1', [id]);
      if (!result.rowCount) return res.status(404).json({ error: 'Album not found.' });
      res.json({ message: 'Album deleted.' });
    } catch (error) { res.status(500).json({ error: 'Unable to delete album.' }); }
  });
  app.post('/api/admin/gallery/merge', requireAdmin, async (req, res) => {
    const ids = req.body.ids;
    if (!Array.isArray(ids) || ids.length < 2 || ids.length > 100 || new Set(ids).size !== ids.length || ids.some(id => !Number.isSafeInteger(id) || id < 1)) return res.status(400).json({ error: 'Select between 2 and 100 albums to combine.' });
    let client;
    try {
      await ready();
      client = await pool.connect();
      await client.query('BEGIN');
      const result = await client.query('SELECT * FROM gallery_items WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE', [ids]);
      if (result.rows.length !== ids.length) throw new Error('An album no longer exists. Refresh and try again.');
      const target = result.rows.find(row => Number(row.id) === ids[0]);
      if (result.rows.some(row => row.is_active !== target.is_active)) throw new Error('Albums must have the same visibility before combining them.');
      const photos = ids.flatMap(id => photoList(result.rows.find(row => Number(row.id) === id)));
      if (photos.length > 500) throw new Error('The combined album would exceed 500 photos.');
      await client.query('UPDATE gallery_items SET photos=$1::jsonb WHERE id=$2', [JSON.stringify(photos), ids[0]]);
      await client.query('DELETE FROM gallery_items WHERE id = ANY($1::int[])', [ids.slice(1)]);
      await client.query('COMMIT');
      res.json({ id: ids[0], message: 'Albums combined.' });
    } catch (error) {
      if (client) await client.query('ROLLBACK');
      console.error('Combine albums failed:', error);
      const known = ['An album no longer exists. Refresh and try again.', 'Albums must have the same visibility before combining them.', 'The combined album would exceed 500 photos.'];
      res.status(known.includes(error.message) ? 400 : 500).json({ error: known.includes(error.message) ? error.message : 'Unable to combine albums. Please try again.' });
    } finally { client?.release(); }
  });
}

module.exports = { registerGalleryAlbums, validateAlbum, photoList };
