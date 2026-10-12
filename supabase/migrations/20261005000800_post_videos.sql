alter table public.posts
  add column if not exists video_url text;

alter table public.posts
  drop constraint if exists posts_content_or_image;

alter table public.posts
  add constraint posts_content_or_media
  check (
    length(trim(content)) > 0
    or image_url is not null
    or video_url is not null
  );

update storage.buckets
set file_size_limit = 52428800,
    allowed_mime_types = array[
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'video/mp4',
      'video/webm',
      'video/quicktime'
    ]
where id = 'post-media';
