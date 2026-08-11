update storage.buckets
set allowed_mime_types = array['text/csv', 'image/png']
where id = 'ccer-private-exports';
