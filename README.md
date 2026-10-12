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
7. Run [`supabase/migrations/20261005000600_post_interactions.sql`](./supabase/migrations/20261005000600_post_interactions.sql)
   to enable persistent comments, reposts, and interaction counts.
8. Run [`supabase/migrations/20261005000700_manage_own_posts.sql`](./supabase/migrations/20261005000700_manage_own_posts.sql)
   to let members remove their own post images when they edit or delete a moment.
   Members can edit and delete only posts they own; the database enforces this
   with row-level security.
9. Run [`supabase/migrations/20261005000800_post_videos.sql`](./supabase/migrations/20261005000800_post_videos.sql)
   to add playable video moments and allow MP4, WebM, and MOV uploads up to
   50 MB in the post-media bucket.
10. Run [`supabase/migrations/20261006000100_marketplace.sql`](./supabase/migrations/20261006000100_marketplace.sql)
    to create the shared Marketplace listings table and owner-only delete
    permissions. Signed-in members can browse listings; sellers can publish
    and remove their own. Then run
    [`supabase/migrations/20261006000200_marketplace_cart_photos.sql`](./supabase/migrations/20261006000200_marketplace_cart_photos.sql)
    to enable product photos, seller-managed quantity, and private photo storage
    with signed-in access.
11. Run [`supabase/migrations/20261006000300_group_calls.sql`](./supabase/migrations/20261006000300_group_calls.sql)
    to enable private group-call rooms and member-authorized group signaling.
    Apply it after the one-to-one calls migration.
12. Run [`supabase/migrations/20261006000400_direct_call_signaling_auth.sql`](./supabase/migrations/20261006000400_direct_call_signaling_auth.sql)
    to authorize direct-call signaling only for the two members of the
    conversation. This also repairs existing projects where private call-topic
    authorization rejects incoming-call subscriptions.
13. If group-call setup reports that `public.can_signal_call_room(uuid, uuid)`
    does not exist, run [`supabase/migrations/20261006000500_repair_group_call_signaling.sql`](./supabase/migrations/20261006000500_repair_group_call_signaling.sql)
    in the SQL Editor. This safely recreates the group signaling helper and
    policies without rerunning the table-creation migration.
14. Run [`supabase/migrations/20261008000100_message_edits_read_receipts.sql`](./supabase/migrations/20261008000100_message_edits_read_receipts.sql)
    to enable secure message editing, read receipts, and message-update
    replication. It adds only columns and functions and is safe to rerun.
15. Run [`supabase/migrations/20261012000100_member_statuses.sql`](./supabase/migrations/20261012000100_member_statuses.sql)
    to enable 24-hour follower-only statuses, private status photos, view lists,
    reactions, and replies that are delivered as direct messages. The migration
    also updates the Realtime publication so new statuses and interactions
    refresh live. Status-photo links are signed for 15 minutes and can only be
    created by the status owner or a follower while the status is active.
16. Deploy the authenticated `rwanda-news` Edge Function. It fetches current
   headlines from IGIHE and Kigali Today in parallel: IGIHE's RSS feed is
   preferred, with its homepage as a fallback, while Kigali Today headlines
   are collected from its homepage. If one publisher is unavailable, the
   function still returns the other publisher's articles and includes a
   warning; it reports an error only when neither source can be fetched.

   ```sh
   supabase functions deploy rwanda-news
   ```

   Redeploy after changing the function. Its CORS preflight must allow the
   Supabase API/client headers sent by the browser, in addition to
   `authorization`, `apikey`, and `content-type`.

17. For AI-assisted chat replies, revoke any previously shared OpenAI key,
   create a replacement, and add it in Supabase Dashboard → Edge Functions →
   Secrets as `OPENAI_API_KEY`. Then deploy the authenticated `chat-assistant`
   function:

   ```sh
   supabase functions deploy chat-assistant
   ```

   Never put this key in `.env.local`, frontend code, or a public repository.
   The chat's sparkle button requests a suggested reply using recent messages;
   it fills the composer and never sends anything automatically.

18. Copy `.env.example` to `.env.local` in this project directory. Set
   `VITE_SUPABASE_URL` to the project's URL and `VITE_SUPABASE_ANON_KEY` to its
   public anon/publishable key. Never put a `service_role` key in the frontend.
19. In Supabase Authentication, configure the email confirmation behavior and
   allowed redirect URLs for the local and deployed sites.
20. Run `npm install` and `npm run dev`.

Without the Supabase settings the app shows a setup prompt and does not pretend
to register or sign in. Once connected, create accounts for at least two people
to try member discovery and cross-account messaging.

## Development commands

- `npm run dev` starts the Vite development server.
- `npm run build` runs TypeScript and creates a production build.
- `npm run lint` runs Oxlint.

## Current scope

Authentication, member profiles, follows, moments, likes, notifications, and
24-hour follower-only statuses, reactions, status view lists, and direct text
messages are shared through Supabase. Status replies arrive in the owner's
inbox with a quoted status preview. Profile totals come from
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

Calls show an elapsed duration once the WebRTC connection is established.
After migration 20261008000100, members can edit their own text messages, see
when their sent messages have been read, and see an online typing indicator
while the other participant is composing in an open conversation. Read status
is recorded when a member opens the conversation; typing status is ephemeral
and sent over the private direct-call signaling topic.

Group voice and video calls invite up to seven other members from Messages.
Participants join the same private call room and connect using browser WebRTC;
live emoji gifts are free reactions and do not transfer money. Group calling
requires the group-call migration above, HTTPS outside localhost, and browser
microphone/camera permission. The mesh call connects each participant directly,
so larger calls or restrictive networks should use a TURN relay and a
server-backed SFU before production.

Post comments and reposts are shared through Supabase after migration 006.
Use a post's Share action to choose one or more members; Inzu sends each
recipient a direct message with a link that opens and highlights that exact
moment in the feed.

The News & video section fetches up to 200 distinct article links per publisher
from IGIHE and Kigali Today when opened, and offers a manual refresh. IGIHE's
RSS feed is preferred, with homepage scraping as a fallback; Kigali Today is
fetched from its homepage. Headlines identify their publisher, and partial
publisher outages are shown as warnings without hiding articles from the
available source. Publisher-provided article thumbnails appear when the
headline feed includes an image; stories without a usable image show a news
icon instead. Community video moments uploaded after migration 008 are
playable in the Video tab and use the same real like, comment, repost, and
share interactions as other moments.

The Marketplace lets signed-in members publish products or services with a
category, RWF price, location, and MTN Mobile Money or Airtel Money payment
code/number. Product listings support a photo and available quantity. Members
can search and filter listings, add products from multiple sellers to a cart,
adjust quantities, and view seller-specific payment instructions at checkout.
Sellers can be contacted through direct chat and can remove their own listings.
Checkout does not initiate or verify payments: buyers must transfer money
manually to each seller and confirm availability and terms. Never share a
mobile-money PIN or OTP. Payment details are visible to signed-in members.

The Read books section browses and searches English-language public-domain
books from Project Gutenberg via Gutendex. Members can open editions in the
in-app reader and save books to a browser-local shelf. No extra Supabase
migration or API key is required.

Members can edit a moment's text or photo/video, and delete their own moments
from the post options menu. Editing profile details and uploading a profile
picture are available from Edit profile; avatars are rendered as centered
circular cropped thumbnails throughout the app.

The home sidebar's Rwanda trends count real hashtagged moments from the last
seven days; it does not show fabricated activity counts. Rwanda headlines are
fetched from IGIHE and Kigali Today through the `rwanda-news` Edge Function and
refreshed every five minutes. Each headline links to its publisher. If either
publisher, the trends source, or its migration/function is unavailable, the
app reports that instead of substituting sample data.
