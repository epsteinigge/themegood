const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { validateAlbum, photoList, registerGalleryAlbums } = require('../gallery-albums');

const album = () => ({ title: 'Community event', caption: 'One shared description', location: 'Ipoh', event_date: '2026-05-15', event_end_date: null, sort_order: 0, is_active: true, image_url: '/photos/cover.jpg', photos: [{ image_url: '/photos/cover.jpg', caption: '' }, { image_url: '/photos/group.jpg', caption: 'Group photo' }] });

test('album validation preserves ordered photos, cover, date, and captions', () => {
  assert.deepEqual(validateAlbum(album()).value, album());
  assert.equal(validateAlbum({ ...album(), event_date: '2026-02-30' }).error, 'Enter a valid event date.');
  assert.ok(validateAlbum({ ...album(), photos: [] }).error);
  assert.ok(validateAlbum({ ...album(), photos: Array(501).fill(album().photos[0]) }).error);
  assert.ok(validateAlbum({ ...album(), image_url: '/missing.jpg' }).error);
  assert.ok(validateAlbum({ ...album(), title: '' }).error);
  assert.ok(validateAlbum({ ...album(), is_active: 'false' }).error);
  for (const image_url of ['javascript:alert(1)', '//external.test/a.jpg', '/\\external.test/a.jpg', 'data:image/png;base64,123']) {
    assert.ok(validateAlbum({ ...album(), photos: [{ image_url }] }).error);
  }
});

test('event ranges reject invalid or reversed dates and preserve valid ranges', () => {
  assert.equal(validateAlbum({...album(), event_end_date:'2026-05-21'}).value.event_end_date,'2026-05-21');
  for(const event_end_date of ['2026-02-30','2026-05-14','invalid']) assert.ok(validateAlbum({...album(),event_end_date}).error);
  assert.ok(validateAlbum({...album(),event_date:null,event_end_date:'2026-05-21'}).error);
});

test('legacy rows remain single-photo albums without rewriting data', () => {
  assert.deepEqual(photoList({ image_url: '/old.jpg', photos: null }), [{ image_url: '/old.jpg', caption: '' }]);
});

test('album routes enforce authentication, preserve album payloads, and roll back invalid merges', async t => {
  const queries = [];
  let rows = [{ id: 1, ...album() }, { id: 2, ...album(), is_active: false }];
  const pool = {
    async query(sql, args) {
      queries.push({ sql, args });
      if(sql.includes('SELECT')) return { rows, rowCount: rows.length };
      return { rows: [{ id: 1 }], rowCount: 1 };
    },
    async connect() { return { query: this.query, release() {} }; }
  };
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  registerGalleryAlbums(app, pool, (req,res,next) => req.headers['x-admin-token'] === 'test' ? next() : res.status(401).json({ error: 'Unauthorized' }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening',resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (url,body,token='test') => fetch(base+url, { method:'POST', headers:{'Content-Type':'application/json','x-admin-token':token}, body:JSON.stringify(body) });
  assert.equal((await fetch(base+'/api/admin/gallery')).status,401);
  assert.equal((await post('/api/add-gallery-item',album(),'')).status,401);
  assert.equal((await post('/api/add-gallery-item',album())).status,200);
  const saved = queries.find(q=>q.sql.startsWith('INSERT'));
  assert.deepEqual(JSON.parse(saved.args[5]),album().photos);
  assert.equal(saved.args[6],'2026-05-15');
  assert.equal((await post('/api/update-gallery-item',{...album(),id:1,event_end_date:'2026-05-21',image_url:'/photos/group.jpg',photos:album().photos.slice().reverse()})).status,200);
  assert.equal(queries.find(q=>q.sql.startsWith('UPDATE gallery_items SET title')).args[8],'2026-05-21');
  assert.equal((await post('/api/add-gallery-item',{...album(),photos:[]})).status,400);
  await fetch(base+'/api/gallery');
  assert.ok(queries.find(q=>q.sql.includes('WHERE is_active = TRUE')));
  const result=await post('/api/admin/gallery/merge',{ids:[1,2]});
  assert.equal(result.status,400);
  assert.match((await result.json()).error,/visibility/);
  assert.equal(queries.at(-1).sql,'ROLLBACK');
  assert.ok(!queries.some(q=>q.sql.startsWith('DELETE')));
  rows=rows.map(row=>({...row,is_active:true}));
  assert.equal((await post('/api/admin/gallery/merge',{ids:[2,1]})).status,200);
  const merged=queries.find(q=>q.sql.startsWith('UPDATE gallery_items SET photos'));
  assert.equal(merged.args[1],2);
  assert.equal(JSON.parse(merged.args[0]).length,4);
  assert.equal(queries.at(-1).sql,'COMMIT');
});
