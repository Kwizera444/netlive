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
}

export type SocialPost = {
  id: string
  user_id: string
  content: string
  image_url: string | null
  created_at: string
}

export type LoadedPost = SocialPost & { likes: number; liked: boolean }

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

export type ProfileCounts = {
  moments: number
  following: number
  followers: number
}

export type TrendingTopic = { tag: string; moments: number }
export type AiChatMessage = { sender: 'you' | 'them'; text: string }
export type RwandaNewsItem = { title: string; url: string; publishedAt: string }
export type RwandaNews = {
  source: string
  sourceUrl: string
  items: RwandaNewsItem[]
  fetchedAt: string
}

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
    && /bucket not found|no such bucket/i.test(error.message)
  ) {
    return /post-media/i.test(error.message)
      ? 'The post-media storage bucket is missing. Run supabase/migrations/20261005000300_posts_notifications.sql in Supabase → SQL Editor, then try again.'
      : 'A Supabase storage bucket is missing. Run the storage setup migration in Supabase → SQL Editor, then try again.'
  }
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = String(error.code)
    if (code === 'PGRST205' || code === '42P01') {
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
  const { data: likes, error: likesError } = await client.from('post_likes')
    .select('post_id, user_id')
    .in('post_id', posts.map((post) => post.id))
  if (likesError) throw likesError
  return posts.map((post) => {
    const postLikes = likes ?? []
    return {
      ...post,
      likes: postLikes.filter((like) => like.post_id === post.id).length,
      liked: postLikes.some((like) => like.post_id === post.id && like.user_id === userId),
    }
  })
}

export async function createPost(userId: string, content: string, image?: File) {
  const client = requireSupabase()
  let imageUrl: string | null = null
  let imagePath: string | null = null
  if (image) {
    const extension = image.name.split('.').pop()?.toLowerCase() || 'jpg'
    imagePath = `${userId}/${crypto.randomUUID()}.${extension}`
    const { error } = await client.storage.from('post-media').upload(imagePath, image, {
      contentType: image.type,
      cacheControl: '3600',
    })
    if (error) throw error
    imageUrl = client.storage.from('post-media').getPublicUrl(imagePath).data.publicUrl
  }
  const { data, error } = await client.from('posts').insert({
    user_id: userId,
    content,
    image_url: imageUrl,
  }).select('*').single()
  if (error) {
    if (imagePath) {
      const { error: cleanupError } = await client.storage.from('post-media').remove([imagePath])
      if (cleanupError) throw new Error(`${error.message} The uploaded image could not be cleaned up: ${cleanupError.message}`)
    }
    throw error
  }
  return data as SocialPost
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

export function subscribeToMessages(
  conversationId: string,
  onMessage: (message: ChatMessage) => void,
  onError: (message: string) => void,
): RealtimeChannel {
  return requireSupabase()
    .channel(`conversation:${conversationId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `conversation_id=eq.${conversationId}`,
    }, (payload) => onMessage(payload.new as ChatMessage))
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
