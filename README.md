# Inzu

Inzu is a responsive community app for discovering people, following members,
and starting one-to-one conversations. Supabase provides real email/password
authentication, shared profiles and follows, direct-message storage, and
real-time message updates.

## Connect a Supabase project

1. Create a Supabase project.
2. Open the project's SQL Editor and run
   [`supabase/migrations/20261005000100_social_chat.sql`](./supabase/migrations/20261005000100_social_chat.sql).
   The migration creates member profiles, follows, direct conversations, and
   messages, with row-level security policies and a real-time publication.
3. Run [`supabase/migrations/20261005000200_profile_avatars.sql`](./supabase/migrations/20261005000200_profile_avatars.sql)
   to create the public avatars bucket with policies that only let signed-in
   members upload, replace, or remove files in their own folder.
4. Run [`supabase/migrations/20261005000300_posts_notifications.sql`](./supabase/migrations/20261005000300_posts_notifications.sql)
   to create shared moments, likes, notification triggers for follows/likes/
   messages, the post-media bucket, and realtime notification updates.
5. Run [`supabase/migrations/20261005000400_calls.sql`](./supabase/migrations/20261005000400_calls.sql)
   to authorize private, conversation-member-only WebRTC call signaling.
6. Run [`supabase/migrations/20261005000500_trending_topics.sql`](./supabase/migrations/20261005000500_trending_topics.sql)
   to enable live hashtag counts from moments shared in the last seven days.
   If Supabase reports that `get_trending_topics` is missing from the schema
   cache, rerun this migration in the SQL Editor; it notifies PostgREST to
   refresh the schema. You can also run
   `NOTIFY pgrst, 'reload schema';` there and reload the app.
7. Deploy the authenticated `rwanda-news` Edge Function, which fetches and
   returns headlines from IGIHE's RSS feed:

   ```sh
   supabase functions deploy rwanda-news
   ```

   Redeploy after changing the function. Its CORS preflight must allow the
   Supabase API/client headers sent by the browser, in addition to
   `authorization`, `apikey`, and `content-type`.

8. For AI-assisted chat replies, revoke any previously shared OpenAI key,
   create a replacement, and add it in Supabase Dashboard → Edge Functions →
   Secrets as `OPENAI_API_KEY`. Then deploy the authenticated `chat-assistant`
   function:

   ```sh
   supabase functions deploy chat-assistant
   ```

   Never put this key in `.env.local`, frontend code, or a public repository.
   The chat's sparkle button requests a suggested reply using recent messages;
   it fills the composer and never sends anything automatically.

9. Copy `.env.example` to `.env.local` in this project directory. Set
   `VITE_SUPABASE_URL` to the project's URL and `VITE_SUPABASE_ANON_KEY` to its
   public anon/publishable key. Never put a `service_role` key in the frontend.
10. In Supabase Authentication, configure the email confirmation behavior and
   allowed redirect URLs for the local and deployed sites.
11. Run `npm install` and `npm run dev`.

Without the Supabase settings the app shows a setup prompt and does not pretend
to register or sign in. Once connected, create accounts for at least two people
to try member discovery and cross-account messaging.

## Development commands

- `npm run dev` starts the Vite development server.
- `npm run build` runs TypeScript and creates a production build.
- `npm run lint` runs Oxlint.

## Current scope

Authentication, member profiles, follows, moments, likes, notifications, and
direct text messages are shared through Supabase. Profile totals come from
database counts, and notification events are generated when someone follows,
likes a moment, or messages a member. Optional AI chat suggestions run through
an authenticated Supabase Edge Function and require a server-side
`OPENAI_API_KEY` secret. Theme, dark mode, language, and wallpaper
are browser-local preferences. Voice and video calls use browser WebRTC and
private Supabase Realtime signaling; both members must be online, signed in,
and allow microphone/camera access. Calls require HTTPS outside localhost. The
default STUN server can connect many networks, but a TURN relay may be needed
for restrictive NATs/firewalls. Chat attachments currently share a filename
preview rather than uploading file contents. A production launch should add
moderation/reporting, managed TURN credentials, and calling reliability
monitoring.

The home sidebar's Rwanda trends count real hashtagged moments from the last
seven days; it does not show fabricated activity counts. Rwanda headlines are
fetched from IGIHE's RSS feed through the `rwanda-news` Edge Function and
refreshed every five minutes. Each headline links to the publisher. If either
trend source is unavailable or its migration/function has not been installed,
the sidebar reports that instead of substituting sample data.
