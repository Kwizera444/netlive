import { createClient, type RealtimeChannel } from '@supabase/supabase-js'

export type Profile = {
  id: string
  username: string
  full_name: string
  city: string
  bio: string
  avatar_url: string | null
  created_at: string
}

export type ChatMessage = {
  id: string
  conversation_id: string
  sender_id: string
  content: string
  attachment_name: string | null
  created_at: string
  edited_at: string | null
  read_at: string | null
  status_id?: string | null
  status_reply_content?: string | null
}

export type SocialPost = {
  id: string
  user_id: string
  content: string
  image_url: string | null
  video_url?: string | null
  created_at: string
}

export type LoadedPost = SocialPost & {
  likes: number
  liked: boolean
  comments: number
  reposts: number
  reposted: boolean
}

export type PostComment = {
  id: string
  post_id: string
  user_id: string
  content: string
  created_at: string
  author: Profile
}

export type PostNotification = {
  id: string
  actor_id: string
  recipient_id: string
  event_type: 'follow' | 'like' | 'message'
  post_id: string | null
  message_id: string | null
  created_at: string
  read_at: string | null
  actor: Profile
}

export type StatusReaction = {
  status_id: string
  user_id: string
  emoji: string
  actor: Profile
}

export type MemberStatus = {
  id: string
  user_id: string
  content: string
  image_url: string | null
  image_path: string | null
  created_at: string
  expires_at: string
  author: Profile
  viewed: boolean
  viewers: Profile[]
  reactions: StatusReaction[]
}

export type ProfileCounts = {
  moments: number
  following: number
  followers: number
}

export type TrendingTopic = { tag: string; moments: number }
export type AiChatMessage = { sender: 'you' | 'them'; text: string }
export type RwandaNewsItem = { title: string; url: string; publishedAt: string; source?: string; imageUrl?: string }
export type RwandaNews = {
  source: string
  sourceUrl: string
  sources?: { name: string; url: string }[]
  items: RwandaNewsItem[]
  fetchedAt: string
  warnings?: string[]
}

export type MarketplaceListing = {
  id: string
  seller_id: string
  name: string
  description: string
  listing_type: 'product' | 'service'
  category: string
  price_rwf: number
  quantity_available: number
  location: string
  payment_method: 'MTN Mobile Money' | 'Airtel Money'
  payment_number: string
  image_path: string | null
  image_url: string | null
  created_at: string
  seller: Profile
}

export type NewMarketplaceListing = Omit<MarketplaceListing, 'id' | 'created_at' | 'seller' | 'image_url'>

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && anonKey)
export const supabase = isSupabaseConfigured ? createClient(url, anonKey) : null

function requireSupabase() {
  if (!supabase) {
    throw new Error('Add your Supabase project URL and anon key to netlive/.env.local, then restart the app.')
  }
  return supabase
}

export async function loadProfile(userId: string, email: string, fullName?: string) {
  const client = requireSupabase()
  const { data, error } = await client.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (error) throw error
  if (data) return data as Profile

  const name = fullName?.trim() || email.split('@')[0] || 'Inzu member'
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 42) || 'member'
  const { data: created, error: insertError } = await client.from('profiles')
    .insert({
      id: userId,
      username: `${slug}.${userId.replaceAll('-', '').slice(0, 8)}`,
      full_name: name,
    })
    .select('*')
    .single()
  if (insertError) throw insertError
  return created as Profile
}

export function explainSupabaseError(error: unknown) {
  if (
    typeof error === 'object'
    && error !== null
    && 'message' in error
    && typeof error.message === 'string'
    && /edit_direct_message|mark_conversation_read|read_at|edited_at/i.test(error.message)
    && (!('code' in error) || ['PGRST202', 'PGRST204', '42703'].includes(String(error.code)))
  ) {
    return 'Message editing and read receipts are not installed yet. Run supabase/migrations/20261008000100_message_edits_read_receipts.sql in Supabase → SQL Editor, then reload the app.'
  }
  if (
    typeof error === 'object'
    && error !== null
    && 'message' in error
    && typeof error.message === 'string'
    && /statuses|status_views|status_reactions|reply_to_status|status_id/i.test(error.message)
    && (!('code' in error) || ['PGRST202', 'PGRST204', 'PGRST205', '42703', '42P01'].includes(String(error.code)))
  ) {
    return 'Statuses are not installed yet. Run supabase/migrations/20261012000100_member_statuses.sql in Supabase → SQL Editor, then reload the app.'
  }
  if (
    typeof error === 'object'
    && error !== null
    && 'message' in error
    && typeof error.message === 'string'
    && /marketplace_listings/i.test(error.message)
    && (!('code' in error) || String(error.code) === 'PGRST205' || String(error.code) === '42P01')
  ) {
    return 'The marketplace database is not installed yet. In Supabase → SQL Editor, run supabase/migrations/20261006000100_marketplace.sql, then reload the Marketplace.'
  }
  if (
    typeof error === 'object'
    && error !== null
    && 'message' in error
    && typeof error.message === 'string'
    && /video_url/i.test(error.message)
    && (!('code' in error) || String(error.code) === 'PGRST204' || String(error.code) === '42703')
  ) {
    return 'Video moments are not installed yet. In Supabase → SQL Editor, run supabase/migrations/20261005000800_post_videos.sql, then reload the app.'
  }
  if (
    typeof error === 'object'
    && error !== null
    && 'message' in error
    && typeof error.message === 'string'
    && /get_trending_topics/i.test(error.message)
    && (!('code' in error) || String(error.code) === 'PGRST202')
  ) {
    return 'The live trends database function is not available yet. In Supabase → SQL Editor, run supabase/migrations/20261005000500_trending_topics.sql, then reload this page. If you already ran it, run NOTIFY pgrst, \'reload schema\'; in the SQL Editor and reload this page.'
  }
  if (
    typeof error === 'object'
    && error !== null
    && 'message' in error
    && typeof error.message === 'string'
    && /get_post_interaction_counts/i.test(error.message)
  ) {
    return 'Post comments and reposts are not installed yet. In Supabase → SQL Editor, run supabase/migrations/20261005000600_post_interactions.sql, then reload this page.'
  }
  if (
    typeof error === 'object'
    && error !== null
    && 'message' in error
    && typeof error.message === 'string'
    && /bucket not found|no such bucket/i.test(error.message)
  ) {
    if (/status-media/i.test(error.message)) {
      return 'The private status-media bucket is missing. Run supabase/migrations/20261012000100_member_statuses.sql in Supabase → SQL Editor, then try again.'
    }
    return /post-media/i.test(error.message)
      ? 'The post-media storage bucket is missing. Run supabase/migrations/20261005000300_posts_notifications.sql in Supabase → SQL Editor, then try again.'
      : 'A Supabase storage bucket is missing. Run the storage setup migration in Supabase → SQL Editor, then try again.'
  }
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = String(error.code)
    if (code === 'PGRST205' || code === '42P01') {
      if ('message' in error && typeof error.message === 'string' && /post_comments|post_reposts/i.test(error.message)) {
        return 'Post comments and reposts are not installed yet. In Supabase → SQL Editor, run supabase/migrations/20261005000600_post_interactions.sql, then reload this page.'
      }
      if ('message' in error && typeof error.message === 'string' && /posts|post_likes|notifications/i.test(error.message)) {
        return 'Moments and notifications are not installed yet. Run supabase/migrations/20261005000300_posts_notifications.sql in Supabase → SQL Editor, then reload this page.'
      }
      return 'The Inzu database tables are not installed yet. In Supabase → SQL Editor, run supabase/migrations/20261005000100_social_chat.sql, then reload this page.'
    }
    if (code === '42501') {
      return 'Supabase denied access to the Inzu tables. Run the latest database migration to install the required permissions, then reload.'
    }
    if (code === '23503') {
      return 'This browser had a saved sign-in for a user that no longer exists in this Supabase project, so it has been signed out. Sign in with an account from this project or create a new one.'
    }
  }
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    return error.message
  }
  return 'Unable to load your account. Please try again.'
}

export function explainAvatarUploadError(error: unknown) {
  if (
    typeof error === 'object'
    && error !== null
    && 'message' in error
    && typeof error.message === 'string'
    && /bucket not found|no such bucket/i.test(error.message)
  ) {
    return 'The avatars storage bucket is missing. In Supabase → SQL Editor, run supabase/migrations/20261005000200_profile_avatars.sql, then try uploading again.'
  }
  return explainSupabaseError(error)
}

export async function loadPeople(userId: string) {
  const client = requireSupabase()
  const [peopleResult, followsResult] = await Promise.all([
    client.from('profiles').select('*').neq('id', userId).order('created_at', { ascending: false }),
    client.from('follows').select('following_id').eq('follower_id', userId),
  ])
  if (peopleResult.error) throw peopleResult.error
  if (followsResult.error) throw followsResult.error
  return {
    people: (peopleResult.data ?? []) as Profile[],
    follows: (followsResult.data ?? []).map((row) => row.following_id as string),
  }
}

export async function loadProfileCounts(userId: string): Promise<ProfileCounts> {
  const client = requireSupabase()
  const [posts, following, followers] = await Promise.all([
    client.from('posts').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    client.from('follows').select('follower_id', { count: 'exact', head: true }).eq('follower_id', userId),
    client.from('follows').select('following_id', { count: 'exact', head: true }).eq('following_id', userId),
  ])
  const error = posts.error ?? following.error ?? followers.error
  if (error) throw error
  return { moments: posts.count ?? 0, following: following.count ?? 0, followers: followers.count ?? 0 }
}

export async function loadTrendingTopics(): Promise<TrendingTopic[]> {
  const { data, error } = await requireSupabase().rpc('get_trending_topics')
  if (error) throw error
  return ((data ?? []) as { tag: string; moments: number }[]).map((topic) => ({
    tag: topic.tag,
    moments: Number(topic.moments),
  }))
}

export async function loadRwandaNews(): Promise<RwandaNews> {
  const { data, error } = await requireSupabase().functions.invoke('rwanda-news', { method: 'GET' })
  if (error) {
    if (/Failed to send a request to the Edge Function/i.test(error.message)) {
      throw new Error(
        'Could not reach the Rwanda news Edge Function. Deploy or redeploy it with `supabase functions deploy rwanda-news`, then reload the app. If it is already deployed, check the Supabase project URL and browser network/CORS settings.',
      )
    }
    throw error
  }
  if (
    typeof data !== 'object'
    || data === null
    || !('items' in data)
    || !Array.isArray(data.items)
    || !('source' in data)
    || typeof data.source !== 'string'
    || !('sourceUrl' in data)
    || typeof data.sourceUrl !== 'string'
    || !('fetchedAt' in data)
    || typeof data.fetchedAt !== 'string'
  ) {
    throw new Error('The Rwanda news service returned an invalid response.')
  }
  return data as RwandaNews
}

export async function draftChatReply(contactName: string, messages: AiChatMessage[]): Promise<string> {
  const { data, error } = await requireSupabase().functions.invoke('chat-assistant', {
    body: { contactName, messages },
  })
  if (error) {
    const detail = /failed to send a request/i.test(error.message)
      ? 'Deploy the `chat-assistant` function and check the Supabase project URL/CORS settings.'
      : /non-2xx status code/i.test(error.message)
        ? 'Check that `OPENAI_API_KEY` is set in Supabase Edge Function secrets and that the OpenAI account has API access and available usage.'
        : error.message
    throw new Error(`AI reply could not be generated: ${detail}`)
  }
  if (typeof data !== 'object' || data === null || !('reply' in data) || typeof data.reply !== 'string') {
    throw new Error('The AI reply service returned an invalid response.')
  }
  return data.reply
}

export async function loadPosts(userId: string): Promise<LoadedPost[]> {
  const client = requireSupabase()
  const { data, error } = await client.from('posts').select('*').order('created_at', { ascending: false }).limit(100)
  if (error) throw error
  const posts = (data ?? []) as SocialPost[]
  if (posts.length === 0) return []
  const ids = posts.map((post) => post.id)
  const [likesResult, interactionsResult] = await Promise.all([
    client.from('post_likes').select('post_id, user_id').in('post_id', ids),
    client.rpc('get_post_interaction_counts', { post_ids: ids }),
  ])
  if (likesResult.error) throw likesResult.error
  if (interactionsResult.error) throw interactionsResult.error
  const likes = likesResult.data ?? []
  const interactions = interactionsResult.data ?? []
  return posts.map((post) => {
    const postInteractions = interactions.find((item) => item.post_id === post.id)
    return {
      ...post,
      likes: likes.filter((like) => like.post_id === post.id).length,
      liked: likes.some((like) => like.post_id === post.id && like.user_id === userId),
      comments: Number(postInteractions?.comments_count ?? 0),
      reposts: Number(postInteractions?.reposts_count ?? 0),
      reposted: postInteractions?.reposted ?? false,
    }
  })
}

export async function loadPostById(postId: string, userId: string): Promise<LoadedPost> {
  const client = requireSupabase()
  const { data: row, error } = await client.from('posts').select('*').eq('id', postId).single()
  if (error) throw error
  const post = row as SocialPost
  const [likesResult, interactionsResult] = await Promise.all([
    client.from('post_likes').select('post_id, user_id').eq('post_id', postId),
    client.rpc('get_post_interaction_counts', { post_ids: [postId] }),
  ])
  if (likesResult.error) throw likesResult.error
  if (interactionsResult.error) throw interactionsResult.error
  const interaction = interactionsResult.data?.[0]
  return {
    ...post,
    likes: likesResult.data?.length ?? 0,
    liked: likesResult.data?.some((like) => like.user_id === userId) ?? false,
    comments: Number(interaction?.comments_count ?? 0),
    reposts: Number(interaction?.reposts_count ?? 0),
    reposted: interaction?.reposted ?? false,
  }
}

export async function loadPostComments(postId: string): Promise<PostComment[]> {
  const { data, error } = await requireSupabase().from('post_comments')
    .select('*, author:profiles!post_comments_user_id_fkey(*)')
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
    .limit(100)
  if (error) throw error
  return (data ?? []) as unknown as PostComment[]
}

export async function loadStatuses(userId: string): Promise<MemberStatus[]> {
  const client = requireSupabase()
  const { data: rows, error } = await client.from('statuses')
    .select('*, author:profiles!statuses_user_id_fkey(*)')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  const statuses = (rows ?? []) as unknown as Omit<MemberStatus, 'viewed' | 'viewers' | 'reactions' | 'image_url'>[]
  if (statuses.length === 0) return []
  const ids = statuses.map((status) => status.id)
  const [viewsResult, reactionsResult, statusesWithImages] = await Promise.all([
    client.from('status_views')
      .select('status_id, viewer:profiles!status_views_viewer_id_fkey(*)')
      .in('status_id', ids),
    client.from('status_reactions')
      .select('status_id, user_id, emoji, actor:profiles!status_reactions_user_id_fkey(*)')
      .in('status_id', ids),
    Promise.all(statuses.map(async (status) => {
      if (!status.image_path) return { ...status, image_url: null }
      const { data, error: imageError } = await client.storage.from('status-media')
        .createSignedUrl(status.image_path, 15 * 60)
      if (imageError) throw imageError
      return { ...status, image_url: data.signedUrl }
    })),
  ])
  if (viewsResult.error) throw viewsResult.error
  if (reactionsResult.error) throw reactionsResult.error
  const views = (viewsResult.data ?? []) as unknown as { status_id: string; viewer: Profile }[]
  const reactions = (reactionsResult.data ?? []) as unknown as StatusReaction[]
  return statusesWithImages.map((status) => {
    const viewers = views.filter((view) => view.status_id === status.id && status.user_id === userId)
      .map((view) => view.viewer)
      .filter((viewer) => viewer.id !== userId)
    return {
      ...status,
      viewed: views.some((view) => view.status_id === status.id && view.viewer.id === userId),
      viewers,
      reactions: reactions.filter((reaction) => reaction.status_id === status.id),
    }
  })
}

export async function createStatus(userId: string, content: string, media?: File): Promise<MemberStatus> {
  const client = requireSupabase()
  if (!content.trim() && !media) throw new Error('Add a message or photo before sharing your status.')
  if (content.length > 500) throw new Error('Status text must be 500 characters or fewer.')
  if (media && (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(media.type) || media.size > 5 * 1024 * 1024)) {
    throw new Error('Choose a JPG, PNG, WebP, or GIF photo up to 5 MB.')
  }
  const statusId = crypto.randomUUID()
  let imageUrl: string | null = null
  let mediaPath: string | null = null
  if (media) {
    const extension = media.type === 'image/jpeg' ? 'jpg' : media.type.slice('image/'.length)
    mediaPath = `${userId}/${statusId}/${crypto.randomUUID()}.${extension}`
    const { error } = await client.storage.from('status-media').upload(mediaPath, media, {
      contentType: media.type,
      cacheControl: '3600',
    })
    if (error) throw error
  }
  const { data, error } = await client.from('statuses')
    .insert({ id: statusId, user_id: userId, content: content.trim(), image_path: mediaPath })
    .select('*, author:profiles!statuses_user_id_fkey(*)')
    .single()
  if (error) {
    if (mediaPath) {
      const { error: cleanupError } = await client.storage.from('status-media').remove([mediaPath])
      if (cleanupError) throw new Error(`${error.message} The uploaded status photo could not be cleaned up: ${cleanupError.message}`)
    }
    throw error
  }
  if (mediaPath) {
    const { data: signed, error: signedError } = await client.storage.from('status-media').createSignedUrl(mediaPath, 15 * 60)
    if (signedError) {
      const { error: deleteError } = await client.from('statuses').delete().eq('id', statusId).eq('user_id', userId)
      const { error: cleanupError } = await client.storage.from('status-media').remove([mediaPath])
      const cleanupErrors = [deleteError?.message, cleanupError?.message].filter(Boolean).join(' ')
      throw new Error(`The status photo link could not be created: ${signedError.message}${cleanupErrors ? ` Cleanup also failed: ${cleanupErrors}` : ''}`)
    }
    imageUrl = signed.signedUrl
  }
  return {
    ...(data as unknown as Omit<MemberStatus, 'viewed' | 'viewers' | 'reactions'>),
    image_url: imageUrl,
    viewed: true,
    viewers: [],
    reactions: [],
  }
}

export async function recordStatusView(statusId: string, viewerId: string): Promise<void> {
  const { error } = await requireSupabase().from('status_views')
    .upsert({ status_id: statusId, viewer_id: viewerId }, {
      onConflict: 'status_id,viewer_id',
      ignoreDuplicates: true,
    })
  if (error) throw error
}

export async function setStatusReaction(statusId: string, userId: string, emoji: string | null): Promise<void> {
  const client = requireSupabase()
  const result = emoji
    ? await client.from('status_reactions').upsert(
      { status_id: statusId, user_id: userId, emoji },
      { onConflict: 'status_id,user_id' },
    )
    : await client.from('status_reactions').delete().eq('status_id', statusId).eq('user_id', userId)
  if (result.error) throw result.error
}

export async function replyToStatus(statusId: string, content: string): Promise<ChatMessage> {
  const { data, error } = await requireSupabase().rpc('reply_to_status', {
    target_status_id: statusId,
    reply_content: content.trim(),
  })
  if (error) throw error
  return data as ChatMessage
}

export function subscribeToStatuses(onChange: () => void, onError: (message: string) => void): RealtimeChannel {
  return requireSupabase()
    .channel('member-statuses')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'statuses' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'status_views' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'status_reactions' }, onChange)
    .subscribe((status, error) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        onError(error?.message ?? 'Live status updates are temporarily unavailable.')
      }
    })
}

export async function addPostComment(postId: string, userId: string, content: string): Promise<PostComment> {
  const { data, error } = await requireSupabase().from('post_comments')
    .insert({ post_id: postId, user_id: userId, content })
    .select('*, author:profiles!post_comments_user_id_fkey(*)')
    .single()
  if (error) throw error
  return data as unknown as PostComment
}

export async function togglePostRepost(postId: string, userId: string, reposted: boolean): Promise<void> {
  const client = requireSupabase()
  const result = reposted
    ? await client.from('post_reposts').delete().eq('post_id', postId).eq('user_id', userId)
    : await client.from('post_reposts').insert({ post_id: postId, user_id: userId })
  if (result.error) throw result.error
}

export async function createPost(userId: string, content: string, media?: File) {
  const client = requireSupabase()
  let imageUrl: string | null = null
  let videoUrl: string | null = null
  let mediaPath: string | null = null
  if (media) {
    const extension = media.name.split('.').pop()?.toLowerCase() || 'jpg'
    mediaPath = `${userId}/${crypto.randomUUID()}.${extension}`
    const { error } = await client.storage.from('post-media').upload(mediaPath, media, {
      contentType: media.type,
      cacheControl: '3600',
    })
    if (error) throw error
    const publicUrl = client.storage.from('post-media').getPublicUrl(mediaPath).data.publicUrl
    if (media.type.startsWith('video/')) videoUrl = publicUrl
    else imageUrl = publicUrl
  }
  const { data, error } = await client.from('posts').insert({
    user_id: userId,
    content,
    image_url: imageUrl,
    video_url: videoUrl,
  }).select('*').single()
  if (error) {
    if (mediaPath) {
      const { error: cleanupError } = await client.storage.from('post-media').remove([mediaPath])
      if (cleanupError) throw new Error(`${error.message} The uploaded media could not be cleaned up: ${cleanupError.message}`)
    }
    throw error
  }
  return data as SocialPost
}

function postMediaPath(imageUrl: string | null) {
  if (!imageUrl) return null
  const marker = '/storage/v1/object/public/post-media/'
  const markerIndex = imageUrl.indexOf(marker)
  if (markerIndex < 0) return null
  return decodeURIComponent(imageUrl.slice(markerIndex + marker.length).split(/[?#]/, 1)[0])
}

export async function updatePost(
  postId: string,
  userId: string,
  content: string,
  media?: File,
  removeMedia = false,
): Promise<{ post: SocialPost; warning?: string }> {
  const client = requireSupabase()
  const { data: current, error: loadError } = await client.from('posts')
    .select('image_url, video_url')
    .eq('id', postId)
    .eq('user_id', userId)
    .single()
  if (loadError) throw loadError

  let uploadedPath: string | null = null
  let imageUrl = current.image_url as string | null
  let videoUrl = current.video_url as string | null
  if (media) {
    const extension = media.name.split('.').pop()?.toLowerCase() || 'jpg'
    uploadedPath = `${userId}/${crypto.randomUUID()}.${extension}`
    const { error } = await client.storage.from('post-media').upload(uploadedPath, media, {
      contentType: media.type,
      cacheControl: '3600',
    })
    if (error) throw error
    const publicUrl = client.storage.from('post-media').getPublicUrl(uploadedPath).data.publicUrl
    imageUrl = media.type.startsWith('video/') ? null : publicUrl
    videoUrl = media.type.startsWith('video/') ? publicUrl : null
  } else if (removeMedia) {
    imageUrl = null
    videoUrl = null
  }

  const { data, error } = await client.from('posts')
    .update({ content, image_url: imageUrl, video_url: videoUrl })
    .eq('id', postId)
    .eq('user_id', userId)
    .select('*')
    .single()
  if (error) {
    if (uploadedPath) {
      const { error: cleanupError } = await client.storage.from('post-media').remove([uploadedPath])
      if (cleanupError) throw new Error(`${error.message} The replacement image could not be cleaned up: ${cleanupError.message}`)
    }
    throw error
  }

  const oldPaths = media || removeMedia
    ? [postMediaPath(current.image_url as string | null), postMediaPath(current.video_url as string | null)]
      .filter((path): path is string => Boolean(path) && path !== uploadedPath)
    : []
  if (oldPaths.length === 0) return { post: data as SocialPost }
  const { error: cleanupError } = await client.storage.from('post-media').remove(oldPaths)
  return {
    post: data as SocialPost,
    ...(cleanupError ? { warning: `The post was updated, but its previous image could not be removed: ${cleanupError.message}` } : {}),
  }
}

export async function deletePost(postId: string, userId: string): Promise<string | undefined> {
  const client = requireSupabase()
  const { data: post, error: loadError } = await client.from('posts')
    .select('image_url, video_url')
    .eq('id', postId)
    .eq('user_id', userId)
    .single()
  if (loadError) throw loadError

  const { error } = await client.from('posts').delete().eq('id', postId).eq('user_id', userId)
  if (error) throw error

  const mediaPaths = [
    postMediaPath(post.image_url as string | null),
    postMediaPath(post.video_url as string | null),
  ].filter((path): path is string => Boolean(path))
  if (mediaPaths.length === 0) return
  const { error: cleanupError } = await client.storage.from('post-media').remove(mediaPaths)
  return cleanupError
    ? `Your post was deleted, but its image could not be removed: ${cleanupError.message}`
    : undefined
}

export async function togglePostLike(postId: string, userId: string, liked: boolean) {
  const client = requireSupabase()
  const result = liked
    ? await client.from('post_likes').delete().eq('post_id', postId).eq('user_id', userId)
    : await client.from('post_likes').insert({ post_id: postId, user_id: userId })
  if (result.error) throw result.error
}

export async function loadNotifications(userId: string) {
  const client = requireSupabase()
  const [rows, unread] = await Promise.all([
    client.from('notifications')
      .select('*, actor:profiles!notifications_actor_id_fkey(*)')
      .eq('recipient_id', userId)
      .order('created_at', { ascending: false })
      .limit(30),
    client.from('notifications').select('id', { count: 'exact', head: true })
      .eq('recipient_id', userId)
      .is('read_at', null),
  ])
  if (rows.error) throw rows.error
  if (unread.error) throw unread.error
  return { notifications: (rows.data ?? []) as unknown as PostNotification[], unread: unread.count ?? 0 }
}

export async function markNotificationsRead(userId: string) {
  const client = requireSupabase()
  const { error } = await client.from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_id', userId)
    .is('read_at', null)
  if (error) throw error
}

export function subscribeToNotifications(userId: string, onChange: () => void, onError: (message: string) => void) {
  return requireSupabase()
    .channel(`notifications:${userId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'notifications',
      filter: `recipient_id=eq.${userId}`,
    }, onChange)
    .subscribe((status, error) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        onError(error?.message ?? 'Live notifications are temporarily unavailable.')
      }
    })
}

export function subscribeToPostInteractions(onChange: () => void, onError: (message: string) => void): RealtimeChannel {
  return requireSupabase()
    .channel('post-interactions')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'post_comments',
    }, onChange)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'post_reposts',
    }, onChange)
    .subscribe((status, error) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        onError(error?.message ?? 'Live post comment and repost updates are temporarily unavailable.')
      }
    })
}

export async function setFollowing(userId: string, personId: string, following: boolean) {
  const client = requireSupabase()
  const result = following
    ? await client.from('follows').insert({ follower_id: userId, following_id: personId })
    : await client.from('follows').delete().eq('follower_id', userId).eq('following_id', personId)
  if (result.error) throw result.error
}

export async function loadConversations(userId: string) {
  const client = requireSupabase()
  const { data: rows, error } = await client
    .from('conversations')
    .select('id, user_one, user_two')
    .or(`user_one.eq.${userId},user_two.eq.${userId}`)
    .order('updated_at', { ascending: false })
  if (error) throw error
  const conversations = rows ?? []
  if (conversations.length === 0) return []

  const { data: messages, error: messagesError } = await client
    .from('messages')
    .select('*')
    .in('conversation_id', conversations.map((conversation) => conversation.id))
    .order('created_at', { ascending: true })
  if (messagesError) throw messagesError

  return conversations.map((conversation) => ({
    id: conversation.id as string,
    userId: (conversation.user_one === userId ? conversation.user_two : conversation.user_one) as string,
    messages: (messages ?? [])
      .filter((message) => message.conversation_id === conversation.id)
      .map((message) => message as ChatMessage),
  }))
}

export function subscribeToConversations(
  userId: string,
  onInsert: () => void,
  onError: (message: string) => void,
) {
  return requireSupabase()
    .channel(`member-conversations:${userId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'conversations',
    }, onInsert)
    .subscribe((status, error) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        onError(error?.message ?? 'Live conversation updates are temporarily unavailable.')
      }
    })
}

export async function openConversation(personId: string) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('get_or_create_direct_conversation', { target_user: personId })
  if (error) throw error
  return data as string
}

export async function createGroupCallRoom(userIds: string[], mode: 'voice' | 'video') {
  const { data, error } = await requireSupabase().rpc('create_call_room', {
    target_users: userIds,
    requested_mode: mode,
  })
  if (error) throw error
  return data as string
}

export async function joinGroupCallRoom(callId: string) {
  const { error } = await requireSupabase().rpc('join_call_room', { target_call_id: callId })
  if (error) throw error
}

export async function leaveGroupCallRoom(callId: string) {
  const { error } = await requireSupabase().rpc('leave_call_room', { target_call_id: callId })
  if (error) throw error
}

export async function endGroupCallRoom(callId: string) {
  const { error } = await requireSupabase().rpc('end_call_room', { target_call_id: callId })
  if (error) throw error
}

export async function sendChatMessage(conversationId: string, senderId: string, content: string, attachmentName?: string) {
  const client = requireSupabase()
  const { data, error } = await client.from('messages').insert({
      conversation_id: conversationId,
      sender_id: senderId,
      content,
      attachment_name: attachmentName ?? null,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as ChatMessage
}

export async function editChatMessage(messageId: string, content: string) {
  const { error } = await requireSupabase().rpc('edit_direct_message', {
    target_message_id: messageId,
    new_content: content,
  })
  if (error) throw error
}

export async function markConversationRead(conversationId: string) {
  const { error } = await requireSupabase().rpc('mark_conversation_read', {
    target_conversation_id: conversationId,
  })
  if (error) throw error
}

export function subscribeToMessages(
  conversationId: string,
  onMessage: (message: ChatMessage) => void,
  onError: (message: string) => void,
): RealtimeChannel {
  return requireSupabase()
    .channel(`conversation:${conversationId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'messages',
      filter: `conversation_id=eq.${conversationId}`,
    }, (payload) => {
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        onMessage(payload.new as ChatMessage)
      }
    })
    .subscribe((status, error) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        onError(error?.message ?? 'Live message updates are temporarily unavailable.')
      }
    })
}

export async function updateProfile(userId: string, profile: Pick<Profile, 'full_name' | 'username' | 'city' | 'bio'>) {
  const client = requireSupabase()
  const { error } = await client.from('profiles').update(profile).eq('id', userId)
  if (error) throw error
}

export async function updateAvatar(userId: string, file: File) {
  const client = requireSupabase()
  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `${userId}/${crypto.randomUUID()}.${extension}`
  const { error: uploadError } = await client.storage.from('avatars').upload(path, file, {
    contentType: file.type,
    cacheControl: '3600',
    upsert: false,
  })
  if (uploadError) throw uploadError

  const { data: { publicUrl } } = client.storage.from('avatars').getPublicUrl(path)
  const { error: profileError } = await client.from('profiles').update({ avatar_url: publicUrl }).eq('id', userId)
  if (profileError) {
    const { error: cleanupError } = await client.storage.from('avatars').remove([path])
    if (cleanupError) {
      throw new Error(`${profileError.message} The uploaded image could not be cleaned up: ${cleanupError.message}`)
    }
    throw profileError
  }
  return publicUrl
}

async function addMarketplaceImageUrls(rows: Record<string, unknown>[]): Promise<MarketplaceListing[]> {
  const client = requireSupabase()
  const paths = rows
    .map((row) => row.image_path)
    .filter((path): path is string => typeof path === 'string' && path.length > 0)
  const signedByPath = new Map<string, string>()
  if (paths.length > 0) {
    const { data, error } = await client.storage.from('marketplace-images').createSignedUrls(paths, 3600)
    if (error) throw error
    for (const item of data ?? []) {
      if (item.path && item.signedUrl) signedByPath.set(item.path, item.signedUrl)
    }
    const failedPaths = paths.filter((path) => !signedByPath.has(path))
    if (failedPaths.length > 0) {
      console.error('Could not create signed links for marketplace photos:', failedPaths)
    }
  }
  return rows.map((row) => ({
    ...row,
    image_url: typeof row.image_path === 'string' ? signedByPath.get(row.image_path) ?? null : null,
  })) as unknown as MarketplaceListing[]
}

export async function loadMarketplaceListings() {
  const client = requireSupabase()
  const { data, error } = await client.from('marketplace_listings')
    .select('*, seller:profiles!marketplace_listings_seller_id_fkey(*)')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return addMarketplaceImageUrls((data ?? []) as Record<string, unknown>[])
}

export async function createMarketplaceListing(listing: NewMarketplaceListing, image?: File) {
  const client = requireSupabase()
  let imagePath: string | null = null
  let imageUrl: string | null = null
  if (image) {
    const extension = image.name.split('.').pop()?.toLowerCase() || 'jpg'
    imagePath = `${listing.seller_id}/${crypto.randomUUID()}.${extension}`
    const { error: uploadError } = await client.storage.from('marketplace-images').upload(imagePath, image, {
      contentType: image.type,
      cacheControl: '3600',
      upsert: false,
    })
    if (uploadError) throw uploadError
    const { data: signed, error: signedError } = await client.storage.from('marketplace-images')
      .createSignedUrl(imagePath, 3600)
    if (signedError) {
      const { error: cleanupError } = await client.storage.from('marketplace-images').remove([imagePath])
      if (cleanupError) throw new Error(`${signedError.message} The uploaded product photo could not be cleaned up: ${cleanupError.message}`)
      throw signedError
    }
    imageUrl = signed.signedUrl
  }
  const { data, error } = await client.from('marketplace_listings')
    .insert({ ...listing, image_path: imagePath })
    .select('*, seller:profiles!marketplace_listings_seller_id_fkey(*)')
    .single()
  if (error) {
    if (imagePath) {
      const { error: cleanupError } = await client.storage.from('marketplace-images').remove([imagePath])
      if (cleanupError) throw new Error(`${error.message} The uploaded product photo could not be cleaned up: ${cleanupError.message}`)
    }
    throw error
  }
  return { ...data, image_url: imageUrl } as MarketplaceListing
}

export async function deleteMarketplaceListing(listingId: string, sellerId: string) {
  const client = requireSupabase()
  const { data: current, error: loadError } = await client.from('marketplace_listings')
    .select('image_path')
    .eq('id', listingId)
    .eq('seller_id', sellerId)
    .maybeSingle()
  if (loadError) throw loadError
  if (!current) throw new Error('This listing was already removed or is no longer yours to remove.')
  const { data, error } = await client.from('marketplace_listings')
    .delete()
    .eq('id', listingId)
    .eq('seller_id', sellerId)
    .select('id')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('This listing was already removed or is no longer yours to remove.')
  if (current.image_path) {
    const { error: cleanupError } = await client.storage.from('marketplace-images').remove([current.image_path])
    if (cleanupError) throw new Error(`The listing was removed, but its product photo could not be deleted: ${cleanupError.message}`)
  }
}
