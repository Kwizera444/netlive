import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ComponentProps, type FormEvent, type ReactNode } from 'react'
import {
  ArrowLeft, ArrowRight, ArrowUpRight, AudioLines, Bell, Bookmark, Camera, CreditCard,
  Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, Clock3, Compass, Ellipsis, Eye,
  BookOpen, Film, Globe2, Grid3X3, Heart, ImagePlus, Languages, Link2, LogOut, MessageCircle, Mic,
  MicOff, Moon, MoreHorizontal, Palette, Paperclip, PenLine, Phone, PhoneOff, Plus, Search,
  Library, MapPin, Newspaper, RefreshCw, Repeat2, Send, Settings, Share2, ShoppingBag, Smile, Sparkles, Store, Sun, Tag, ThumbsUp,
  Minus, ShoppingCart, Trash2, UserPlus, Users, Video, VideoOff,
  X,
} from 'lucide-react'
import {
  createPost as savePost, createStatus as saveStatus, draftChatReply, explainAvatarUploadError, explainSupabaseError, isSupabaseConfigured,
  addPostComment, loadConversations, loadNotifications, loadPeople, loadPosts, loadPostById, loadPostComments, loadStatuses,
  loadProfile, loadProfileCounts, loadRwandaNews, loadTrendingTopics, markNotificationsRead, openConversation,
  sendChatMessage, editChatMessage, markConversationRead, recordStatusView, replyToStatus, setFollowing, setStatusReaction,
  subscribeToMessages, subscribeToConversations, subscribeToNotifications, subscribeToStatuses,
  subscribeToPostInteractions,
  supabase, deletePost as removePost, togglePostLike, togglePostRepost, updateAvatar as saveAvatar,
  updatePost as savePostEdit,
  updateProfile as saveProfile,
  createMarketplaceListing, deleteMarketplaceListing, loadMarketplaceListings,
  type AiChatMessage, type ChatMessage, type LoadedPost, type MarketplaceListing, type MemberStatus, type NewMarketplaceListing, type PostComment, type PostNotification, type Profile,
  type RwandaNews, type TrendingTopic,
} from './lib/supabase'
import { useWebRtcCalls, type ActiveCall, type CallMode, type CallParticipant, type CallPeer } from './hooks/useWebRtcCalls'
import { bookCoverUrl, bookReaderUrl, searchBooks, type Book } from './lib/books'
import './App.css'

type Language = 'en' | 'rw' | 'fr' | 'sw'
type User = { id: string; name: string; handle: string; city: string; bio: string; avatar: string; online?: boolean }
type Post = { id: string; userId: string; text: string; image?: string; video?: string; time: string; likes: number; comments: number; reposts: number; liked?: boolean; reposted?: boolean; saved?: boolean }
type Message = { id: string; from: string; text: string; time: string; attachment?: string; editedAt?: string; readAt?: string; statusId?: string; statusReplyContent?: string }
type Conversation = { id: string; userId: string; messages: Message[] }
type Account = { id: string; name: string; email: string; handle: string; city: string; bio: string; avatar: string }

const fallbackAvatar = (variant: number) => {
  const palettes = [
    ['#e9dafa', '#8e75c6', '#614781'],
    ['#d4edf0', '#5596a6', '#345b71'],
    ['#f8e4d2', '#d29469', '#805844'],
    ['#d8ebdc', '#6d9d75', '#40654a'],
    ['#f5dfe5', '#c3738e', '#794859'],
    ['#e1e8f3', '#7188b6', '#455675'],
  ]
  const [light, mid, dark] = palettes[variant % palettes.length]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${light}"/><stop offset="1" stop-color="${mid}"/></linearGradient></defs><rect width="120" height="120" rx="60" fill="url(#g)"/><circle cx="60" cy="46" r="21" fill="#fff" fill-opacity=".92"/><path d="M19 115c2-26 18-41 41-41s39 15 41 41" fill="#fff" fill-opacity=".92"/><path d="M47 46h.5m25 0h.5" stroke="${dark}" stroke-width="3.5" stroke-linecap="round"/><path d="M53 57c4 3 10 3 14 0" fill="none" stroke="${dark}" stroke-width="2.4" stroke-linecap="round"/><path d="M44 38c3-9 10-14 18-14 10 0 16 7 17 15-8-3-15-8-19-13-3 6-9 10-16 12" fill="${dark}" fill-opacity=".72"/></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
const initialUsers: User[] = [
  { id: 'maya', name: 'Maya Uwase', handle: 'maya.uwase', city: 'Kigali, Rwanda', bio: 'Building bright things, one little idea at a time ✨', avatar: fallbackAvatar(0), online: true },
  { id: 'keza', name: 'Keza Mutoni', handle: 'kezamutoni', city: 'Kigali, Rwanda', bio: 'Designer, coffee lover & weekend explorer ☕', avatar: fallbackAvatar(1), online: true },
  { id: 'elly', name: 'Elly Niyonsaba', handle: 'elly.niyo', city: 'Huye, Rwanda', bio: 'Photographer finding stories in the little things.', avatar: fallbackAvatar(2), online: true },
  { id: 'aisha', name: 'Aisha Mutesi', handle: 'aisha.m', city: 'Musanze, Rwanda', bio: 'Travel, community, and a little bit of magic ✨', avatar: fallbackAvatar(3), online: false },
  { id: 'sam', name: 'Sam Rukundo', handle: 'sam.rukundo', city: 'Kigali, Rwanda', bio: 'Making music and making it count 🎧', avatar: fallbackAvatar(4), online: true },
  { id: 'diane', name: 'Diane Ishimwe', handle: 'diane.ish', city: 'Rubavu, Rwanda', bio: 'Small business owner. Big dreamer.', avatar: fallbackAvatar(5), online: false },
]
const toPost = (post: LoadedPost | (LoadedPost & { saved?: boolean })): Post => ({
  id: post.id,
  userId: post.user_id,
  text: post.content,
  image: post.image_url ?? undefined,
  video: post.video_url ?? undefined,
  time: new Date(post.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }),
  likes: post.likes,
  comments: post.comments,
  reposts: post.reposts,
  reposted: post.reposted,
  liked: post.liked,
  saved: 'saved' in post ? post.saved : false,
})

function timeAgo(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function NotificationPanel({
  notifications, onClose, onOpen,
}: {
  notifications: PostNotification[]
  onClose: () => void
  onOpen: (notification: PostNotification) => void
}) {
  const description = (notification: PostNotification) => {
    const actor = notification.actor.full_name || `@${notification.actor.username}`
    if (notification.event_type === 'follow') return `${actor} started following you`
    if (notification.event_type === 'like') return `${actor} liked your moment`
    return `${actor} sent you a message`
  }
  return (
    <section className="notification-popover real-notification-popover" aria-label="Notifications">
      <div className="notification-heading"><strong>Your notifications</strong><button onClick={onClose} aria-label="Close notifications"><X size={16} /></button></div>
      {notifications.length === 0
        ? <div className="notification-empty"><Bell size={20} /><strong>You’re all caught up</strong><p>New follows, likes, and messages will appear here.</p></div>
        : <div className="notification-list">{notifications.map((notification) => (
          <button key={notification.id} className={`notification-item ${notification.read_at ? '' : 'unread'}`} onClick={() => onOpen(notification)}>
            <img src={notification.actor.avatar_url || fallbackAvatar(notification.actor.username.length)} alt="" />
            <span><strong>{description(notification)}</strong><small>{timeAgo(notification.created_at)}</small></span>
            {!notification.read_at && <i />}
          </button>
        ))}</div>}
    </section>
  )
}

function CallOverlay({
  call, onAccept, onEnd, onToggleMicrophone, onToggleCamera, onSendGift,
}: {
  call: ActiveCall
  onAccept: () => void
  onEnd: () => void
  onToggleMicrophone: () => void
  onToggleCamera: () => void
  onSendGift: (gift: { emoji: string; label: string }) => void
}) {
  const localVideo = useRef<HTMLVideoElement>(null)
  const remoteVideo = useRef<HTMLVideoElement>(null)
  const remoteAudio = useRef<HTMLAudioElement>(null)
  const [callClock, setCallClock] = useState(() => Date.now())

  useEffect(() => {
    if (localVideo.current) localVideo.current.srcObject = call.localStream
    if (remoteVideo.current) remoteVideo.current.srcObject = call.remoteStream
    if (remoteAudio.current) remoteAudio.current.srcObject = call.remoteStream
  }, [call.localStream, call.remoteStream])

  useEffect(() => {
    if (call.phase !== 'connected') return
    setCallClock(Date.now())
    const interval = window.setInterval(() => setCallClock(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [call.phase, call.connectedAt])

  const callDuration = call.connectedAt
    ? `${Math.floor((callClock - call.connectedAt) / 60_000).toString().padStart(2, '0')}:${Math.floor((callClock - call.connectedAt) / 1000 % 60).toString().padStart(2, '0')}`
    : ''
  const status = call.phase === 'incoming'
    ? `Incoming ${call.groupCallId ? 'group ' : ''}${call.mode} call`
    : call.phase === 'calling'
      ? 'Calling…'
      : call.phase === 'connecting'
        ? 'Connecting…'
        : 'Connected'
  return (
    <div className="call-backdrop">
      <section className={`call-window ${call.mode === 'voice' ? 'voice-call-window' : ''}`} role="dialog" aria-modal="true" aria-label={`${call.groupCallId ? 'group ' : ''}${call.mode} call with ${call.peer.name}`}>
        <header className="call-window-header">
          <span><i className={`call-status-dot ${call.phase}`} />{status}{callDuration && ` · ${callDuration}`}</span>
          <button className="soft-icon" onClick={onEnd} aria-label="End call"><X size={18} /></button>
        </header>
        <div className={`call-video-stage ${call.mode}`}>
          {call.mode === 'video' && call.phase !== 'incoming'
            ? <>
              {call.groupCallId
                ? <div className="group-call-video-grid">
                  {call.participants.map((participant) => <CallParticipantTile key={participant.peer.id} participant={participant} mode={call.mode} />)}
                  <div className="group-call-local-tile"><video ref={localVideo} autoPlay muted playsInline /><span>You</span></div>
                </div>
                : <>
                  <video ref={remoteVideo} className="call-remote-video" autoPlay playsInline />
                  <video ref={localVideo} className="call-local-video" autoPlay muted playsInline />
                  {!call.remoteStream && <div className="call-waiting"><img src={call.peer.avatar} alt="" /><strong>{call.peer.name}</strong><span>{status}</span></div>}
                </>}
            </>
            : <div className="call-avatar-stage">
              {call.groupCallId && call.phase !== 'incoming'
                ? <div className="group-call-avatar-list">{call.participants.map((participant) => <CallParticipantTile key={participant.peer.id} participant={participant} mode={call.mode} />)}</div>
                : <span className="call-avatar-ring"><img src={call.peer.avatar} alt="" /></span>}
              <h2>{call.groupCallId ? call.phase === 'incoming' ? `${call.peer.name} invited you` : 'Your group call' : call.peer.name}</h2><p>{call.error || status}</p>
            </div>}
          {call.mode === 'voice' && <audio ref={remoteAudio} autoPlay />}
          {call.error && <div className="call-error">{call.error}</div>}
          {call.lastGift && <div className="call-gift-animation" key={call.lastGift.id}><span>{call.lastGift.emoji}</span><strong>{call.lastGift.sender} sent {call.lastGift.label}</strong></div>}
        </div>
        {call.phase !== 'incoming' && <div className="call-gifts" aria-label="Send a call reaction">
          <span>Send a little joy</span>
          {[{ emoji: '💐', label: 'flowers' }, { emoji: '💛', label: 'a heart' }, { emoji: '🎉', label: 'a celebration' }, { emoji: '✨', label: 'sparkles' }].map((gift) =>
            <button key={gift.emoji} disabled={call.phase !== 'connected'} onClick={() => onSendGift(gift)} aria-label={`Send ${gift.label}`} title={call.phase === 'connected' ? `Send ${gift.label}` : 'Available when connected'}>{gift.emoji}</button>)}
        </div>}
        <footer className="call-controls">
          {call.phase === 'incoming'
            ? <><button className="call-decline" onClick={onEnd} aria-label="Decline call"><PhoneOff size={20} /></button><button className="call-accept" onClick={onAccept} aria-label="Accept call"><Phone size={20} /></button></>
            : <>
              <button className={`call-control ${call.microphoneOn ? '' : 'disabled'}`} onClick={onToggleMicrophone} aria-label={call.microphoneOn ? 'Mute microphone' : 'Unmute microphone'}>{call.microphoneOn ? <Mic size={18} /> : <MicOff size={18} />}</button>
              {call.mode === 'video' && <button className={`call-control ${call.cameraOn ? '' : 'disabled'}`} onClick={onToggleCamera} aria-label={call.cameraOn ? 'Turn camera off' : 'Turn camera on'}>{call.cameraOn ? <Video size={18} /> : <VideoOff size={18} />}</button>}
              <button className="call-decline" onClick={onEnd} aria-label="End call"><PhoneOff size={20} /></button>
            </>}
        </footer>
      </section>
    </div>
  )
}

function CallParticipantTile({ participant, mode }: { participant: CallParticipant; mode: CallMode }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (audioRef.current) audioRef.current.srcObject = participant.stream
    if (videoRef.current) videoRef.current.srcObject = participant.stream
  }, [participant.stream])

  const hasLiveVideo = participant.stream?.getVideoTracks().some((track) => track.enabled && track.readyState === 'live')
  return <div className="group-call-participant-tile">
    {mode === 'video' && hasLiveVideo
      ? <video ref={videoRef} autoPlay playsInline />
      : <div className="group-call-participant-avatar"><img src={participant.peer.avatar} alt="" /><span>{participant.peer.name}</span></div>}
    {(mode === 'voice' || !hasLiveVideo) && <audio ref={audioRef} autoPlay />}
    <span className="group-call-participant-name">{participant.peer.name}</span>
  </div>
}

function TrendingAndNews({
  topics, news, topicsLoading, newsLoading, topicsError, newsError, onSelectTag,
}: {
  topics: TrendingTopic[]
  news: RwandaNews | null
  topicsLoading: boolean
  newsLoading: boolean
  topicsError: string
  newsError: string
  onSelectTag: (tag: string) => void
}) {
  return (
    <section className="rail-card trending-card">
      <div className="rail-heading">
        <div><span className="eyebrow">A LITTLE BUZZ</span><h3>Trending in Rwanda</h3></div>
        <Sparkles size={16} />
      </div>
      <div className="trend-section">
        <div className="trend-section-heading"><strong>Inzu community</strong><small>Last 7 days</small></div>
        {topicsLoading && topics.length === 0 && <p className="trend-state">Finding this week’s conversations…</p>}
        {topicsError && topics.length === 0 && <p className="trend-state trend-error">{topicsError}</p>}
        {topicsError && topics.length > 0 && <p className="trend-state trend-error">{topicsError}. Showing the last loaded counts.</p>}
        {!topicsLoading && !topicsError && topics.length === 0 && <p className="trend-state">No hashtags are trending yet. Add a #tag to a moment to get things started.</p>}
        {topics.map((topic, index) => (
          <button className="trend-row" key={topic.tag} onClick={() => onSelectTag(topic.tag)}>
            <span className="trend-number">{String(index + 1).padStart(2, '0')}</span>
            <span><strong>{topic.tag}</strong><small>{topic.moments.toLocaleString()} {topic.moments === 1 ? 'moment' : 'moments'} this week</small></span>
            <ArrowRight size={14} />
          </button>
        ))}
      </div>
      <div className="trend-section news-section">
        <div className="trend-section-heading"><strong>Rwanda news</strong>{news && (news.sources?.length
          ? <span className="news-source-links">{news.sources.map((source) => <a key={source.name} href={source.url} target="_blank" rel="noreferrer">{source.name}</a>)}</span>
          : <a href={news.sourceUrl} target="_blank" rel="noreferrer">{news.source}</a>)}</div>
        {newsLoading && !news && <p className="trend-state">Loading the latest headlines…</p>}
        {newsError && !news && <p className="trend-state trend-error">{newsError}</p>}
        {news?.items.map((item) => (
          <a className="news-item" key={item.url} href={item.url} target="_blank" rel="noreferrer">
            <strong>{item.title}</strong>
            <small>{item.source ? `${item.source} · ` : ''}{Number.isNaN(Date.parse(item.publishedAt)) ? 'Latest report' : timeAgo(item.publishedAt)} <ArrowUpRight size={11} /></small>
          </a>
        ))}
        {news && news.items.length === 0 && <p className="trend-state">No recent headlines are available from {news.source}.</p>}
        {!newsLoading && newsError && news && <p className="trend-state trend-error">{newsError}</p>}
      </div>
      <div className="trend-foot"><span>Headlines via IGIHE &amp; Kigali Today</span><span>·</span><span>Community counts are live</span></div>
    </section>
  )
}

const translations: Record<Language, Record<string, string>> = {
  en: { home: 'Home', explore: 'Explore', messages: 'Messages', saved: 'Saved', settings: 'Settings', search: 'Search people, posts...', stories: 'Your circles', feed: 'Your feed', forYou: 'For you', following: 'Following', createPost: 'What’s happening in your world?', share: 'Share post', suggestions: 'People you may know', seeAll: 'See all', online: 'Online', trending: 'Trending in Rwanda', welcome: 'Welcome back', signIn: 'Sign in', signUp: 'Create account', register: 'Join your community', email: 'Email address', password: 'Password', fullName: 'Your name', newPost: 'Share a little moment', profile: 'Profile', appearance: 'Appearance', language: 'Language', wallpaper: 'Chat wallpaper', send: 'Send a message...', logout: 'Sign out', addStatus: 'Add status', yourStatus: 'Your status' },
  rw: { home: 'Ahabanza', explore: 'Shakisha', messages: 'Ubutumwa', saved: 'Byabitswe', settings: 'Igenamiterere', search: 'Shakisha abantu n’inyandiko...', stories: 'Inshuti zawe', feed: 'Amakuru yawe', forYou: 'Ibyo ukunda', following: 'Ukuri gukurikira', createPost: 'Ni ibiki bishya mu buzima bwawe?', share: 'Sangiza', suggestions: 'Abantu ushobora kumenya', seeAll: 'Reba byose', online: 'Ari kuri murandasi', trending: 'Ibikunzwe mu Rwanda', welcome: 'Wongeye kugaruka', signIn: 'Injira', signUp: 'Fungura konti', register: 'Injira mu muryango wawe', email: 'Imeyili', password: 'Ijambo ry’ibanga', fullName: 'Amazina yawe', newPost: 'Sangiza abandi ibyiza', profile: 'Umwirondoro', appearance: 'Imigaragarire', language: 'Ururimi', wallpaper: 'Ishusho y’ubutumwa', send: 'Andika ubutumwa...', logout: 'Sohoka', addStatus: 'Ongeraho sitatusi', yourStatus: 'Sitatusi yawe' },
  fr: { home: 'Accueil', explore: 'Découvrir', messages: 'Messages', saved: 'Enregistrés', settings: 'Paramètres', search: 'Rechercher des personnes...', stories: 'Vos cercles', feed: 'Votre fil', forYou: 'Pour vous', following: 'Abonnements', createPost: 'Quoi de neuf dans votre monde ?', share: 'Partager', suggestions: 'Suggestions', seeAll: 'Tout voir', online: 'En ligne', trending: 'Tendances au Rwanda', welcome: 'Bon retour', signIn: 'Connexion', signUp: 'Créer un compte', register: 'Rejoignez votre communauté', email: 'Adresse e-mail', password: 'Mot de passe', fullName: 'Votre nom', newPost: 'Partager un moment', profile: 'Profil', appearance: 'Apparence', language: 'Langue', wallpaper: 'Fond de discussion', send: 'Écrire un message...', logout: 'Déconnexion', addStatus: 'Ajouter un statut', yourStatus: 'Votre statut' },
  sw: { home: 'Nyumbani', explore: 'Gundua', messages: 'Ujumbe', saved: 'Zilizohifadhiwa', settings: 'Mipangilio', search: 'Tafuta watu na machapisho...', stories: 'Marafiki wako', feed: 'Habari zako', forYou: 'Kwa ajili yako', following: 'Unaowafuata', createPost: 'Kuna nini kipya kwako?', share: 'Shiriki', suggestions: 'Unaweza kuwajua', seeAll: 'Tazama zote', online: 'Yuko mtandaoni', trending: 'Maarufu Rwanda', welcome: 'Karibu tena', signIn: 'Ingia', signUp: 'Fungua akaunti', register: 'Jiunge na jumuiya yako', email: 'Barua pepe', password: 'Nenosiri', fullName: 'Jina lako', newPost: 'Shiriki wakati mzuri', profile: 'Wasifu', appearance: 'Muonekano', language: 'Lugha', wallpaper: 'Mandhari ya mazungumzo', send: 'Andika ujumbe...', logout: 'Toka', addStatus: 'Ongeza hali', yourStatus: 'Hali yako' },
}

const statusTranslations: Record<Language, {
  heading: string
  visibility: string
  placeholder: string
  addPhoto: string
  changePhoto: string
  publish: string
  publishing: string
  replyPlaceholder: string
  owner: string
}> = {
  en: { heading: 'Share a status', visibility: 'Your followers can see and reply', placeholder: 'What would you like your followers to know?', addPhoto: 'Add a photo', changePhoto: 'Change photo', publish: 'Share status', publishing: 'Sharing…', replyPlaceholder: 'Reply directly to this status…', owner: 'Your status' },
  rw: { heading: 'Sangiza sitatusi', visibility: 'Abagukurikira barayibona kandi bakagusubiza', placeholder: 'Ni iki wifuza ko abagukurikira bamenya?', addPhoto: 'Ongeraho ifoto', changePhoto: 'Hindura ifoto', publish: 'Sangiza sitatusi', publishing: 'Birimo gusangizwa…', replyPlaceholder: 'Subiza kuri iyi sitatusi…', owner: 'Sitatusi yawe' },
  fr: { heading: 'Partager un statut', visibility: 'Vos abonnés peuvent le voir et répondre', placeholder: 'Que souhaitez-vous partager avec vos abonnés ?', addPhoto: 'Ajouter une photo', changePhoto: 'Changer la photo', publish: 'Partager le statut', publishing: 'Publication…', replyPlaceholder: 'Répondre directement à ce statut…', owner: 'Votre statut' },
  sw: { heading: 'Shiriki hali', visibility: 'Wafuasi wako wanaweza kuona na kujibu', placeholder: 'Ungependa wafuasi wako wajue nini?', addPhoto: 'Ongeza picha', changePhoto: 'Badilisha picha', publish: 'Shiriki hali', publishing: 'Inashirikiwa…', replyPlaceholder: 'Jibu hali hii moja kwa moja…', owner: 'Hali yako' },
}

const keyFor = (key: string) => `netlive.${key}`
function useStoredState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(keyFor(key))
      return saved ? JSON.parse(saved) as T : initial
    } catch {
      return initial
    }
  })
  useEffect(() => { localStorage.setItem(keyFor(key), JSON.stringify(value)) }, [key, value])
  return [value, setValue] as const
}
const toUser = (profile: Profile): User => ({
  id: profile.id,
  name: profile.full_name,
  handle: profile.username,
  city: profile.city,
  bio: profile.bio,
  avatar: profile.avatar_url ?? fallbackAvatar(profile.full_name.length),
  online: false,
})

const toAccount = (profile: Profile, email: string): Account => ({
  id: profile.id,
  name: profile.full_name,
  email,
  handle: profile.username,
  city: profile.city,
  bio: profile.bio,
  avatar: profile.avatar_url ?? fallbackAvatar(profile.full_name.length),
})

const toMessage = (message: ChatMessage): Message => ({
  id: message.id,
  from: message.sender_id,
  text: message.content,
  time: new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  attachment: message.attachment_name ?? undefined,
  editedAt: message.edited_at ?? undefined,
  readAt: message.read_at ?? undefined,
  statusId: message.status_id ?? undefined,
  statusReplyContent: message.status_reply_content ?? undefined,
})

type RouteSection = 'home' | 'explore' | 'messages' | 'news' | 'books' | 'marketplace'

function RouteFrame({
  children, section, me, theme, darkMode, query, onQueryChange, onNavigate, onSettings, onEditProfile, onSignOut,
}: {
  children: ReactNode
  section: RouteSection
  me: User
  theme: string
  darkMode: boolean
  query: string
  onQueryChange: (value: string) => void
  onNavigate: (section: RouteSection) => void
  onSettings: () => void
  onEditProfile: () => void
  onSignOut: () => void
}) {
  return (
    <div className={`app-shell theme-${theme} ${darkMode ? 'dark-mode' : ''}`}>
      <aside className="sidebar">
        <button className="brand-lockup" onClick={() => onNavigate('home')} aria-label="Inzu home">
          <span className="brand-mark">i</span>
          <span>inzu<span className="brand-period">.</span><small>YOUR WORLD, TOGETHER</small></span>
        </button>
        <div className="profile-switcher"><img src={me.avatar} alt="" /><span className="profile-switch-copy"><strong>{me.name}</strong><small>@{me.handle}</small></span></div>
        <div className="side-label">YOUR SPACE</div>
        <nav className="main-nav">
          <button className={section === 'home' ? 'active' : ''} onClick={() => onNavigate('home')}><Compass size={18} /><span>{translations.en.home}</span></button>
          <button className={section === 'explore' ? 'active' : ''} onClick={() => onNavigate('explore')}><Sparkles size={18} /><span>{translations.en.explore}</span></button>
          <button className={section === 'news' ? 'active' : ''} onClick={() => onNavigate('news')}><Newspaper size={18} /><span>News &amp; video</span></button>
          <button className={section === 'marketplace' ? 'active' : ''} onClick={() => onNavigate('marketplace')}><Store size={18} /><span>Marketplace</span></button>
          <button className={section === 'books' ? 'active' : ''} onClick={() => onNavigate('books')}><Library size={18} /><span>Read books</span></button>
          <button className={section === 'messages' ? 'active' : ''} onClick={() => onNavigate('messages')}><MessageCircle size={18} /><span>{translations.en.messages}</span></button>
        </nav>
        <div className="sidebar-bottom">
          <button className="side-settings" onClick={onEditProfile}><PenLine size={17} />Edit profile</button>
          <button className="side-settings" onClick={onSettings}><Settings size={17} />Settings</button>
          <button className="side-settings sign-out" onClick={onSignOut}><LogOut size={17} />Sign out</button>
        </div>
      </aside>
      <main className="main-column">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark">i</span> inzu</div>
          <div className="search-box"><Search size={17} /><input aria-label="Search members" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search people..." />{query && <button aria-label="Clear search" onClick={() => onQueryChange('')}><X size={15} /></button>}</div>
          <div className="topbar-actions"><span className="route-user-name">{me.name}</span><button className="top-avatar" onClick={onEditProfile}><img src={me.avatar} alt={me.name} /></button></div>
        </header>
        {children}
      </main>
      <nav className="mobile-nav">
        <button className={section === 'home' ? 'active' : ''} onClick={() => onNavigate('home')}><Compass size={20} /><span>Home</span></button>
        <button className={section === 'explore' ? 'active' : ''} onClick={() => onNavigate('explore')}><Sparkles size={20} /><span>Explore</span></button>
        <button className={section === 'news' ? 'active' : ''} onClick={() => onNavigate('news')}><Newspaper size={20} /><span>News</span></button>
        <button className={section === 'marketplace' ? 'active' : ''} onClick={() => onNavigate('marketplace')}><Store size={20} /><span>Market</span></button>
        <button className={section === 'books' ? 'active' : ''} onClick={() => onNavigate('books')}><Library size={20} /><span>Books</span></button>
        <button className={section === 'messages' ? 'active' : ''} onClick={() => onNavigate('messages')}><MessageCircle size={20} /><span>Chat</span></button>
        <button onClick={onSignOut}><LogOut size={20} /><span>Sign out</span></button>
      </nav>
    </div>
  )
}

function DiscoverRoute({
  me, people, follows, theme, darkMode, query, onQueryChange, onFollow, onChat, onOpenProfile, ...frameProps
}: {
  me: User
  people: User[]
  follows: string[]
  theme: string
  darkMode: boolean
  query: string
  onQueryChange: (value: string) => void
  onFollow: (id: string) => void
  onChat: (id: string) => void
  onOpenProfile: (id: string) => void
} & Omit<ComponentProps<typeof RouteFrame>, 'children' | 'section' | 'me' | 'theme' | 'query' | 'onQueryChange'>) {
  const visiblePeople = people.filter((person) => `${person.name} ${person.handle} ${person.city}`.toLowerCase().includes(query.toLowerCase()))
  return (
    <RouteFrame {...frameProps} me={me} theme={theme} darkMode={darkMode} query={query} onQueryChange={onQueryChange} section="explore">
      <section className="directory-page">
        <div className="directory-intro">
          <span className="eyebrow">YOUR NEXT FRIEND COULD BE RIGHT HERE</span>
          <h1>Find your people.</h1>
          <p>Meet members of the Inzu community, follow the ones you like, and start a conversation whenever you’re ready.</p>
        </div>
        <div className="directory-results-heading"><strong>Community members</strong><span>{visiblePeople.length} {visiblePeople.length === 1 ? 'person' : 'people'}</span></div>
        {visiblePeople.length > 0
          ? <div className="directory-grid">{visiblePeople.map((person) => {
            const following = follows.includes(person.id)
            return (
              <article className="directory-card" key={person.id}>
                <button className="directory-avatar-button" onClick={() => onOpenProfile(person.id)} aria-label={`Open ${person.name}'s profile`}><img className="directory-avatar" src={person.avatar} alt="" /></button>
                <h2><button className="directory-profile-name" onClick={() => onOpenProfile(person.id)}>{person.name}</button></h2>
                <span className="directory-handle">@{person.handle}</span>
                <span className="directory-city">{person.city}</span>
                <p>{person.bio || 'A new member of your community.'}</p>
                <div className="directory-actions">
                  <button className={`primary-button ${following ? 'followed-button' : ''}`} onClick={() => onFollow(person.id)}>{following ? <Check size={15} /> : <UserPlus size={15} />}{following ? 'Following' : 'Follow'}</button>
                  <button className="outline-button" onClick={() => onChat(person.id)}><MessageCircle size={15} /> Message</button>
                </div>
              </article>
            )
          })}</div>
          : <div className="directory-empty"><Users size={24} /><strong>{query ? 'No one found with that search.' : 'You’re the first one here.'}</strong><p>{query ? 'Try searching by a different name or city.' : 'Invite a friend to join your community.'}</p></div>}
      </section>
    </RouteFrame>
  )
}

function MessagesRoute({
  me, people, conversations, selectedChat, query, draft, recording, wallpaper, theme, darkMode,
  peerTyping, onQueryChange, onSelect, onDraftChange, onSend, onAttach, onRecord, onVoiceCall, onVideoCall, onGroupCall, onAIDraft, onEditMessage, onTyping, onOpenPost, onOpenProfile, onNavigate,
  ...frameProps
}: {
  me: User
  people: User[]
  conversations: Conversation[]
  selectedChat: string
  query: string
  draft: string
  recording: boolean
  wallpaper: string
  theme: string
  darkMode: boolean
  peerTyping: boolean
  onQueryChange: (value: string) => void
  onSelect: (id: string) => void
  onDraftChange: (value: string) => void
  onSend: (text: string, attachment?: string) => void
  onAttach: (file: File) => void
  onRecord: () => void
  onVoiceCall: () => void
  onVideoCall: () => void
  onGroupCall: (peerIds: string[], mode: CallMode) => void
  onAIDraft: (contactName: string, messages: AiChatMessage[]) => Promise<string>
  onEditMessage: (id: string, content: string) => Promise<void>
  onTyping: (typing: boolean) => void
  onOpenPost: (id: string) => void
  onOpenProfile: (id: string) => void
  onNavigate: (section: RouteSection) => void
} & Omit<ComponentProps<typeof RouteFrame>, 'children' | 'section' | 'me' | 'theme' | 'query' | 'onQueryChange' | 'onNavigate'>) {
  const sortedPeople = [...people].sort((first, second) =>
    Number(conversations.some((conversation) => conversation.userId === second.id)) -
    Number(conversations.some((conversation) => conversation.userId === first.id)),
  )
  const matchingPeople = sortedPeople.filter((person) => `${person.name} ${person.handle}`.toLowerCase().includes(query.toLowerCase()))
  const selectedPerson = matchingPeople.find((person) => person.id === selectedChat) ?? people.find((person) => person.id === selectedChat)
  const conversation = conversations.find((item) => item.userId === selectedChat)
  const messages = conversation?.messages ?? []
  const fileInput = useRef<HTMLInputElement>(null)
  const [aiDraftLoading, setAIDraftLoading] = useState(false)
  const [aiDraftError, setAIDraftError] = useState('')
  const [groupCallOpen, setGroupCallOpen] = useState(false)
  const [groupCallMode, setGroupCallMode] = useState<CallMode>('video')
  const [groupCallPeerIds, setGroupCallPeerIds] = useState<string[]>([])
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingMessageText, setEditingMessageText] = useState('')
  const [messageEditSaving, setMessageEditSaving] = useState(false)
  const [messageEditError, setMessageEditError] = useState('')

  function toggleGroupCallPeer(peerId: string) {
    setGroupCallPeerIds((current) => current.includes(peerId)
      ? current.filter((id) => id !== peerId)
      : current.length < 7 ? [...current, peerId] : current)
  }

  function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onTyping(false)
    onSend(draft)
  }

  async function saveMessageEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingMessageId || !editingMessageText.trim() || messageEditSaving) return
    setMessageEditSaving(true)
    setMessageEditError('')
    try {
      await onEditMessage(editingMessageId, editingMessageText.trim())
      setEditingMessageId(null)
      setEditingMessageText('')
    } catch (error) {
      setMessageEditError(error instanceof Error ? error.message : 'Could not edit this message.')
    } finally {
      setMessageEditSaving(false)
    }
  }

  async function suggestReply() {
    if (!selectedPerson) return
    setAIDraftLoading(true)
    setAIDraftError('')
    try {
      const recentMessages = messages.slice(-8).map((message) => ({
        sender: message.from === me.id ? 'you' as const : 'them' as const,
        text: message.text.slice(0, 900),
      }))
      onDraftChange(await onAIDraft(selectedPerson.name, recentMessages))
    } catch (error) {
      setAIDraftError(error instanceof Error ? error.message : 'Could not generate an AI reply.')
    } finally {
      setAIDraftLoading(false)
    }
  }

  return (
    <RouteFrame {...frameProps} me={me} theme={theme} darkMode={darkMode} query={query} onQueryChange={onQueryChange} onNavigate={onNavigate} section="messages">
      <section className="messages-view">
        <div className="messages-list">
          <div className="view-heading"><div><span className="eyebrow">YOUR LITTLE CORNER</span><h1>Messages</h1></div><div className="messages-heading-actions"><button className="soft-icon" onClick={() => { setGroupCallPeerIds([]); setGroupCallOpen(true) }} title="Start group call" aria-label="Start group call"><Users size={17} /></button><button className="soft-icon" onClick={() => onNavigate('explore')} title="Discover people"><UserPlus size={17} /></button></div></div>
          <div className="chat-search"><Search size={16} /><input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Find a friend..." /></div>
          {matchingPeople.map((person) => {
            const latest = conversations.find((item) => item.userId === person.id)?.messages.at(-1)
            return (
              <button key={person.id} className={`conversation-row ${selectedChat === person.id ? 'selected' : ''}`} onClick={() => onSelect(person.id)}>
                <span className="avatar-wrap"><img src={person.avatar} alt="" /></span>
                <span className="conversation-info"><strong>{person.name}<time>{latest?.time ?? 'New'}</time></strong><small>{latest?.text || 'Say hello and start a conversation'}{latest?.attachment && <span className="attachment-label"> · {latest.attachment}</span>}</small></span>
              </button>
            )
          })}
          {matchingPeople.length === 0 && <div className="directory-empty"><Users size={21} /><strong>No friends found</strong><button onClick={() => onNavigate('explore')}>Discover people</button></div>}
        </div>
        <div className={`chat-panel ${selectedPerson ? 'chat-open' : ''} ${wallpaper === 'none' ? '' : `wall-${wallpaper}`}`}>
          {selectedPerson
            ? <>
              <div className="chat-header"><button className="back-button" onClick={() => onNavigate('explore')} aria-label="Back to Discover"><ArrowLeft size={18} /></button><button className="chat-contact" onClick={() => onOpenProfile(selectedPerson.id)} aria-label={`Open ${selectedPerson.name}'s profile`}><span className="avatar-wrap"><img src={selectedPerson.avatar} alt="" /></span><span><strong>{selectedPerson.name}</strong><small>{peerTyping ? <><i className="typing-pulse" />Typing…</> : selectedPerson.city}</small></span></button><div className="chat-actions"><button className="soft-icon" title="Voice call" aria-label="Start voice call" onClick={onVoiceCall}><Phone size={16} /></button><button className="soft-icon" title="Video call" aria-label="Start video call" onClick={onVideoCall}><Video size={17} /></button></div></div>
              <div className="chat-day"><span>YOUR CONVERSATION</span></div>
              <div className="message-list">
                {messages.length === 0 && <div className="conversation-start"><span>👋</span><strong>Say hello to {selectedPerson.name.split(' ')[0]}</strong><small>Send a message to start your conversation.</small><button onClick={() => onDraftChange(`Hi ${selectedPerson.name.split(' ')[0]}! `)}>Write a hello</button></div>}
                {messages.map((message) => <div key={message.id} className={`message-row ${message.from === me.id ? 'mine' : ''}`}>{message.from !== me.id && <img className="message-avatar" src={selectedPerson.avatar} alt="" />}<div className="message-content">{editingMessageId === message.id
                  ? <form className="message-edit-form" onSubmit={(event) => { void saveMessageEdit(event) }}><textarea value={editingMessageText} onChange={(event) => setEditingMessageText(event.target.value)} aria-label="Edit message" autoFocus /><div><button type="button" onClick={() => { setEditingMessageId(null); setEditingMessageText(''); setMessageEditError('') }}>Cancel</button><button type="submit" disabled={!editingMessageText.trim() || messageEditSaving}>{messageEditSaving ? 'Saving…' : 'Save'}</button></div>{messageEditError && <p role="alert">{messageEditError}</p>}</form>
                  : <div className="message-bubble">{message.text && <MessageBody text={message.text} onOpenPost={onOpenPost} />}{message.attachment && <div className="message-attachment"><AudioLines size={17} /><span>{message.attachment}</span></div>}</div>}<small className="message-time">{message.editedAt && <span>Edited</span>}{message.time}{message.from === me.id && <>{message.readAt ? <span className="message-seen">Seen</span> : <CheckCheck size={14} />}{Boolean(message.text) && editingMessageId !== message.id && <button className="message-edit-button" onClick={() => { setEditingMessageId(message.id); setEditingMessageText(message.text); setMessageEditError('') }} aria-label="Edit message"><PenLine size={12} /></button>}</>}</small></div></div>)}
                {peerTyping && <div className="typing-indicator" aria-live="polite"><span /><span /><span />{selectedPerson.name.split(' ')[0]} is typing</div>}
              </div>
              <form className="chat-composer" onSubmit={submitMessage}>
                <div className="composer-tools"><input ref={fileInput} type="file" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onAttach(file); event.target.value = '' }} /><button type="button" className="soft-icon" title="Attach a file" onClick={() => fileInput.current?.click()}><Paperclip size={17} /></button><button type="button" className={`soft-icon ${recording ? 'recording' : ''}`} title={recording ? 'Stop voice note' : 'Record a voice note'} onClick={onRecord}>{recording ? <MicOff size={17} /> : <Mic size={17} />}</button><button type="button" className="soft-icon" title="Add a smile" onClick={() => onDraftChange(`${draft}😊`)}><Smile size={17} /></button><button type="button" className={`soft-icon ai-draft-button ${aiDraftLoading ? 'working' : ''}`} title="Draft a reply with AI" aria-label="Draft a reply with AI" disabled={aiDraftLoading} onClick={() => { void suggestReply() }}><Sparkles size={16} /></button></div>
                <input value={draft} onChange={(event) => { onDraftChange(event.target.value); onTyping(Boolean(event.target.value.trim())) }} placeholder={recording ? 'Recording… tap the microphone when you’re done' : 'Write a message...'} aria-label="Write a message" />
                <button className="send-button" type="submit" disabled={!draft.trim()} aria-label="Send message"><Send size={17} /></button>
              </form>
              <p className={`ai-draft-note ${aiDraftError ? 'has-error' : ''}`} role={aiDraftError ? 'alert' : undefined}>{aiDraftError || (aiDraftLoading ? 'Drafting a reply…' : 'AI suggestions are drafts only; review before sending.')}</p>
            </>
            : <div className="chat-blank"><MessageCircle size={29} /><strong>Your next conversation starts here.</strong><p>Choose someone from your community, or discover a new friend.</p><button className="primary-button" onClick={() => onNavigate('explore')}><Sparkles size={15} /> Discover people</button></div>}
        </div>
      </section>
      {groupCallOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setGroupCallOpen(false) }}>
        <section className="modal-card group-call-modal" role="dialog" aria-modal="true" aria-labelledby="group-call-title">
          <div className="modal-heading"><div><span className="eyebrow">GATHER YOUR PEOPLE</span><h2 id="group-call-title">Start a group call</h2></div><button className="soft-icon" onClick={() => setGroupCallOpen(false)} aria-label="Close"><X size={19} /></button></div>
          <p className="group-call-description">Invite 1–7 people. Everyone will be asked to join before audio and video connect.</p>
          <div className="group-call-mode">
            <button className={groupCallMode === 'video' ? 'active' : ''} onClick={() => setGroupCallMode('video')}><Video size={16} /> Video</button>
            <button className={groupCallMode === 'voice' ? 'active' : ''} onClick={() => setGroupCallMode('voice')}><Phone size={15} /> Voice</button>
          </div>
          <div className="group-call-people">{people.map((person) => <label key={person.id} className={groupCallPeerIds.includes(person.id) ? 'selected' : ''}>
            <img src={person.avatar} alt="" />
            <span><strong>{person.name}</strong><small>{person.city}</small></span>
            <input type="checkbox" checked={groupCallPeerIds.includes(person.id)} disabled={!groupCallPeerIds.includes(person.id) && groupCallPeerIds.length >= 7} onChange={() => toggleGroupCallPeer(person.id)} />
          </label>)}</div>
          <div className="group-call-footer"><span>{groupCallPeerIds.length}/7 selected</span><button className="primary-button" disabled={groupCallPeerIds.length === 0} onClick={() => { onGroupCall(groupCallPeerIds, groupCallMode); setGroupCallOpen(false) }}><Phone size={15} /> Start group {groupCallMode} call</button></div>
        </section>
      </div>}
    </RouteFrame>
  )
}

function PostCard({
  post, author, focused, isMine, commentsOpen, comments, commentDraft, commentLoading,
  onOpenAuthor, onLike, onToggleComments, onCommentDraftChange, onComment, onRepost, onShare, onSave,
  onOpenPost, onEdit, onDelete,
}: {
  post: Post
  author: User
  focused: boolean
  isMine: boolean
  commentsOpen: boolean
  comments: PostComment[]
  commentDraft: string
  commentLoading: boolean
  onOpenAuthor: () => void
  onLike: () => void
  onToggleComments: () => void
  onCommentDraftChange: (value: string) => void
  onComment: (event: FormEvent<HTMLFormElement>) => void
  onRepost: () => void
  onShare: () => void
  onSave: () => void
  onOpenPost: (id: string) => void
  onEdit: () => void
  onDelete: () => void
}) {
  const cardRef = useRef<HTMLElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const sharedPost = post.text.match(/https?:\/\/\S+[?&]post=([0-9a-f-]{36})/i)
  const content = sharedPost ? post.text.slice(0, sharedPost.index).trim() : post.text

  return (
    <article className={`post-card ${focused ? 'focused-post' : ''}`} id={`post-${post.id}`} ref={cardRef}>
      <div className="post-head">
        <button className="post-author" onClick={onOpenAuthor}>
          <span className="avatar-wrap"><img src={author.avatar} alt="" />{author.online && <i />}</span>
          <span><strong>{author.name}<span className="verified-mark">✓</span></strong><small>@{author.handle} <span>·</span> {post.time}</small></span>
        </button>
        <div className="post-menu-wrap">
          <button className="post-more" aria-label={isMine ? 'Post options' : 'Open this post'} aria-expanded={isMine ? menuOpen : undefined} onClick={() => isMine ? setMenuOpen((open) => !open) : onOpenPost(post.id)}><MoreHorizontal size={21} /></button>
          {isMine && menuOpen && <div className="post-owner-menu">
            <button onClick={() => { setMenuOpen(false); onEdit() }}><PenLine size={14} /> Edit moment</button>
            <button className="delete-post-action" onClick={() => { setMenuOpen(false); onDelete() }}><Trash2 size={14} /> Delete moment</button>
          </div>}
        </div>
      </div>
      {content && <p className="post-text">{content}</p>}
      {sharedPost && <button className="shared-post-link" onClick={() => onOpenPost(sharedPost[1])}><Link2 size={15} /> View shared moment <ArrowRight size={14} /></button>}
      {post.video
        ? <video className="post-video" src={post.video} controls playsInline preload="metadata" aria-label="Community video" />
        : post.image && <img className="post-image" src={post.image} alt="A moment shared with the community" />}
      <div className="post-reactions">
        <span className="reaction-stack"><i><Heart size={10} fill="currentColor" /></i><i><ThumbsUp size={10} fill="currentColor" /></i></span>
        <span>{post.likes} kind hearts</span><span className="post-repost-count">{post.reposts} reposts</span>
        <button onClick={onToggleComments}>{post.comments} {post.comments === 1 ? 'reply' : 'replies'}</button>
      </div>
      <div className="post-actions">
        <button className={post.liked ? 'is-liked' : ''} onClick={onLike}><Heart size={17} fill={post.liked ? 'currentColor' : 'none'} /> <span>Like</span></button>
        <button className={commentsOpen ? 'is-saved' : ''} onClick={onToggleComments}><MessageCircle size={17} /> <span>Comment</span></button>
        <button className={post.reposted ? 'is-reposted' : ''} onClick={onRepost}><Repeat2 size={17} /> <span>{post.reposted ? 'Reposted' : 'Repost'}</span></button>
        <button onClick={onShare}><Share2 size={17} /> <span>Share</span></button>
        <button onClick={onSave} className={post.saved ? 'is-saved' : ''}><Bookmark size={17} fill={post.saved ? 'currentColor' : 'none'} /> <span>{post.saved ? 'Saved' : 'Save'}</span></button>
      </div>
      {commentsOpen && (
        <section className="post-comments" aria-label="Comments">
          {commentLoading && comments.length === 0 && <p className="comments-empty">Loading comments…</p>}
          {!commentLoading && comments.length === 0 && <p className="comments-empty">No comments yet. Start the conversation.</p>}
          {comments.map((comment) => (
            <div className="post-comment" key={comment.id}>
              <img src={comment.author.avatar_url || fallbackAvatar(comment.author.full_name.length)} alt="" />
              <div><strong>{comment.author.full_name}</strong><p>{comment.content}</p><small>{timeAgo(comment.created_at)}</small></div>
            </div>
          ))}
          <form className="post-comment-form" onSubmit={onComment}>
            <input value={commentDraft} maxLength={2000} onChange={(event) => onCommentDraftChange(event.target.value)} placeholder="Write a kind comment…" aria-label="Write a comment" />
            <button type="submit" disabled={!commentDraft.trim()}>Send</button>
          </form>
        </section>
      )}
    </article>
  )
}

function NewsVideoRoute({
  me, people, posts, news, newsLoading, newsError, query, theme, darkMode, onRefreshNews,
  commentsOpenId, commentsByPost, commentDraft, commentLoadingId, onQueryChange,
  onLike, onToggleComments, onCommentDraftChange, onComment, onRepost, onShare, onSave,
  onEdit, onDelete, onOpenPost, onOpenProfile, onNavigate, ...frameProps
}: {
  me: User
  people: User[]
  posts: Post[]
  news: RwandaNews | null
  newsLoading: boolean
  newsError: string
  query: string
  theme: string
  darkMode: boolean
  onRefreshNews: () => void
  commentsOpenId: string | null
  commentsByPost: Record<string, PostComment[]>
  commentDraft: string
  commentLoadingId: string | null
  onQueryChange: (value: string) => void
  onLike: (postId: string) => void
  onToggleComments: (postId: string) => void
  onCommentDraftChange: (value: string) => void
  onComment: (postId: string, event: FormEvent<HTMLFormElement>) => void
  onRepost: (postId: string) => void
  onShare: (postId: string) => void
  onSave: (postId: string) => void
  onEdit: (post: Post) => void
  onDelete: (postId: string) => void
  onOpenPost: (postId: string) => void
  onOpenProfile: (profileId: string) => void
  onNavigate: (section: RouteSection) => void
} & Omit<ComponentProps<typeof RouteFrame>, 'children' | 'section' | 'me' | 'theme' | 'query' | 'onQueryChange' | 'onNavigate'>) {
  const [view, setView] = useState<'news' | 'video'>('news')
  const videos = posts.filter((post) => post.video && `${post.text} ${people.find((person) => person.id === post.userId)?.name ?? me.name}`.toLowerCase().includes(query.toLowerCase()))
  const headlines = news?.items.filter((item) => item.title.toLowerCase().includes(query.toLowerCase())) ?? []
  const authorFor = (post: Post) => post.userId === me.id ? me : people.find((person) => person.id === post.userId) ?? me

  return (
    <RouteFrame {...frameProps} me={me} theme={theme} darkMode={darkMode} query={query} onQueryChange={onQueryChange} onNavigate={onNavigate} section="news">
      <section className="news-video-page">
        <div className="news-video-hero">
          <span className="news-video-icon"><Newspaper size={20} /></span>
          <span className="eyebrow">RWANDA, THROUGH YOUR EYES</span>
          <h1>News &amp; video</h1>
          <p>Catch up on Rwanda’s latest headlines, then watch and share moments from your community.</p>
        </div>
        <div className="news-video-tabs" role="tablist" aria-label="News and videos">
          <button role="tab" aria-selected={view === 'news'} className={view === 'news' ? 'active' : ''} onClick={() => setView('news')}><Newspaper size={16} /> News</button>
          <button role="tab" aria-selected={view === 'video'} className={view === 'video' ? 'active' : ''} onClick={() => setView('video')}><Film size={16} /> Videos <span>{videos.length}</span></button>
        </div>
        {view === 'news' ? (
          <section className="news-feed" aria-label="Rwanda news headlines">
            <div className="news-feed-heading"><div><span className="eyebrow">THE LATEST · {news?.items.length ?? 0} STORIES</span><h2>Rwanda headlines</h2></div><div className="news-feed-actions">{news?.sources?.map((source) => <a key={source.name} href={source.url} target="_blank" rel="noreferrer">{source.name} <ArrowUpRight size={13} /></a>)}{news && !news.sources?.length && <a href={news.sourceUrl} target="_blank" rel="noreferrer">Via {news.source} <ArrowUpRight size={13} /></a>}<button type="button" onClick={onRefreshNews} disabled={newsLoading} aria-label="Refresh Rwanda headlines"><RefreshCw size={15} />{newsLoading ? 'Refreshing…' : 'Refresh'}</button></div></div>
            {newsLoading && !news && <div className="news-feed-empty"><Newspaper size={23} /><strong>Finding the latest headlines…</strong></div>}
            {newsError && !news && <div className="news-feed-empty news-feed-error"><strong>Headlines are unavailable right now</strong><p>{newsError}</p></div>}
            {news?.warnings && news.warnings.length > 0 && <p className="news-source-warning">Some publishers could not be reached: {news.warnings.join(' ')}</p>}
            {!newsLoading && news && headlines.length === 0 && <div className="news-feed-empty"><strong>{query ? 'No headlines match your search.' : 'No recent headlines are available.'}</strong></div>}
            {headlines.map((item) => (
              <a className="news-feed-item" key={item.url} href={item.url} target="_blank" rel="noreferrer">
                <span className="news-feed-item-thumb">
                  <Newspaper size={17} />
                  {item.imageUrl && <img src={item.imageUrl} alt="" loading="lazy" onError={(event) => event.currentTarget.remove()} />}
                </span>
                <span className="news-feed-item-copy"><strong>{item.title}</strong><small>{item.source ?? news?.source} <span>·</span> {Number.isNaN(Date.parse(item.publishedAt)) ? 'Latest report' : timeAgo(item.publishedAt)}</small></span>
                <ArrowUpRight size={16} />
              </a>
            ))}
          </section>
        ) : (
          <section className="video-feed" aria-label="Community videos">
            {videos.length === 0
              ? <div className="news-feed-empty"><Film size={25} /><strong>{query ? 'No videos match your search.' : 'No community videos yet.'}</strong><p>Share a video moment from Home and it will appear here for everyone to watch and like.</p><button className="primary-button" onClick={() => onNavigate('home')}><Plus size={15} /> Share a video</button></div>
              : videos.map((post) => {
                const author = authorFor(post)
                return <PostCard
                  key={post.id}
                  post={post}
                  author={author}
                  focused={false}
                  isMine={post.userId === me.id}
                  commentsOpen={commentsOpenId === post.id}
                  comments={commentsByPost[post.id] ?? []}
                  commentDraft={commentDraft}
                  commentLoading={commentLoadingId === post.id}
                  onOpenAuthor={() => onOpenProfile(author.id)}
                  onLike={() => onLike(post.id)}
                  onToggleComments={() => onToggleComments(post.id)}
                  onCommentDraftChange={onCommentDraftChange}
                  onComment={(event) => onComment(post.id, event)}
                  onRepost={() => onRepost(post.id)}
                  onShare={() => onShare(post.id)}
                  onSave={() => onSave(post.id)}
                  onOpenPost={onOpenPost}
                  onEdit={() => onEdit(post)}
                  onDelete={() => onDelete(post.id)}
                />
              })}
          </section>
        )}
      </section>
    </RouteFrame>
  )
}

const marketplaceCategories = [
  'Electronics', 'Fashion', 'Home & living', 'Food & groceries',
  'Vehicles', 'Property', 'Beauty & health', 'Services', 'Other',
]

function MarketplaceRoute({
  me, theme, darkMode, query, onQueryChange, onContact, onNotify, ...frameProps
}: {
  me: User
  theme: string
  darkMode: boolean
  query: string
  onQueryChange: (value: string) => void
  onContact: (sellerId: string) => void
  onNotify: (message: string) => void
} & Omit<ComponentProps<typeof RouteFrame>, 'children' | 'section' | 'me' | 'theme' | 'query' | 'onQueryChange'>) {
  const [listings, setListings] = useState<MarketplaceListing[]>([])
  const [loading, setLoading] = useState(true)
  const [retryCount, setRetryCount] = useState(0)
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('All categories')
  const [mineOnly, setMineOnly] = useState(false)
  const [saving, setSaving] = useState(false)
  const [removingId, setRemovingId] = useState('')
  const [actionError, setActionError] = useState('')
  const [listingType, setListingType] = useState<'product' | 'service'>('product')
  const [productPhoto, setProductPhoto] = useState<File | null>(null)
  const [productPhotoPreview, setProductPhotoPreview] = useState('')
  const [cart, setCart] = useState<Record<string, number>>({})
  const [cartOpen, setCartOpen] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)

  useEffect(() => {
    if (!productPhoto) {
      setProductPhotoPreview('')
      return
    }
    const previewUrl = URL.createObjectURL(productPhoto)
    setProductPhotoPreview(previewUrl)
    return () => URL.revokeObjectURL(previewUrl)
  }, [productPhoto])

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError('')
    void loadMarketplaceListings()
      .then((items) => { if (mounted) setListings(items) })
      .catch((reason: unknown) => {
        if (mounted) setError(explainSupabaseError(reason))
      })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [retryCount])

  useEffect(() => {
    if (loading) return
    setCart((current) => Object.fromEntries(
      Object.entries(current).flatMap(([id, quantity]) => {
        const listing = listings.find((item) => item.id === id && item.listing_type === 'product')
        return listing && quantity > 0 ? [[id, Math.min(quantity, listing.quantity_available)]] : []
      }),
    ))
  }, [loading, listings])

  const filteredListings = listings.filter((listing) => {
    const sellerName = listing.seller?.full_name ?? ''
    const matchesQuery = `${listing.name} ${listing.description} ${listing.category} ${listing.location} ${sellerName}`
      .toLowerCase()
      .includes(query.trim().toLowerCase())
    return matchesQuery
      && (categoryFilter === 'All categories' || listing.category === categoryFilter)
      && (!mineOnly || listing.seller_id === me.id)
  })
  const cartItems = listings.filter((listing) => listing.listing_type === 'product' && (cart[listing.id] ?? 0) > 0)
  const cartCount = cartItems.reduce((total, item) => total + (cart[item.id] ?? 0), 0)
  const cartTotal = cartItems.reduce((total, item) => total + Number(item.price_rwf) * cart[item.id], 0)
  const checkoutGroups = cartItems.reduce<Record<string, MarketplaceListing[]>>((groups, listing) => {
    const paymentGroup = `${listing.seller_id}:${listing.payment_method}:${listing.payment_number}`
    groups[paymentGroup] = [...(groups[paymentGroup] ?? []), listing]
    return groups
  }, {})

  function selectProductPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    event.target.value = ''
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setActionError('Choose a JPG, PNG, or WebP product photo.')
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      setActionError('Product photos must be 8 MB or smaller.')
      return
    }
    setActionError('')
    setProductPhoto(file)
  }

  function addToCart(listing: MarketplaceListing) {
    if (listing.seller_id === me.id) {
      onNotify('You cannot add your own listing to your cart.')
      return
    }
    const quantity = cart[listing.id] ?? 0
    if (quantity >= listing.quantity_available) {
      onNotify(`Only ${listing.quantity_available} available.`)
      return
    }
    setCart((current) => ({ ...current, [listing.id]: Math.min((current[listing.id] ?? 0) + 1, listing.quantity_available) }))
    setCartOpen(true)
    setCheckoutOpen(false)
  }

  function setCartQuantity(listing: MarketplaceListing, quantity: number) {
    setCart((current) => {
      if (quantity <= 0) {
        const next = { ...current }
        delete next[listing.id]
        return next
      }
      return { ...current, [listing.id]: Math.min(quantity, listing.quantity_available) }
    })
  }

  async function publishListing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    const form = new FormData(event.currentTarget)
    const price = Number(form.get('price_rwf'))
    const quantity = listingType === 'product' ? Number(form.get('quantity_available') ?? 1) : 1
    const paymentNumber = String(form.get('payment_number') ?? '').trim()
    if (!Number.isFinite(price) || price <= 0 || price > 9_999_999_999) {
      setActionError('Enter a price between 1 and 9,999,999,999 RWF.')
      return
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999) {
      setActionError('Enter an available quantity between 1 and 9,999.')
      return
    }
    if (!/^[A-Za-z0-9+*#(). -]{3,40}$/.test(paymentNumber)) {
      setActionError('Enter a valid mobile-money code or phone number.')
      return
    }
    const listing: NewMarketplaceListing = {
      seller_id: me.id,
      name: String(form.get('name') ?? '').trim(),
      description: String(form.get('description') ?? '').trim(),
      listing_type: form.get('listing_type') === 'service' ? 'service' : 'product',
      category: String(form.get('category') ?? ''),
      price_rwf: price,
      quantity_available: quantity,
      location: String(form.get('location') ?? '').trim(),
      payment_method: form.get('payment_method') === 'Airtel Money' ? 'Airtel Money' : 'MTN Mobile Money',
      payment_number: paymentNumber,
      image_path: null,
    }
    setSaving(true)
    setActionError('')
    try {
      const published = await createMarketplaceListing(listing, productPhoto ?? undefined)
      setListings((current) => [published, ...current])
      setFormOpen(false)
      setProductPhoto(null)
      setListingType('product')
      onNotify('Your listing is now live in the Marketplace.')
    } catch (reason) {
      setActionError(explainSupabaseError(reason))
    } finally {
      setSaving(false)
    }
  }

  async function removeListing(listing: MarketplaceListing) {
    if (removingId) return
    if (!window.confirm(`Remove “${listing.name}” from the Marketplace?`)) return
    setRemovingId(listing.id)
    setActionError('')
    try {
      await deleteMarketplaceListing(listing.id, me.id)
      setListings((current) => current.filter((item) => item.id !== listing.id))
      setCart((current) => {
        const next = { ...current }
        delete next[listing.id]
        return next
      })
      onNotify('Your listing has been removed.')
    } catch (reason) {
      setActionError(explainSupabaseError(reason))
    } finally {
      setRemovingId('')
    }
  }

  return (
    <RouteFrame {...frameProps} me={me} theme={theme} darkMode={darkMode} query={query} onQueryChange={onQueryChange} onNavigate={frameProps.onNavigate} section="marketplace">
      <main className="marketplace-page">
        <header className="marketplace-hero">
          <span className="marketplace-hero-icon"><Store size={22} /></span>
          <span className="eyebrow">BUY LOCAL · SELL WITH YOUR COMMUNITY</span>
          <h1>Rwanda’s little marketplace.</h1>
          <p>Discover products and services from people nearby. Contact the seller directly to ask a question or arrange a viewing.</p>
          <button className="primary-button" onClick={() => { setFormOpen((open) => !open); setActionError('') }}>
            {formOpen ? <X size={16} /> : <Plus size={16} />}{formOpen ? 'Close listing form' : 'List something'}
          </button>
        </header>

        {formOpen && <form className="marketplace-form" onSubmit={(event) => { void publishListing(event) }}>
          <div className="marketplace-form-heading"><div><span className="eyebrow">YOUR LISTING</span><h2>What would you like to sell?</h2></div><ShoppingBag size={20} /></div>
          <div className="marketplace-form-grid">
            <label className="edit-field">Product or service name
              <input name="name" required minLength={2} maxLength={100} placeholder="e.g. Handwoven basket" />
            </label>
            <label className="edit-field">Listing type
              <select name="listing_type" value={listingType} onChange={(event) => { const nextType = event.target.value === 'service' ? 'service' : 'product'; setListingType(nextType); if (nextType === 'service') setProductPhoto(null) }}><option value="product">Product</option><option value="service">Service</option></select>
            </label>
            <label className="edit-field">Category
              <select name="category" defaultValue="" required><option value="" disabled>Select a category</option>{marketplaceCategories.slice(0, -1).map((category) => <option key={category}>{category}</option>)}<option>Other</option></select>
            </label>
            <label className="edit-field">Price (RWF)
              <input name="price_rwf" type="number" min="1" max="9999999999" step="1" required placeholder="e.g. 25000" />
            </label>
            {listingType === 'product' && <label className="edit-field">Quantity available
              <input name="quantity_available" type="number" min="1" max="9999" step="1" defaultValue="1" required />
            </label>}
            {listingType === 'product' && <label className="edit-field marketplace-photo-field">Product photo (optional)
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectProductPhoto} />
              <small>JPG, PNG, or WebP · up to 8 MB</small>
              {productPhotoPreview && <img className="marketplace-photo-preview" src={productPhotoPreview} alt="Selected product preview" />}
            </label>}
            <label className="edit-field">Location
              <input name="location" required minLength={2} maxLength={100} placeholder="City, district or neighborhood" />
            </label>
            <label className="edit-field">Payment method
              <select name="payment_method" defaultValue="MTN Mobile Money"><option>MTN Mobile Money</option><option>Airtel Money</option></select>
            </label>
            <label className="edit-field marketplace-payment-field">Mobile Money code or number
              <input name="payment_number" required minLength={3} maxLength={40} pattern="[A-Za-z0-9+*#(). -]{3,40}" placeholder="Till / code / phone number" />
            </label>
            <label className="edit-field marketplace-description-field">Description
              <textarea name="description" rows={3} maxLength={2000} placeholder="Share condition, size, delivery details or anything buyers should know." />
            </label>
          </div>
          <p className="marketplace-payment-note">Your payment details are visible to signed-in members. Inzu does not process payments—confirm the seller and terms before sending money.</p>
          <label className="marketplace-consent"><input type="checkbox" required />I understand this payment code or number will be visible to signed-in members.</label>
          {actionError && <p className="marketplace-action-error" role="alert">{actionError}</p>}
          <div className="marketplace-form-actions"><button type="button" className="outline-button" disabled={saving} onClick={() => setFormOpen(false)}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? 'Publishing…' : <><Plus size={15} /> Publish listing</>}</button></div>
        </form>}

        <section className="marketplace-listings" aria-label="Marketplace listings">
          <div className="marketplace-toolbar">
            <div><span className="eyebrow">FROM YOUR COMMUNITY</span><h2>Browse listings <small>{filteredListings.length}</small></h2></div>
            <div className="marketplace-filters">
              <button className={`marketplace-cart-toggle ${cartOpen ? 'active' : ''}`} onClick={() => { setCartOpen((open) => !open); setCheckoutOpen(false) }} aria-expanded={cartOpen}><ShoppingCart size={14} /> Cart <span>{cartCount}</span></button>
              <label className="marketplace-category-filter"><Tag size={14} /><select aria-label="Filter by category" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option>All categories</option>{marketplaceCategories.map((category) => <option key={category}>{category}</option>)}</select></label>
              <button className={`marketplace-mine-filter ${mineOnly ? 'active' : ''}`} onClick={() => setMineOnly((current) => !current)} aria-pressed={mineOnly}>My listings</button>
              <button className="marketplace-refresh" onClick={() => setRetryCount((value) => value + 1)} disabled={loading} aria-label="Refresh marketplace"><RefreshCw size={14} /></button>
            </div>
          </div>
          {cartOpen && <section className="marketplace-cart" aria-label="Shopping cart">
            <div className="marketplace-cart-heading"><div><span className="eyebrow">YOUR BASKET</span><h2>Shopping cart <small>{cartCount} items</small></h2></div><button className="soft-icon" onClick={() => setCartOpen(false)} aria-label="Close cart"><X size={17} /></button></div>
            {cartItems.length === 0
              ? <p className="marketplace-cart-empty">Your cart is empty. Add products from different sellers to shop in one place.</p>
              : <>
                <div className="marketplace-cart-items">{cartItems.map((item) => (
                  <article className="marketplace-cart-item" key={item.id}>
                    {item.image_url ? <img src={item.image_url} alt="" /> : <span className="marketplace-cart-placeholder"><ShoppingBag size={16} /></span>}
                    <div className="marketplace-cart-item-copy"><strong>{item.name}</strong><small>{Number(item.price_rwf).toLocaleString()} RWF · {item.seller?.full_name ?? 'Inzu member'}</small></div>
                    <div className="marketplace-quantity">
                      <button onClick={() => setCartQuantity(item, (cart[item.id] ?? 0) - 1)} aria-label={`Remove one ${item.name}`}><Minus size={13} /></button>
                      <span>{cart[item.id]}</span>
                      <button onClick={() => setCartQuantity(item, (cart[item.id] ?? 0) + 1)} disabled={cart[item.id] >= item.quantity_available} aria-label={`Add one ${item.name}`}><Plus size={13} /></button>
                    </div>
                    <strong className="marketplace-line-total">{(Number(item.price_rwf) * cart[item.id]).toLocaleString()} RWF</strong>
                  </article>
                ))}</div>
                <div className="marketplace-cart-total"><span>Cart total</span><strong>{cartTotal.toLocaleString()} RWF</strong></div>
                {!checkoutOpen
                  ? <button className="primary-button marketplace-pay-button" onClick={() => setCheckoutOpen(true)}><CreditCard size={15} /> Pay · {cartTotal.toLocaleString()} RWF</button>
                  : <div className="marketplace-checkout">
                    <div className="marketplace-checkout-heading"><CreditCard size={17} /><div><strong>Payment instructions</strong><small>Pay each seller and payment account separately.</small></div></div>
                    {Object.entries(checkoutGroups).map(([paymentGroup, items]) => {
                      const first = items[0]
                      if (!first) return null
                      const sellerTotal = items.reduce((sum, item) => sum + Number(item.price_rwf) * cart[item.id], 0)
                      return <div className="marketplace-seller-payment" key={paymentGroup}>
                        <div><strong>{first.seller?.full_name ?? 'Seller'}</strong><small>{items.map((item) => `${cart[item.id]} × ${item.name}`).join(' · ')}</small></div>
                        <span>{first.payment_method}<strong>{first.payment_number}</strong></span>
                        <b>{sellerTotal.toLocaleString()} RWF</b>
                      </div>
                    })}
                    <p>Inzu does not initiate or confirm mobile-money transfers. Verify each seller and the total before sending money. Never share your PIN or OTP.</p>
                    <button className="outline-button" onClick={() => setCheckoutOpen(false)}>Back to cart</button>
                  </div>}
              </>}
          </section>}
          {actionError && !formOpen && <p className="marketplace-action-error" role="alert">{actionError}</p>}
          {loading && <div className="marketplace-empty"><ShoppingBag size={25} /><strong>Opening the market…</strong><p>Looking for fresh listings from your community.</p></div>}
          {!loading && error && <div className="marketplace-empty marketplace-error"><strong>Marketplace is unavailable right now</strong><p>{error}</p><button className="outline-button" onClick={() => setRetryCount((value) => value + 1)}>Try again</button></div>}
          {!loading && !error && filteredListings.length === 0 && <div className="marketplace-empty"><ShoppingBag size={25} /><strong>{query || categoryFilter !== 'All categories' || mineOnly ? 'No listings match those filters.' : 'A new marketplace starts here.'}</strong><p>{query || categoryFilter !== 'All categories' || mineOnly ? 'Try another search or category.' : 'Be the first to list a product or service for your community.'}</p>{!query && <button className="primary-button" onClick={() => setFormOpen(true)}><Plus size={15} /> Create a listing</button>}</div>}
          {!loading && !error && filteredListings.length > 0 && <div className="marketplace-grid">
            {filteredListings.map((listing) => (
              <article className="marketplace-card" key={listing.id}>
                <div className={`marketplace-card-art ${listing.listing_type}`}>{listing.image_url ? <img className="marketplace-card-image" src={listing.image_url} alt={listing.name} loading="lazy" /> : <ShoppingBag size={29} />}<span>{listing.listing_type === 'service' ? 'SERVICE' : listing.category.toUpperCase()}</span></div>
                <div className="marketplace-card-body">
                  <div className="marketplace-card-meta"><span>{listing.listing_type === 'service' ? 'Service' : 'For sale'}</span><time>{timeAgo(listing.created_at)}</time></div>
                  <h3>{listing.name}</h3>
                  <strong className="marketplace-price">{Number(listing.price_rwf).toLocaleString()} RWF</strong>
                  {listing.listing_type === 'product' && <small className="marketplace-stock">{listing.quantity_available} available</small>}
                  {listing.description && <p className="marketplace-description">{listing.description}</p>}
                  <div className="marketplace-location"><MapPin size={14} />{listing.location}<span>·</span>{listing.category}</div>
                  <div className="marketplace-payment"><span><CreditCard size={14} />{listing.payment_method}</span><strong>{listing.payment_number}</strong></div>
                  <div className="marketplace-seller">
                    <img src={listing.seller?.avatar_url ?? fallbackAvatar(listing.seller?.full_name.length ?? 1)} alt="" />
                    <span><strong>{listing.seller?.full_name ?? 'Inzu member'}</strong><small>@{listing.seller?.username ?? 'member'}</small></span>
                    {listing.seller_id !== me.id && listing.listing_type === 'product' && <button className="primary-button marketplace-contact" onClick={() => addToCart(listing)}><ShoppingCart size={14} /> Add to cart</button>}
                    {listing.seller_id !== me.id && <button className="marketplace-contact-secondary" onClick={() => onContact(listing.seller_id)}><MessageCircle size={14} /> Contact</button>}
                    {listing.seller_id === me.id && <button className="marketplace-remove" disabled={removingId === listing.id} onClick={() => { void removeListing(listing) }}><Trash2 size={14} />{removingId === listing.id ? 'Removing…' : 'Remove'}</button>}
                  </div>
                </div>
              </article>
            ))}
          </div>}
          <p className="marketplace-disclaimer">Listings are posted by Inzu members. Verify products, sellers and payment details independently before a transaction.</p>
        </section>
      </main>
    </RouteFrame>
  )
}

function BooksRoute({
  me, theme, darkMode, savedBooks, onToggleSaved, ...frameProps
}: {
  me: User
  theme: string
  darkMode: boolean
  savedBooks: Book[]
  onToggleSaved: (book: Book) => void
} & Omit<ComponentProps<typeof RouteFrame>, 'children' | 'section' | 'me' | 'theme' | 'query' | 'onQueryChange'>) {
  const [books, setBooks] = useState<Book[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchDraft, setSearchDraft] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [topic, setTopic] = useState('')
  const [page, setPage] = useState(1)
  const [hasNextPage, setHasNextPage] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [shelfOpen, setShelfOpen] = useState(false)
  const [selectedBook, setSelectedBook] = useState<Book | null>(null)
  const [readingError, setReadingError] = useState(false)

  useEffect(() => {
    if (shelfOpen) {
      setLoading(false)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setError('')
    void searchBooks(searchTerm, topic, page, controller.signal)
      .then((result) => {
        setBooks(result.results)
        setHasNextPage(Boolean(result.next))
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : 'Books could not be loaded.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [searchTerm, topic, page, shelfOpen, retryCount])

  const visibleBooks = shelfOpen
    ? savedBooks.filter((book) => !searchDraft.trim() || `${book.title} ${book.authors.map((author) => author.name).join(' ')}`.toLowerCase().includes(searchDraft.trim().toLowerCase()))
    : books

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPage(1)
    setSearchTerm(searchDraft.trim())
  }

  function chooseTopic(nextTopic: string) {
    setTopic(nextTopic)
    setPage(1)
    setShelfOpen(false)
  }

  function openBook(book: Book) {
    setReadingError(false)
    setSelectedBook(book)
  }

  const readerUrl = selectedBook ? bookReaderUrl(selectedBook) : null
  const sourceUrl = selectedBook ? `https://www.gutenberg.org/ebooks/${selectedBook.id}` : ''
  const selectedSaved = selectedBook ? savedBooks.some((book) => book.id === selectedBook.id) : false

  return (
    <RouteFrame
      {...frameProps}
      me={me}
      theme={theme}
      darkMode={darkMode}
      query=""
      onQueryChange={() => undefined}
      section="books"
    >
      <main className="books-page">
        {selectedBook ? (
          <section className="book-reader">
            <div className="book-reader-toolbar">
              <button className="outline-button" onClick={() => setSelectedBook(null)}><ArrowLeft size={15} /> Library</button>
              <div className="book-reader-actions">
                <button className={`book-save-button ${selectedSaved ? 'saved' : ''}`} onClick={() => onToggleSaved(selectedBook)}>
                  <Bookmark size={15} fill={selectedSaved ? 'currentColor' : 'none'} />
                  {selectedSaved ? 'Saved' : 'Save'}
                </button>
                <a className="outline-button" href={readerUrl ?? sourceUrl} target="_blank" rel="noreferrer">Open source <ArrowUpRight size={14} /></a>
              </div>
            </div>
            <header className="book-reader-heading">
              <span className="eyebrow">PUBLIC-DOMAIN READING ROOM</span>
              <h1>{selectedBook.title}</h1>
              <p>{selectedBook.authors.map((author) => author.name).join(', ') || 'Unknown author'}</p>
            </header>
            {readerUrl && !readingError
              ? <iframe
                className="book-reader-frame"
                key={readerUrl}
                src={readerUrl}
                title={`Read ${selectedBook.title}`}
                loading="lazy"
                onError={() => setReadingError(true)}
              />
              : <div className="book-reader-unavailable">
                <BookOpen size={24} />
                <strong>This book can’t be displayed inside the reading room.</strong>
                <p>Open the free edition at Project Gutenberg to continue reading.</p>
                <a className="primary-button" href={readerUrl ?? sourceUrl} target="_blank" rel="noreferrer">Read on Project Gutenberg <ArrowUpRight size={14} /></a>
              </div>}
            <p className="book-source-note">Free public-domain edition from Project Gutenberg. Text and formatting are provided by the publisher.</p>
          </section>
        ) : (
          <>
            <header className="books-hero">
              <span className="books-hero-icon"><BookOpen size={22} /></span>
              <span className="eyebrow">A QUIET PLACE TO GET LOST IN A STORY</span>
              <h1>Read a little. Dream a lot.</h1>
              <p>Browse thousands of free public-domain books and read them here, at your own pace.</p>
              <span className="books-source-badge"><Library size={14} /> Project Gutenberg collection</span>
            </header>

            <div className="books-toolbar">
              <div className="books-view-tabs" role="tablist" aria-label="Bookshelf">
                <button className={!shelfOpen ? 'active' : ''} role="tab" aria-selected={!shelfOpen} onClick={() => { setShelfOpen(false); setSearchDraft('') }}>Discover</button>
                <button className={shelfOpen ? 'active' : ''} role="tab" aria-selected={shelfOpen} onClick={() => { setShelfOpen(true); setSearchDraft('') }}><Bookmark size={14} /> My shelf <span>{savedBooks.length}</span></button>
              </div>
              <form className="book-search" onSubmit={search}>
                <Search size={16} />
                <input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder={shelfOpen ? 'Search your saved books…' : 'Search titles or authors…'} aria-label="Search books" />
                {searchDraft && <button type="button" aria-label="Clear book search" onClick={() => { setSearchDraft(''); if (!shelfOpen) { setSearchTerm(''); setPage(1) } }}><X size={14} /></button>}
                {!shelfOpen && <button className="book-search-submit" type="submit">Search</button>}
              </form>
            </div>

            {!shelfOpen && <div className="book-topics" aria-label="Browse subjects">
              {[['', 'Popular'], ['fiction', 'Fiction'], ['history', 'History'], ['adventure', 'Adventure'], ['science', 'Science']].map(([value, label]) => (
                <button key={value} className={topic === value ? 'active' : ''} onClick={() => chooseTopic(value)}>{label}</button>
              ))}
            </div>}

            {!shelfOpen && <div className="books-results-heading"><strong>{searchTerm ? `Results for “${searchTerm}”` : topic ? `${topic[0].toUpperCase()}${topic.slice(1)} books` : 'Popular free reads'}</strong><span>{loading ? 'Finding books…' : `${visibleBooks.length} books on this page`}</span></div>}

            {loading && <div className="books-state"><BookOpen size={22} /><strong>Opening the library…</strong><p>Finding your next good read.</p></div>}
            {!loading && error && <div className="books-state books-error"><strong>The library is unavailable right now</strong><p>{error}</p><button className="outline-button" onClick={() => setRetryCount((current) => current + 1)}>Try again</button></div>}
            {!loading && !error && visibleBooks.length === 0 && <div className="books-state"><Library size={23} /><strong>{shelfOpen ? 'Your shelf is waiting for its first book.' : 'No books found for this search.'}</strong><p>{shelfOpen ? 'Save books you’d like to read and they’ll appear here.' : 'Try a different title, author, or subject.'}</p></div>}

            {!loading && !error && visibleBooks.length > 0 && (
              <div className="book-grid">
                {visibleBooks.map((book) => {
                  const cover = bookCoverUrl(book)
                  const saved = savedBooks.some((item) => item.id === book.id)
                  return <article className="book-card" key={book.id}>
                    <button className="book-cover-button" onClick={() => openBook(book)} aria-label={`Read ${book.title}`}>
                      {cover ? <img className="book-cover" src={cover} alt={`Cover of ${book.title}`} loading="lazy" /> : <span className="book-cover book-cover-placeholder"><BookOpen size={32} /><small>FREE CLASSIC</small></span>}
                    </button>
                    <div className="book-card-info">
                      <h2>{book.title}</h2>
                      <p>{book.authors.map((author) => author.name).join(', ') || 'Unknown author'}</p>
                      {book.summaries[0] && <small>{book.summaries[0]}</small>}
                      <div className="book-card-actions">
                        <button className="primary-button" onClick={() => openBook(book)}><BookOpen size={14} /> Read</button>
                        <button className={`book-save-button ${saved ? 'saved' : ''}`} onClick={() => onToggleSaved(book)} aria-label={saved ? `Remove ${book.title} from shelf` : `Save ${book.title} to shelf`} title={saved ? 'Remove from my shelf' : 'Save to my shelf'}><Bookmark size={15} fill={saved ? 'currentColor' : 'none'} /></button>
                        <span>{book.download_count.toLocaleString()} reads</span>
                      </div>
                    </div>
                  </article>
                })}
              </div>
            )}

            {!shelfOpen && !loading && !error && visibleBooks.length > 0 && <div className="books-pagination">
              <button className="outline-button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ArrowLeft size={14} /> Previous</button>
              <span>Page {page}</span>
              <button className="outline-button" disabled={!hasNextPage} onClick={() => setPage((current) => current + 1)}>More books <ArrowRight size={14} /></button>
            </div>}
            <footer className="books-footer">Books in this collection are public-domain editions. Provided by <a href="https://www.gutenberg.org/" target="_blank" rel="noreferrer">Project Gutenberg</a> via Gutendex.</footer>
          </>
        )}
      </main>
    </RouteFrame>
  )
}

function SharePostModal({
  people, post, onClose, onShare,
}: {
  people: User[]
  post: Post
  onClose: () => void
  onShare: (recipientIds: string[]) => Promise<void>
}) {
  const [selected, setSelected] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [sharing, setSharing] = useState(false)
  const [error, setError] = useState('')
  const filtered = people.filter((person) => `${person.name} ${person.handle}`.toLowerCase().includes(search.toLowerCase()))
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected.length || sharing) return
    setSharing(true)
    setError('')
    try {
      await onShare(selected)
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not share this moment.')
    } finally {
      setSharing(false)
    }
  }
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !sharing) onClose() }}>
      <form className="modal-card share-post-modal" onSubmit={(event) => { void submit(event) }}>
        <div className="modal-heading"><div><span className="eyebrow">PASS A MOMENT ALONG</span><h2>Share with friends</h2></div><button type="button" className="soft-icon" onClick={onClose} aria-label="Close" disabled={sharing}><X size={19} /></button></div>
        <p className="share-post-preview">{post.text || 'A moment from the Inzu community'}</p>
        <div className="chat-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find people…" /></div>
        <div className="share-recipient-list">
          {filtered.map((person) => {
            const checked = selected.includes(person.id)
            return <label key={person.id} className={`share-recipient ${checked ? 'selected' : ''}`}><input type="checkbox" checked={checked} onChange={() => setSelected((current) => checked ? current.filter((id) => id !== person.id) : [...current, person.id])} /><img src={person.avatar} alt="" /><span><strong>{person.name}</strong><small>@{person.handle}</small></span></label>
          })}
          {filtered.length === 0 && <p className="comments-empty">No members match your search.</p>}
        </div>
        {error && <p className="share-error" role="alert">{error}</p>}
        <div className="edit-profile-actions"><button type="button" className="outline-button" onClick={onClose} disabled={sharing}>Cancel</button><button className="primary-button" disabled={!selected.length || sharing}><Send size={15} />{sharing ? 'Sharing…' : `Send${selected.length ? ` to ${selected.length}` : ''}`}</button></div>
      </form>
    </div>
  )
}

function StatusComposer({
  me, saving, copy, onClose, onSubmit,
}: {
  me: User
  saving: boolean
  copy: (typeof statusTranslations)[Language]
  onClose: () => void
  onSubmit: (content: string, image?: File) => Promise<void>
}) {
  const [content, setContent] = useState('')
  const [image, setImage] = useState<File>()
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const preview = useMemo(() => image ? URL.createObjectURL(image) : '', [image])
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview)
  }, [preview])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || (!content.trim() && !image)) return
    setError('')
    try {
      await onSubmit(content.trim(), image)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Your status could not be shared.')
    }
  }

  function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      setError('Choose a JPG, PNG, WebP, or GIF image.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Status photos must be 5 MB or smaller.')
      return
    }
    setImage(file)
  }

  return (
    <div className="modal-backdrop status-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}>
      <form className="modal-card status-composer" onSubmit={(event) => { void submit(event) }}>
        <div className="modal-heading">
          <div><span className="eyebrow">GONE IN 24 HOURS</span><h2>{copy.heading}</h2></div>
          <button type="button" className="soft-icon" onClick={onClose} aria-label="Close" disabled={saving}><X size={19} /></button>
        </div>
        <div className="status-composer-author"><img src={me.avatar} alt="" /><span><strong>{me.name}</strong><small>{copy.visibility}</small></span><Clock3 size={15} /></div>
        <textarea autoFocus value={content} maxLength={500} onChange={(event) => setContent(event.target.value)} placeholder={copy.placeholder} rows={4} />
        {preview && <div className="status-image-preview"><img src={preview} alt="Status preview" /><button type="button" onClick={() => setImage(undefined)} aria-label="Remove photo"><X size={15} /></button></div>}
        {error && <p className="status-error" role="alert">{error}</p>}
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={chooseImage} />
        <div className="status-composer-footer"><button type="button" className="add-photo-button" onClick={() => input.current?.click()}><ImagePlus size={16} />{image ? copy.changePhoto : copy.addPhoto}</button><small>{content.length}/500 · expires after 24 hours</small><button className="primary-button" disabled={saving || (!content.trim() && !image)}><Send size={15} />{saving ? copy.publishing : copy.publish}</button></div>
      </form>
    </div>
  )
}

function StatusViewer({
  statuses, statusId, viewerId, copy, onClose, onSelect, onReact, onReply,
}: {
  statuses: MemberStatus[]
  statusId: string
  viewerId: string
  copy: (typeof statusTranslations)[Language]
  onClose: () => void
  onSelect: (status: MemberStatus) => void
  onReact: (status: MemberStatus, emoji: string | null) => void
  onReply: (status: MemberStatus, text: string) => Promise<void>
}) {
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [replyError, setReplyError] = useState('')
  const status = statuses.find((item) => item.id === statusId)
  if (!status) return null
  const activeStatus = status
  const ownStatus = status.user_id === viewerId
  const reaction = status.reactions.find((item) => item.user_id === viewerId)
  const index = statuses.findIndex((item) => item.id === status.id)

  async function sendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!reply.trim() || sending) return
    setSending(true)
    setReplyError('')
    try {
      await onReply(activeStatus, reply.trim())
      setReply('')
      onClose()
    } catch (reason) {
      setReplyError(reason instanceof Error ? reason.message : 'Your reply could not be sent.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="modal-backdrop status-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="status-viewer" role="dialog" aria-modal="true" aria-label={`${status.author.full_name}'s status`}>
        <div className="status-viewer-progress"><span /></div>
        <header className="status-viewer-header">
          <img src={status.author.avatar_url || fallbackAvatar(status.author.full_name.length)} alt="" />
          <div><strong>{status.author.full_name}</strong><small>{timeAgo(status.created_at)} · 24-hour status</small></div>
          {ownStatus && <span className="status-owner-label">{copy.owner}</span>}
          <button type="button" className="soft-icon" onClick={onClose} aria-label="Close status"><X size={19} /></button>
        </header>
        <div className={`status-viewer-content ${status.image_url ? 'has-image' : ''}`}>
          {status.image_url && <img className="status-viewer-image" src={status.image_url} alt="Status shared by this member" />}
          {status.content && <p>{status.content}</p>}
        </div>
        {ownStatus ? (
          <div className="status-insights">
            <div className="status-insights-heading"><span><Eye size={15} /> {status.viewers.length} {status.viewers.length === 1 ? 'view' : 'views'}</span><small>{status.reactions.length} reactions</small></div>
            {status.viewers.length > 0
              ? <div className="status-viewer-list">{status.viewers.map((person) => <div key={person.id}><img src={person.avatar_url || fallbackAvatar(person.full_name.length)} alt="" /><span>{person.full_name}</span><small>Viewed</small></div>)}</div>
              : <p className="status-insights-empty">Your followers’ views will appear here.</p>}
            {status.reactions.length > 0 && <div className="status-reaction-list">{status.reactions.map((item) => <span key={item.user_id}>{item.emoji} {item.actor.full_name}</span>)}</div>}
          </div>
        ) : (
          <div className="status-viewer-actions">
            <div className="status-reaction-buttons" aria-label="React to this status">
              {['❤️', '😂', '😮', '👏'].map((emoji) => <button key={emoji} type="button" className={reaction?.emoji === emoji ? 'selected' : ''} aria-label={`React ${emoji}`} onClick={() => onReact(status, reaction?.emoji === emoji ? null : emoji)}>{emoji}</button>)}
            </div>
            <form className="status-reply-form" onSubmit={(event) => { void sendReply(event) }}><input value={reply} maxLength={2000} onChange={(event) => setReply(event.target.value)} placeholder={copy.replyPlaceholder} aria-label="Reply to status" /><button disabled={!reply.trim() || sending} aria-label="Send status reply"><Send size={17} /></button></form>
            {replyError && <p className="status-error" role="alert">{replyError}</p>}
          </div>
        )}
        {statuses.length > 1 && <div className="status-viewer-navigation"><button type="button" aria-label="Previous status" onClick={() => onSelect(statuses[(index - 1 + statuses.length) % statuses.length])}><ArrowLeft size={16} /></button><small>{index + 1} / {statuses.length}</small><button type="button" aria-label="Next status" onClick={() => onSelect(statuses[(index + 1) % statuses.length])}><ArrowRight size={16} /></button></div>}
      </section>
    </div>
  )
}

function MessageBody({ text, onOpenPost }: { text: string; onOpenPost: (id: string) => void }) {
  const match = text.match(/https?:\/\/\S+[?&]post=([0-9a-f-]{36})/i)
  if (!match) return <p>{text}</p>
  const before = text.slice(0, match.index).replace(/shared a moment:\s*$/i, '').trim()
  return <p>{before && <>{before}{' '}</>}Shared a moment: <a className="chat-post-link" href={match[0]} onClick={(event) => { event.preventDefault(); onOpenPost(match[1]) }}>Open post <ArrowUpRight size={12} /></a></p>
}

function App() {
  const [account, setAccountState] = useState<Account | null>(null)
  const setAccount = (nextAccount: Account | null) => {
    setAccountState(nextAccount)
    if (nextAccount === null && supabase) {
      void supabase.auth.signOut().then(({ error }) => {
        if (error) setAuthError(error.message)
      })
    }
  }
  const [authLoading, setAuthLoading] = useState(true)
  const [users, setUsers] = useState<User[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [statuses, setStatuses] = useState<MemberStatus[]>([])
  const [follows, setFollows] = useState<string[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [notifications, setNotifications] = useState<PostNotification[]>([])
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const [profileCounts, setProfileCounts] = useState<Record<string, { moments: number; following: number; followers: number }>>({})
  const [trendingTopics, setTrendingTopics] = useState<TrendingTopic[]>([])
  const [rwandaNews, setRwandaNews] = useState<RwandaNews | null>(null)
  const [trendsLoading, setTrendsLoading] = useState(true)
  const [newsLoading, setNewsLoading] = useState(true)
  const [trendsError, setTrendsError] = useState('')
  const [newsError, setNewsError] = useState('')
  const [language, setLanguage] = useStoredState<Language>('language', 'en')
  const [theme, setTheme] = useStoredState('theme', 'violet')
  const [darkMode, setDarkMode] = useStoredState('darkMode', false)
  const [wallpaper, setWallpaper] = useStoredState('wallpaper', 'none')
  const [savedBooks, setSavedBooks] = useStoredState<Book[]>('savedBooks', [])
  const [section, setSection] = useState('home')
  const [selectedChat, setSelectedChat] = useState('')
  const [peerTyping, setPeerTyping] = useState(false)
  const [query, setQuery] = useState('')
  const [toast, setToast] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [authMode, setAuthMode] = useState<'signin' | 'register' | null>(null)
  const [showProfileEditor, setShowProfileEditor] = useState(false)
  const [showPost, setShowPost] = useState(false)
  const [showStatusComposer, setShowStatusComposer] = useState(false)
  const [statusSaving, setStatusSaving] = useState(false)
  const [activeStatusId, setActiveStatusId] = useState<string | null>(null)
  const [editingPostId, setEditingPostId] = useState<string | null>(null)
  const [removeEditingPostImage, setRemoveEditingPostImage] = useState(false)
  const [deletePostId, setDeletePostId] = useState<string | null>(null)
  const [postDeleting, setPostDeleting] = useState(false)
  const [sharePostId, setSharePostId] = useState<string | null>(null)
  const [commentsOpenId, setCommentsOpenId] = useState<string | null>(null)
  const [commentsByPost, setCommentsByPost] = useState<Record<string, PostComment[]>>({})
  const [commentDraft, setCommentDraft] = useState('')
  const [commentLoadingId, setCommentLoadingId] = useState<string | null>(null)
  const [activePostId, setActivePostId] = useState<string | null>(null)
  const [postText, setPostText] = useState('')
  const [chatText, setChatText] = useState('')
  const [authError, setAuthError] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [activeProfile, setActiveProfileState] = useState<string | null>(null)
  const [activeProfileTab, setActiveProfileTab] = useState<'posts' | 'videos'>('posts')
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [profilePhoto, setProfilePhoto] = useState<File | null>(null)
  const [profilePhotoPreview, setProfilePhotoPreview] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [newPostImage, setNewPostImageState] = useState<string | undefined>()
  const [newPostFile, setNewPostFile] = useState<File | undefined>()
  const mediaPreviewUrl = useRef<string | null>(null)
  const setNewPostImage = (image: string | undefined) => {
    if (mediaPreviewUrl.current) URL.revokeObjectURL(mediaPreviewUrl.current)
    mediaPreviewUrl.current = image?.startsWith('blob:') ? image : null
    setNewPostImageState(image)
    if (!image) setNewPostFile(undefined)
  }
  const [showNotifications, setShowNotifications] = useState(false)
  const peerTypingTimeout = useRef<number | undefined>(undefined)
  const typingSendState = useRef<{ conversationId: string; peerId: string; lastSentAt: number; timeout?: number } | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const videoFileInput = useRef<HTMLInputElement>(null)
  const chatFileInput = useRef<HTMLInputElement>(null)
  const profilePhotoInput = useRef<HTMLInputElement>(null)
  const t = translations[language]
  const me: User = account ? { id: account.id, name: account.name, handle: account.handle, city: account.city, bio: account.bio, avatar: account.avatar, online: true } : initialUsers[0]
  const setActiveProfile = (profileId: string | null) => {
    setActiveProfileState(profileId === account?.id ? 'maya' : profileId)
    setActiveProfileTab('posts')
    if (profileId) setSection('home')
  }
  const otherUsers = users.filter((user) => user.id !== account?.id)
  const currentUser = otherUsers.find((user) => user.id === selectedChat) ?? initialUsers[1]
  const hasSelectedContact = otherUsers.some((user) => user.id === selectedChat)
  const activeConversation = conversations.find((item) => item.userId === selectedChat)
  const currentConversation = activeConversation?.messages ?? []
  const viewedProfile = activeProfile === 'maya' ? me : users.find((user) => user.id === activeProfile)
  const viewedProfilePosts = viewedProfile
    ? posts.filter((post) => post.userId === viewedProfile.id)
    : []
  const visibleProfilePosts = activeProfileTab === 'videos'
    ? viewedProfilePosts.filter((post) => post.video)
    : viewedProfilePosts
  const callControls = useWebRtcCalls(
    account?.id,
    conversations,
    (peerId): CallPeer => {
      const person = users.find((user) => user.id === peerId) ?? initialUsers.find((user) => user.id === peerId)
      return { id: peerId, name: person?.name ?? 'Inzu member', avatar: person?.avatar ?? fallbackAvatar(0) }
    },
    notify,
    (peerId, typing) => {
      if (peerId !== selectedChat) return
      if (peerTypingTimeout.current !== undefined) window.clearTimeout(peerTypingTimeout.current)
      setPeerTyping(typing)
      if (typing) {
        peerTypingTimeout.current = window.setTimeout(() => {
          setPeerTyping(false)
          peerTypingTimeout.current = undefined
        }, 3000)
      } else {
        peerTypingTimeout.current = undefined
      }
    },
  )

  function updateTypingStatus(typing: boolean) {
    if (!account || !activeConversation || !selectedChat) return
    const now = Date.now()
    let state = typingSendState.current
    if (state && (state.conversationId !== activeConversation.id || state.peerId !== selectedChat)) {
      if (state.timeout !== undefined) window.clearTimeout(state.timeout)
      void callControls.sendTyping(state.conversationId, state.peerId, false)
        .catch((error: unknown) => notify(error instanceof Error ? error.message : 'Typing status could not be updated.'))
      state = null
    }
    if (!state) {
      state = { conversationId: activeConversation.id, peerId: selectedChat, lastSentAt: 0 }
      typingSendState.current = state
    }

    if (state.timeout !== undefined) window.clearTimeout(state.timeout)
    if (typing && now - state.lastSentAt > 900) {
      state.lastSentAt = now
      void callControls.sendTyping(state.conversationId, state.peerId, true)
        .catch((error: unknown) => notify(error instanceof Error ? error.message : 'Typing status could not be updated.'))
    }
    if (typing) {
      state.timeout = window.setTimeout(() => {
        const current = typingSendState.current
        if (!current || current.conversationId !== state?.conversationId || current.peerId !== state?.peerId) return
        void callControls.sendTyping(current.conversationId, current.peerId, false)
          .catch((error: unknown) => notify(error instanceof Error ? error.message : 'Typing status could not be updated.'))
        typingSendState.current = null
      }, 1600)
    } else {
      void callControls.sendTyping(state.conversationId, state.peerId, false)
        .catch((error: unknown) => notify(error instanceof Error ? error.message : 'Typing status could not be updated.'))
      typingSendState.current = null
    }
  }

  useEffect(() => () => {
    if (profilePhotoPreview) URL.revokeObjectURL(profilePhotoPreview)
  }, [profilePhotoPreview])
  useEffect(() => () => {
    if (mediaPreviewUrl.current) URL.revokeObjectURL(mediaPreviewUrl.current)
  }, [])

  useEffect(() => {
    if (!activePostId || section !== 'home') return
    const timer = window.setTimeout(() => {
      document.getElementById(`post-${activePostId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
    return () => window.clearTimeout(timer)
  }, [activePostId, section, posts])

  useEffect(() => {
    const onPopState = () => {
      const postId = new URLSearchParams(window.location.search).get('post')
      setActivePostId(postId)
      if (postId) setSection('home')
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false)
      return
    }

    let mounted = true
    let authRevision = 0
    const loadSignedInMember = async (userId: string, email: string, fullName: string | undefined, revision: number) => {
      try {
        const profile = await loadProfile(userId, email, fullName)
        const [directory, chats] = await Promise.all([
          loadPeople(userId),
          loadConversations(userId),
        ])
        if (!mounted || revision !== authRevision) return
        setAccount(toAccount(profile, email))
        setUsers([toUser(profile), ...directory.people.map(toUser)])
        setFollows(directory.follows)
        setConversations(chats.map((conversation) => ({
          ...conversation,
          messages: conversation.messages.map((message) => toMessage(message as ChatMessage)),
        })))
        void loadStatuses(userId).then((loadedStatuses) => {
          if (mounted && revision === authRevision) setStatuses(loadedStatuses)
        }).catch((error: unknown) => {
          if (mounted && revision === authRevision) notify(`Statuses could not be loaded: ${explainSupabaseError(error)}`)
        })
        setSelectedChat('')
        setAuthError('')
        try {
          const loadedPosts = await loadPosts(userId)
          const deepLinkedPostId = new URLSearchParams(window.location.search).get('post')
          if (deepLinkedPostId && !loadedPosts.some((post) => post.id === deepLinkedPostId)) {
            try {
              loadedPosts.push(await loadPostById(deepLinkedPostId, userId))
            } catch (error) {
              if (mounted && revision === authRevision) {
                notify(`This shared moment could not be opened: ${explainSupabaseError(error)}`)
              }
            }
          }
          if (mounted && revision === authRevision) {
            setPosts(loadedPosts.map(toPost))
            if (deepLinkedPostId) {
              setActivePostId(deepLinkedPostId)
              setSection('home')
              setQuery('')
            }
          }
        } catch (error) {
          if (mounted && revision === authRevision) notify(`Moments could not be loaded: ${explainSupabaseError(error)}`)
        }
      } catch (error) {
        if (mounted && revision === authRevision) {
          setAccountState(null)
          setAuthError(explainSupabaseError(error))
          if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23503') {
            void supabase?.auth.signOut()
          }
        }
      } finally {
        if (mounted && revision === authRevision) setAuthLoading(false)
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const revision = ++authRevision
      window.setTimeout(() => {
        if (!mounted) return
        if (session) void loadSignedInMember(
          session.user.id,
          session.user.email ?? '',
          typeof session.user.user_metadata.full_name === 'string' ? session.user.user_metadata.full_name : undefined,
          revision,
        )
        else {
          setAccountState(null)
          setUsers([])
          setFollows([])
          setConversations([])
          setPosts([])
          setStatuses([])
          setActiveStatusId(null)
          setNotifications([])
          setUnreadNotifications(0)
          setProfileCounts({})
          setSelectedChat('')
          setAuthLoading(false)
        }
      }, 0)
    })
    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!activeConversation) return
    const channel = subscribeToMessages(activeConversation.id, (message) => {
      const converted = toMessage(message)
      if (message.sender_id !== account?.id && !message.read_at) {
        void markConversationRead(activeConversation.id).catch((error: unknown) => {
          notify(`Read receipts could not be updated: ${explainSupabaseError(error)}`)
        })
      }
      setConversations((current) => current.map((conversation) => {
        if (conversation.id !== activeConversation.id) return conversation
        const existingIndex = conversation.messages.findIndex((item) => item.id === message.id)
        if (existingIndex < 0) return { ...conversation, messages: [...conversation.messages, converted] }
        const messages = [...conversation.messages]
        messages[existingIndex] = { ...messages[existingIndex], ...converted }
        return { ...conversation, messages }
      }))
    }, (message) => {
      setToast(message)
      window.setTimeout(() => setToast(''), 3000)
    })
    return () => { void supabase?.removeChannel(channel) }
  }, [account?.id, activeConversation?.id])

  useEffect(() => {
    if (!account || !activeConversation) return
    void markConversationRead(activeConversation.id).catch((error: unknown) => {
      notify(`Read receipts could not be updated: ${explainSupabaseError(error)}`)
    })
  }, [account?.id, activeConversation?.id])

  useEffect(() => {
    setPeerTyping(false)
    if (peerTypingTimeout.current !== undefined) window.clearTimeout(peerTypingTimeout.current)
    peerTypingTimeout.current = undefined
    return () => {
      if (peerTypingTimeout.current !== undefined) window.clearTimeout(peerTypingTimeout.current)
    }
  }, [selectedChat])

  useEffect(() => {
    if (!account) return
    let mounted = true
    const refreshConversations = async () => {
      try {
        const latest = await loadConversations(account.id)
        if (!mounted) return
        setConversations(latest.map((conversation) => ({
          ...conversation,
          messages: conversation.messages.map((message) => toMessage(message as ChatMessage)),
        })))
      } catch (error) {
        if (mounted) notify(`New conversations could not be loaded: ${explainSupabaseError(error)}`)
      }
    }
    const channel = subscribeToConversations(account.id, () => { void refreshConversations() }, notify)
    return () => {
      mounted = false
      void supabase?.removeChannel(channel)
    }
  }, [account?.id])

  useEffect(() => {
    if (!account) return
    let mounted = true
    const refresh = () => {
      void loadStatuses(account.id).then((loadedStatuses) => {
        if (mounted) setStatuses(loadedStatuses)
      }).catch((error: unknown) => {
        if (mounted) notify(`Statuses could not be refreshed: ${explainSupabaseError(error)}`)
      })
    }
    const channel = subscribeToStatuses(refresh, (message) => notify(message))
    const expiryRefresh = window.setInterval(refresh, 60_000)
    return () => {
      mounted = false
      window.clearInterval(expiryRefresh)
      void supabase?.removeChannel(channel)
    }
  }, [account?.id])

  useEffect(() => {
    if (!account) return
    let mounted = true
    const refreshPosts = async () => {
      try {
        const latest = await loadPosts(account.id)
        if (mounted) setPosts(latest.map(toPost))
      } catch (error) {
        if (mounted) notify(`Post interaction updates could not be loaded: ${explainSupabaseError(error)}`)
      }
    }
    const refreshOpenComments = async () => {
      if (!commentsOpenId) return
      try {
        const latest = await loadPostComments(commentsOpenId)
        if (mounted) setCommentsByPost((current) => ({ ...current, [commentsOpenId]: latest }))
      } catch (error) {
        if (mounted) notify(`New comments could not be loaded: ${explainSupabaseError(error)}`)
      }
    }
    const channel = subscribeToPostInteractions(() => {
      void refreshPosts()
      void refreshOpenComments()
    }, notify)
    return () => {
      mounted = false
      void supabase?.removeChannel(channel)
    }
  }, [account?.id, commentsOpenId])

  useEffect(() => {
    if (!account) return
    let mounted = true
    const refreshTrending = async () => {
      setTrendsLoading(true)
      try {
        const topics = await loadTrendingTopics()
        if (mounted) {
          setTrendingTopics(topics)
          setTrendsError('')
        }
      } catch (error) {
        if (mounted) setTrendsError(explainSupabaseError(error))
      } finally {
        if (mounted) setTrendsLoading(false)
      }
    }
    void refreshTrending()
    void refreshRwandaHeadlines()
    const refreshInterval = window.setInterval(() => {
      void refreshTrending()
      void refreshRwandaHeadlines()
    }, 5 * 60 * 1000)
    return () => {
      mounted = false
      window.clearInterval(refreshInterval)
    }
  }, [account?.id])

  useEffect(() => {
    if (account && section === 'news') void refreshRwandaHeadlines()
  }, [account?.id, section])

  useEffect(() => {
    if (!account) return
    let mounted = true
    const refreshNotifications = async (announce = false) => {
      try {
        const result = await loadNotifications(account.id)
        if (!mounted) return
        setNotifications(result.notifications)
        setUnreadNotifications(result.unread)
        if (announce && result.unread > 0) notify('You have a new Inzu notification.')
      } catch (error) {
        if (mounted) notify(`Notifications could not be loaded: ${explainSupabaseError(error)}`)
      }
    }
    void refreshNotifications()
    const channel = subscribeToNotifications(account.id, () => { void refreshNotifications(true) }, notify)
    return () => {
      mounted = false
      void supabase?.removeChannel(channel)
    }
  }, [account?.id])

  useEffect(() => {
    if (!account || !activeProfile) return
    const profileId = activeProfile === 'maya' ? account.id : activeProfile
    let mounted = true
    void loadProfileCounts(profileId).then((counts) => {
      if (mounted) setProfileCounts((current) => ({ ...current, [profileId]: counts }))
    }).catch((error: unknown) => {
      if (mounted) notify(`Profile totals could not be loaded: ${explainSupabaseError(error)}`)
    })
    return () => { mounted = false }
  }, [account?.id, activeProfile])

  function notify(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(''), 3000)
  }
  async function publishStatus(content: string, image?: File) {
    if (!account) return
    setStatusSaving(true)
    try {
      await saveStatus(account.id, content, image)
      const refreshed = await loadStatuses(account.id)
      setStatuses(refreshed)
      setShowStatusComposer(false)
      notify('Your status is live for 24 hours ✨')
    } catch (error) {
      const message = `Your status could not be shared: ${explainSupabaseError(error)}`
      notify(message)
      throw new Error(message)
    } finally {
      setStatusSaving(false)
    }
  }
  function openMemberStatus(status: MemberStatus) {
    setActiveStatusId(status.id)
    if (status.user_id !== account?.id && account && !status.viewed) {
      void recordStatusView(status.id, account.id).then(async () => {
        const refreshed = await loadStatuses(account.id)
        setStatuses(refreshed)
      }).catch((error: unknown) => {
        notify(`This status view could not be saved: ${explainSupabaseError(error)}`)
      })
    }
  }
  async function reactToStatus(status: MemberStatus, emoji: string | null) {
    if (!account) return
    try {
      await setStatusReaction(status.id, account.id, emoji)
      setStatuses(await loadStatuses(account.id))
    } catch (error) {
      notify(`Your reaction could not be saved: ${explainSupabaseError(error)}`)
    }
  }
  async function replyToMemberStatus(status: MemberStatus, content: string) {
    if (!account) throw new Error('Sign in to reply to a status.')
    const sent = await replyToStatus(status.id, content)
    const message = toMessage(sent)
    setConversations((current) => {
      const byId = current.find((conversation) => conversation.id === sent.conversation_id)
      const byPeer = current.find((conversation) => conversation.userId === status.user_id)
      const conversation = byId ?? byPeer ?? { id: sent.conversation_id, userId: status.user_id, messages: [] }
      if (conversation.messages.some((item) => item.id === message.id)) return current
      const updated = { ...conversation, id: sent.conversation_id, messages: [...conversation.messages, message] }
      return current.some((item) => item.id === updated.id)
        ? current.map((item) => item.id === updated.id ? updated : item)
        : [...current.filter((item) => item.userId !== status.user_id), updated]
    })
    setSelectedChat(status.user_id)
    setActiveStatusId(null)
    setSection('messages')
    notify(`Your reply was sent directly to ${status.author.full_name}.`)
  }
  function toggleSavedBook(book: Book) {
    setSavedBooks((current) => current.some((item) => item.id === book.id)
      ? current.filter((item) => item.id !== book.id)
      : [book, ...current])
  }
  async function refreshRwandaHeadlines() {
    setNewsLoading(true)
    try {
      const result = await loadRwandaNews()
      setRwandaNews(result)
      setNewsError('')
    } catch (error) {
      setNewsError(error instanceof Error ? error.message : 'Rwanda headlines could not be loaded.')
    } finally {
      setNewsLoading(false)
    }
  }
  async function toggleFollow(id: string) {
    if (!account) return
    const following = follows.includes(id)
    const person = users.find((user) => user.id === id)
    try {
      await setFollowing(account.id, id, !following)
      setFollows((current) => following ? current.filter((item) => item !== id) : [...current, id])
      void loadStatuses(account.id).then(setStatuses).catch((error: unknown) => {
        notify(`Follow saved, but statuses could not refresh: ${explainSupabaseError(error)}`)
      })
      try {
        const [ownCounts, personCounts] = await Promise.all([
          loadProfileCounts(account.id),
          loadProfileCounts(id),
        ])
        setProfileCounts((current) => ({ ...current, [account.id]: ownCounts, [id]: personCounts }))
      } catch (error) {
        notify(`Follow saved, but profile totals could not refresh: ${explainSupabaseError(error)}`)
        return
      }
      notify(following ? `Unfollowed ${person?.name}` : `Following ${person?.name}`)
    } catch (error) {
      notify(`Could not update your follows: ${explainSupabaseError(error)}`)
    }
  }
  async function openNotification(notification: PostNotification) {
    if (!account) return
    setShowNotifications(false)
    try {
      await markNotificationsRead(account.id)
      setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })))
      setUnreadNotifications(0)
    } catch (error) {
      notify(`Notification could not be marked read: ${explainSupabaseError(error)}`)
    }
    if (notification.event_type === 'message') {
      void startConversation(notification.actor_id)
    } else if (notification.event_type === 'follow') {
      setActiveProfile(notification.actor_id)
    } else {
      setSection('home')
    }
  }
  async function likePost(id: string) {
    if (!account) return
    const post = posts.find((item) => item.id === id)
    if (!post) return
    const liked = Boolean(post.liked)
    setPosts((current) => current.map((item) => item.id === id ? { ...item, liked: !liked, likes: item.likes + (liked ? -1 : 1) } : item))
    try {
      await togglePostLike(id, account.id, liked)
    } catch (error) {
      setPosts((current) => current.map((item) => item.id === id ? { ...item, liked, likes: item.likes + (liked ? 1 : -1) } : item))
      notify(`Your like could not be saved: ${explainSupabaseError(error)}`)
    }
  }
  async function toggleRepost(id: string) {
    if (!account) return
    const post = posts.find((item) => item.id === id)
    if (!post) return
    const reposted = Boolean(post.reposted)
    setPosts((current) => current.map((item) => item.id === id
      ? { ...item, reposted: !reposted, reposts: item.reposts + (reposted ? -1 : 1) }
      : item))
    try {
      await togglePostRepost(id, account.id, reposted)
      notify(reposted ? 'Repost removed.' : 'Moment reposted to your community.')
    } catch (error) {
      setPosts((current) => current.map((item) => item.id === id
        ? { ...item, reposted, reposts: item.reposts + (reposted ? 1 : -1) }
        : item))
      notify(`Your repost could not be saved: ${explainSupabaseError(error)}`)
    }
  }
  async function toggleComments(id: string) {
    if (commentsOpenId === id) {
      setCommentsOpenId(null)
      return
    }
    setCommentsOpenId(id)
    if (commentsByPost[id]) return
    setCommentLoadingId(id)
    try {
      const comments = await loadPostComments(id)
      setCommentsByPost((current) => ({ ...current, [id]: comments }))
    } catch (error) {
      notify(`Comments could not be loaded: ${explainSupabaseError(error)}`)
    } finally {
      setCommentLoadingId(null)
    }
  }
  async function submitPostComment(id: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!account || !commentDraft.trim()) return
    const content = commentDraft.trim()
    try {
      const comment = await addPostComment(id, account.id, content)
      setCommentsByPost((current) => ({ ...current, [id]: [...(current[id] ?? []), comment] }))
      setCommentDraft('')
      try {
        const updatedPost = toPost(await loadPostById(id, account.id))
        setPosts((current) => current.map((post) => post.id === id ? updatedPost : post))
      } catch (error) {
        notify(`Comment saved, but its count could not refresh: ${explainSupabaseError(error)}`)
      }
    } catch (error) {
      notify(`Your comment could not be saved: ${explainSupabaseError(error)}`)
    }
  }
  function openPost(id: string) {
    const url = new URL(window.location.href)
    url.searchParams.set('post', id)
    window.history.pushState({}, '', url)
    setActivePostId(id)
    setSection('home')
    setQuery('')
    if (account && !posts.some((post) => post.id === id)) {
      void loadPostById(id, account.id).then((loaded) => {
        setPosts((current) => current.some((post) => post.id === id)
          ? current.map((post) => post.id === id ? toPost(loaded) : post)
          : [toPost(loaded), ...current])
      }).catch((error: unknown) => {
        notify(`This shared moment could not be opened: ${explainSupabaseError(error)}`)
      })
    }
  }
  async function sharePostWithPeople(postId: string, recipientIds: string[]) {
    if (!account) return
    const post = posts.find((item) => item.id === postId)
    if (!post || recipientIds.length === 0) return
    const link = new URL(window.location.href)
    link.searchParams.set('post', postId)
    let sharedCount = 0
    let firstRecipient = ''
    try {
      for (const recipientId of recipientIds) {
        const person = otherUsers.find((user) => user.id === recipientId)
        if (!person) continue
        const conversationId = await openConversation(recipientId)
        const message = await sendChatMessage(conversationId, account.id, `Shared a moment: ${link.toString()}`)
        const converted = toMessage(message)
        setConversations((current) => {
          const existing = current.find((item) => item.id === conversationId)
          if (existing) {
            if (existing.messages.some((item) => item.id === converted.id)) return current
            return current.map((item) => item.id === conversationId
              ? { ...item, messages: [...item.messages, converted] }
              : item)
          }
          return [...current, { id: conversationId, userId: recipientId, messages: [converted] }]
        })
        if (!firstRecipient) firstRecipient = recipientId
        sharedCount += 1
      }
      if (!sharedCount) throw new Error('Choose at least one available person to share with.')
      setSelectedChat(firstRecipient)
      setSection('messages')
      setSharePostId(null)
      notify(`Moment shared with ${sharedCount} ${sharedCount === 1 ? 'person' : 'people'}.`)
    } catch (error) {
      const reason = explainSupabaseError(error)
      if (sharedCount) {
        setSelectedChat(firstRecipient)
        setSection('messages')
        setSharePostId(null)
        notify(`Shared with ${sharedCount}, but some messages could not be sent: ${reason}`)
        return
      }
      throw new Error(`Could not share this moment: ${reason}`)
    }
  }
  async function sendMessage(text = chatText, attachment?: string) {
    if (!text.trim() && !attachment) return
    if (!account || !hasSelectedContact) {
      notify('Choose someone from Discover before starting a chat.')
      return
    }
    try {
      let conversation = conversations.find((item) => item.userId === currentUser.id)
      if (!conversation) {
        const conversationId = await openConversation(currentUser.id)
        conversation = { id: conversationId, userId: currentUser.id, messages: [] }
        setConversations((current) => current.some((item) => item.id === conversationId) ? current : [...current, conversation!])
      }
      const sent = await sendChatMessage(conversation.id, account.id, text.trim(), attachment)
      const sentMessage = toMessage(sent)
      setConversations((current) => {
        const savedConversation = current.find((item) => item.id === conversation.id) ?? conversation
        if (savedConversation.messages.some((item) => item.id === sentMessage.id)) return current
        const updatedConversation = { ...savedConversation, messages: [...savedConversation.messages, sentMessage] }
        return current.some((item) => item.id === conversation.id)
          ? current.map((item) => item.id === conversation.id ? updatedConversation : item)
          : [...current, updatedConversation]
      })
      setChatText('')
      updateTypingStatus(false)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Your message could not be sent. Please try again.')
    }
  }
  async function updateMessage(messageId: string, content: string) {
    if (!account) throw new Error('Sign in before editing a message.')
    await editChatMessage(messageId, content)
    const editedAt = new Date().toISOString()
    setConversations((current) => current.map((conversation) => ({
      ...conversation,
      messages: conversation.messages.map((message) => message.id === messageId
        ? { ...message, text: content, editedAt }
        : message),
    })))
  }
  function beginEditPost(post: Post) {
    setEditingPostId(post.id)
    setRemoveEditingPostImage(false)
    setNewPostFile(undefined)
    setNewPostImage(post.video || post.image)
    setPostText(post.text)
    setShowPost(true)
  }
  function beginCreatePost() {
    setEditingPostId(null)
    setRemoveEditingPostImage(false)
    setPostText('')
    setNewPostImage(undefined)
    setShowPost(true)
  }
  function closePostEditor() {
    setShowPost(false)
    setEditingPostId(null)
    setRemoveEditingPostImage(false)
    setPostText('')
    setNewPostImage(undefined)
    setNewPostFile(undefined)
  }
  async function createPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (editingPostId) {
      const existingPost = posts.find((post) => post.id === editingPostId)
      if (!account || (!postText.trim() && !newPostFile && (removeEditingPostImage || (!existingPost?.image && !existingPost?.video)))) return
      try {
        const updated = await savePostEdit(editingPostId, account.id, postText.trim(), newPostFile, removeEditingPostImage)
        setPosts((current) => current.map((post) => post.id === editingPostId
          ? { ...post, text: updated.post.content, image: updated.post.image_url ?? undefined, video: updated.post.video_url ?? undefined }
          : post))
        closePostEditor()
        notify(updated.warning ?? 'Your moment has been updated.')
      } catch (error) {
        notify(`Your moment could not be updated: ${explainSupabaseError(error)}`)
      }
      return
    }
    if (!account || (!postText.trim() && !newPostFile)) return
    try {
      const saved = await savePost(account.id, postText.trim(), newPostFile)
      setPosts((current) => [toPost({ ...saved, likes: 0, liked: false, comments: 0, reposts: 0, reposted: false }), ...current])
      setProfileCounts((current) => {
        const counts = current[account.id]
        return counts ? { ...current, [account.id]: { ...counts, moments: counts.moments + 1 } } : current
      })
      setPostText('')
      closePostEditor()
      notify('Your moment has been shared ✨')
      void loadTrendingTopics().then(setTrendingTopics).catch((error: unknown) => {
        notify(`Moment saved, but trending counts could not refresh: ${explainSupabaseError(error)}`)
      })
    } catch (error) {
      notify(`Your moment could not be shared: ${explainSupabaseError(error)}`)
    }
  }
  async function confirmDeletePost() {
    if (!account || !deletePostId || postDeleting) return
    const postId = deletePostId
    setPostDeleting(true)
    try {
      const warning = await removePost(postId, account.id)
      setPosts((current) => current.filter((post) => post.id !== postId))
      setCommentsByPost((current) => {
        const remaining = { ...current }
        delete remaining[postId]
        return remaining
      })
      if (commentsOpenId === postId) setCommentsOpenId(null)
      if (activePostId === postId) {
        setActivePostId(null)
        const url = new URL(window.location.href)
        url.searchParams.delete('post')
        window.history.replaceState({}, '', url)
      }
      setProfileCounts((current) => {
        const counts = current[account.id]
        return counts ? { ...current, [account.id]: { ...counts, moments: Math.max(0, counts.moments - 1) } } : current
      })
      setDeletePostId(null)
      notify(warning ?? 'Your moment was deleted.')
      void loadProfileCounts(account.id).then((counts) => {
        setProfileCounts((current) => ({ ...current, [account.id]: counts }))
      }).catch((error: unknown) => {
        notify(`Moment deleted, but profile totals could not refresh: ${explainSupabaseError(error)}`)
      })
    } catch (error) {
      notify(`Your moment could not be deleted: ${explainSupabaseError(error)}`)
    } finally {
      setPostDeleting(false)
    }
  }
  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAuthError('')
    if (!supabase) {
      setAuthError('Connect a Supabase project first. Follow the setup steps in the project README.')
      return
    }
    if (!formEmail.includes('@') || formPassword.length < 6) {
      setAuthError('Enter a valid email and a password with at least 6 characters.')
      return
    }
    if (authMode === 'register' && !formName.trim()) {
      setAuthError('Please enter your name to create an account.')
      return
    }
    setAuthLoading(true)
    try {
      if (authMode === 'register') {
        const { data, error } = await supabase.auth.signUp({
          email: formEmail.trim(),
          password: formPassword,
          options: { data: { full_name: formName.trim() } },
        })
        if (error) throw error
        if (data.session) {
          setAuthMode(null)
          notify(`Welcome to Inzu, ${formName.trim().split(' ')[0]}!`)
        } else {
          setAuthMode('signin')
          setAuthError('Your account is ready. Check your email to confirm it, then sign in.')
          setAuthLoading(false)
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: formEmail.trim(), password: formPassword })
        if (error) throw error
        setAuthMode(null)
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Sign-in failed. Please try again.')
      setAuthLoading(false)
    }
  }
  function changeFile(event: ChangeEvent<HTMLInputElement>, target: 'post' | 'chat') {
    const file = event.target.files?.[0]
    if (!file) return
    if (target === 'post') {
      const imageType = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)
      const videoType = ['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type)
      if (!imageType && !videoType) {
        notify('Choose a JPG, PNG, WebP, GIF, MP4, WebM, or MOV file for your moment.')
        event.target.value = ''
        return
      }
      if (file.size > (videoType ? 50 : 5) * 1024 * 1024) {
        notify(videoType ? 'Videos must be 50 MB or smaller.' : 'Moment images must be 5 MB or smaller.')
        event.target.value = ''
        return
      }
      setNewPostFile(file)
      setRemoveEditingPostImage(false)
      if (videoType) {
        setNewPostImage(URL.createObjectURL(file))
      } else {
        const reader = new FileReader()
        reader.onload = () => setNewPostImage(String(reader.result))
        reader.readAsDataURL(file)
      }
    } else sendMessage('', file.name)
    event.target.value = ''
  }
  async function toggleRecording() {
    if (isRecording && recorder.current) {
      recorder.current.stop()
      setIsRecording(false)
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      notify('Voice notes are not supported by this browser.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const media = new MediaRecorder(stream)
      const chunks: BlobPart[] = []
      media.ondataavailable = (event) => chunks.push(event.data)
      media.onstop = () => {
        const voice = new File([new Blob(chunks, { type: media.mimeType })], 'Voice note', { type: media.mimeType })
        sendMessage('🎙️ Voice note', voice.name)
        stream.getTracks().forEach((track) => track.stop())
      }
      recorder.current = media
      media.start()
      setIsRecording(true)
    } catch {
      notify('Microphone access was not granted. Check your browser permissions and try again.')
    }
  }
  async function startCall(type: CallMode) {
    if (!hasSelectedContact) {
      notify('Choose a conversation before starting a call.')
      return
    }
    if (!account) return
    const person = otherUsers.find((user) => user.id === selectedChat)
    if (!person) {
      notify('This member is no longer available.')
      return
    }
    try {
      const conversationId = activeConversation?.id ?? await openConversation(person.id)
      if (!activeConversation) {
        setConversations((current) => current.some((item) => item.id === conversationId)
          ? current
          : [...current, { id: conversationId, userId: person.id, messages: [] }])
      }
      await callControls.startCall(
        { id: conversationId, userId: person.id },
        { id: person.id, name: person.name, avatar: person.avatar },
        type,
      )
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not start the call.')
    }
  }
  async function startGroupCall(peerIds: string[], mode: CallMode) {
    if (!account) return
    const invitees = otherUsers.filter((person) => peerIds.includes(person.id)).slice(0, 7)
    if (invitees.length === 0) {
      notify('Choose at least one person to invite.')
      return
    }
    try {
      const groupInvitees = await Promise.all(invitees.map(async (person) => {
        const existing = conversations.find((conversation) => conversation.userId === person.id)
        const conversation = existing ?? {
          id: await openConversation(person.id),
          userId: person.id,
          messages: [],
        }
        return {
          peer: { id: person.id, name: person.name, avatar: person.avatar },
          conversation: { id: conversation.id, userId: person.id },
        }
      }))
      setConversations((current) => {
        const next = [...current]
        for (const invitee of groupInvitees) {
          if (!next.some((conversation) => conversation.id === invitee.conversation.id)) {
            next.push({ ...invitee.conversation, messages: [] })
          }
        }
        return next
      })
      await callControls.startGroupCall(groupInvitees, mode)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not start the group call.')
    }
  }
  async function saveMemberProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') ?? '').trim()
    const city = String(form.get('city') ?? '').trim()
    const bio = String(form.get('bio') ?? '').trim()
    if (!name || !city || !account || profileSaving) return
    setProfileSaving(true)
    try {
      await saveProfile(account.id, { full_name: name, username: account.handle, city, bio })
      const updated = { ...account, name, city, bio }
      setAccount(updated)
      setUsers((current) => current.map((user) => user.id === account.id ? { ...user, name, city, bio } : user))
      const avatar = profilePhoto ? await saveAvatar(account.id, profilePhoto) : account.avatar
      setAccount({ ...updated, avatar })
      setUsers((current) => current.map((user) => user.id === account.id ? { ...user, name, city, bio, avatar } : user))
      setProfilePhoto(null)
      setProfilePhotoPreview('')
      setShowProfileEditor(false)
      notify('Your profile is looking lovely ✨')
    } catch (error) {
      notify(profilePhoto ? explainAvatarUploadError(error) : explainSupabaseError(error))
    } finally {
      setProfileSaving(false)
    }
  }
  function selectProfilePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      notify('Choose a JPG, PNG, WebP, or GIF image for your profile picture.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      notify('Profile pictures must be 5 MB or smaller.')
      return
    }
    setProfilePhoto(file)
    setProfilePhotoPreview(URL.createObjectURL(file))
  }
  const updateProfile = saveMemberProfile
  async function startConversation(personId: string) {
    if (!account) return
    setSelectedChat(personId)
    setSection('messages')
    setQuery('')
    const existing = conversations.find((conversation) => conversation.userId === personId)
    if (existing) return
    try {
      const id = await openConversation(personId)
      setConversations((current) => current.some((conversation) => conversation.id === id)
        ? current
        : [...current, { id, userId: personId, messages: [] }])
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not start this conversation.')
      setSelectedChat('')
    }
  }
  async function signOut() {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) notify(error.message)
    else {
      setShowSettings(false)
      notify('You’ve signed out safely.')
    }
  }
  const filteredUsers = otherUsers.filter((user) => `${user.name} ${user.handle}`.toLowerCase().includes(query.toLowerCase()))
  const communityPosts = posts.filter((post) => post.userId === account?.id || otherUsers.some((user) => user.id === post.userId))
  const visiblePosts = section === 'saved' ? communityPosts.filter((post) => post.saved) : section === 'home' || section === 'explore' ? communityPosts : communityPosts.filter((post) => post.userId === account?.id || follows.includes(post.userId))
  const ownStatuses = statuses.filter((status) => status.user_id === account?.id)
  const statusAuthors = [...new Set(statuses.map((status) => status.user_id))]
    .filter((userId) => userId === account?.id || otherUsers.some((user) => user.id === userId))
  const chatWallpaper = wallpaper === 'none' ? '' : wallpaper === 'lavender' ? 'wall-lavender' : wallpaper === 'sunset' ? 'wall-sunset' : 'wall-mist'
  const routeFrameProps = {
    onNavigate: (nextSection: RouteSection) => setSection(nextSection),
    onSettings: () => { setSection('home'); setShowSettings(true) },
    onEditProfile: () => { setSection('home'); setShowProfileEditor(true) },
    onSignOut: () => { void signOut() },
  }
  const postToShare = posts.find((post) => post.id === sharePostId)
  const editingPost = posts.find((post) => post.id === editingPostId)
  const previewIsVideo = Boolean(
    !removeEditingPostImage
    && (newPostFile?.type.startsWith('video/') || (!newPostFile && editingPost?.video)),
  )

  if (authLoading) return <main className="auth-loading"><span className="brand-mark">i</span><strong>Finding your place...</strong></main>

  if (!account) return (
    <main className="welcome-screen">
      <div className="welcome-art"><span className="welcome-orbit orbit-a" /><span className="welcome-orbit orbit-b" /><div className="welcome-copy"><span className="brand-mark large">i</span><p className="eyebrow">A LITTLE CLOSER, EVERY DAY</p><h1>Good things<br />happen <em>together.</em></h1><p>A place to find your people, share your world, and feel a little more at home.</p><div className="welcome-faces">{initialUsers.slice(1, 5).map((user) => <img key={user.id} src={user.avatar} alt="" />)}<span>Made for us, in Rwanda 🇷🇼</span></div></div><div className="welcome-photo" /></div>
      <div className="welcome-form"><span className="brand-word"><span className="brand-mark">i</span> inzu</span><div className="auth-heading"><span className="eyebrow">{authMode === 'register' ? 'YOUR PEOPLE ARE HERE' : 'A WARM WELCOME AWAITS'}</span><h2>{authMode === 'register' ? t.register : t.welcome}</h2><p>{authMode === 'register' ? 'Make a little space for the people who make life brighter.' : 'Come on in. Your community has been waiting.'}</p></div>{!isSupabaseConfigured && <div className="backend-notice"><strong>One quick setup before you join</strong><span>Connect the app to your Supabase project. The README has the setup steps; then registration, discovery, and chat will work across devices.</span></div>}<form onSubmit={authenticate} className="auth-form">{authMode === 'register' && <label>{t.fullName}<input value={formName} onChange={(event) => setFormName(event.target.value)} placeholder="e.g. Aline Mukamana" autoComplete="name" required /></label>}<label>{t.email}<input value={formEmail} onChange={(event) => setFormEmail(event.target.value)} placeholder="you@example.com" type="email" autoComplete="email" required /></label><label>{t.password}<input value={formPassword} onChange={(event) => setFormPassword(event.target.value)} placeholder="At least 6 characters" type="password" autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} required minLength={6} /></label>{authError && <div className="auth-error">{authError}</div>}<button className="primary-button full-button" disabled={authLoading}>{authLoading ? 'Connecting…' : authMode === 'register' ? t.signUp : t.signIn}<ArrowRight size={16} /></button></form><p className="auth-switch">{authMode === 'register' ? 'Already have an account?' : 'New around here?'} <button onClick={() => { setAuthMode(authMode === 'register' ? 'signin' : 'register'); setAuthError('') }}>{authMode === 'register' ? t.signIn : t.signUp}</button></p><div className="welcome-foot"><Globe2 size={14} /> A kinder corner of the internet, wherever you are.</div></div>
    </main>
  )

  if (section === 'explore') {
    return <>
      <DiscoverRoute me={me} people={otherUsers} follows={follows} theme={theme} darkMode={darkMode} query={query} onQueryChange={setQuery} onFollow={(id) => { void toggleFollow(id) }} onChat={(id) => { void startConversation(id) }} onOpenProfile={setActiveProfile} {...routeFrameProps} />
      {callControls.call && <CallOverlay call={callControls.call} onAccept={() => { void callControls.acceptCall() }} onEnd={() => { void callControls.endCall() }} onToggleMicrophone={callControls.toggleMicrophone} onToggleCamera={callControls.toggleCamera} onSendGift={(gift) => { void callControls.sendGift(gift) }} />}
      {toast && <div className="toast-message"><span className="toast-check"><Check size={14} /></span>{toast}</div>}
    </>
  }

  if (section === 'messages') {
    return <>
      <MessagesRoute
        me={me}
        people={otherUsers}
        conversations={conversations}
        selectedChat={selectedChat}
        query={query}
        draft={chatText}
        recording={isRecording}
        wallpaper={wallpaper}
        theme={theme}
        darkMode={darkMode}
        peerTyping={peerTyping}
        onQueryChange={setQuery}
        onSelect={(id) => { void startConversation(id) }}
        onDraftChange={setChatText}
        onSend={(text, attachment) => { void sendMessage(text, attachment) }}
        onAttach={(file) => { void sendMessage('', file.name) }}
        onRecord={() => { void toggleRecording() }}
        onVoiceCall={() => { void startCall('voice') }}
        onVideoCall={() => { void startCall('video') }}
        onGroupCall={(peerIds, mode) => { void startGroupCall(peerIds, mode) }}
        onAIDraft={(contactName, messages) => draftChatReply(contactName, messages)}
        onEditMessage={updateMessage}
        onTyping={updateTypingStatus}
        onOpenPost={openPost}
        onOpenProfile={setActiveProfile}
        {...routeFrameProps}
      />
      {callControls.call && <CallOverlay call={callControls.call} onAccept={() => { void callControls.acceptCall() }} onEnd={() => { void callControls.endCall() }} onToggleMicrophone={callControls.toggleMicrophone} onToggleCamera={callControls.toggleCamera} onSendGift={(gift) => { void callControls.sendGift(gift) }} />}
      {toast && <div className="toast-message"><span className="toast-check"><Check size={14} /></span>{toast}</div>}
    </>
  }

  if (section === 'marketplace') {
    return <>
      <MarketplaceRoute
        me={me}
        theme={theme}
        darkMode={darkMode}
        query={query}
        onQueryChange={setQuery}
        onContact={(sellerId) => { void startConversation(sellerId) }}
        onNotify={notify}
        {...routeFrameProps}
      />
      {callControls.call && <CallOverlay call={callControls.call} onAccept={() => { void callControls.acceptCall() }} onEnd={() => { void callControls.endCall() }} onToggleMicrophone={callControls.toggleMicrophone} onToggleCamera={callControls.toggleCamera} onSendGift={(gift) => { void callControls.sendGift(gift) }} />}
      {toast && <div className="toast-message"><span className="toast-check"><Check size={14} /></span>{toast}</div>}
    </>
  }

  if (section === 'news') {
    return <>
      <NewsVideoRoute
        me={me}
        people={otherUsers}
        posts={communityPosts}
        news={rwandaNews}
        newsLoading={newsLoading}
        newsError={newsError}
        query={query}
        theme={theme}
        darkMode={darkMode}
        onRefreshNews={() => { void refreshRwandaHeadlines() }}
        commentsOpenId={commentsOpenId}
        commentsByPost={commentsByPost}
        commentDraft={commentDraft}
        commentLoadingId={commentLoadingId}
        onQueryChange={setQuery}
        onLike={(id) => { void likePost(id) }}
        onToggleComments={(id) => { void toggleComments(id) }}
        onCommentDraftChange={setCommentDraft}
        onComment={(id, event) => { void submitPostComment(id, event) }}
        onRepost={(id) => { void toggleRepost(id) }}
        onShare={(id) => setSharePostId(id)}
        onSave={(id) => setPosts((current) => current.map((post) => post.id === id ? { ...post, saved: !post.saved } : post))}
        onEdit={(post) => { setSection('home'); beginEditPost(post) }}
        onDelete={(id) => { setSection('home'); setDeletePostId(id) }}
        onOpenPost={openPost}
        onOpenProfile={setActiveProfile}
        {...routeFrameProps}
      />
      {callControls.call && <CallOverlay call={callControls.call} onAccept={() => { void callControls.acceptCall() }} onEnd={() => { void callControls.endCall() }} onToggleMicrophone={callControls.toggleMicrophone} onToggleCamera={callControls.toggleCamera} onSendGift={(gift) => { void callControls.sendGift(gift) }} />}
      {toast && <div className="toast-message"><span className="toast-check"><Check size={14} /></span>{toast}</div>}
      {showNotifications && <NotificationPanel notifications={notifications} onClose={() => setShowNotifications(false)} onOpen={(notification) => { void openNotification(notification) }} />}
      {sharePostId && postToShare && <SharePostModal people={otherUsers} post={postToShare} onClose={() => setSharePostId(null)} onShare={(recipientIds) => sharePostWithPeople(postToShare.id, recipientIds)} />}
      {showProfileEditor && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowProfileEditor(false) }}><form className="modal-card profile-edit-modal" onSubmit={updateProfile}><div className="modal-heading"><div><span className="eyebrow">A LITTLE MORE YOU</span><h2>Edit your profile</h2></div><button type="button" className="soft-icon" onClick={() => setShowProfileEditor(false)} aria-label="Close"><X size={19} /></button></div><input ref={profilePhotoInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={selectProfilePhoto} /><div className="avatar-edit-row"><img src={profilePhotoPreview || me.avatar} alt="Profile picture preview" /><div><strong>Profile picture</strong><small>JPG, PNG, WebP, or GIF · up to 5 MB</small><button type="button" className="add-photo-button" onClick={() => profilePhotoInput.current?.click()}><Camera size={15} /> Choose a photo</button></div></div><label className="edit-field">Your name<input name="name" defaultValue={me.name} required maxLength={50} /></label><label className="edit-field">Where you call home<input name="city" defaultValue={me.city} required maxLength={80} /></label><label className="edit-field">A little about you<textarea name="bio" defaultValue={me.bio} rows={3} maxLength={180} /></label><div className="edit-profile-actions"><button type="button" className="outline-button" onClick={() => { setProfilePhoto(null); setProfilePhotoPreview(''); setShowProfileEditor(false) }}>Cancel</button><button className="primary-button" disabled={profileSaving}>{profileSaving ? 'Saving…' : <><Check size={15} /> Save changes</>}</button></div></form></div>}
    </>
  }

  if (section === 'books') {
    return <>
      <BooksRoute
        me={me}
        theme={theme}
        darkMode={darkMode}
        savedBooks={savedBooks}
        onToggleSaved={toggleSavedBook}
        {...routeFrameProps}
      />
      {callControls.call && <CallOverlay call={callControls.call} onAccept={() => { void callControls.acceptCall() }} onEnd={() => { void callControls.endCall() }} onToggleMicrophone={callControls.toggleMicrophone} onToggleCamera={callControls.toggleCamera} onSendGift={(gift) => { void callControls.sendGift(gift) }} />}
      {toast && <div className="toast-message"><span className="toast-check"><Check size={14} /></span>{toast}</div>}
    </>
  }

  return (
    <div className={`app-shell theme-${theme} ${darkMode ? 'dark-mode' : ''}`}>
      <aside className="sidebar">
        <button className="brand-lockup" onClick={() => setSection('home')} aria-label="Inzu home"><span className="brand-mark">i</span><span>inzu<span className="brand-period">.</span><small>YOUR WORLD, TOGETHER</small></span></button>
        <button className="profile-switcher" onClick={() => setActiveProfile('maya')}><img src={me.avatar} alt="" /><span className="profile-switch-copy"><strong>{me.name}</strong><small>@{me.handle}</small></span><ChevronDown size={16} /></button>
        <div className="side-label">YOUR SPACE</div>
        <nav className="main-nav">
          <button className={section === 'home' ? 'active' : ''} onClick={() => setSection('home')}><Compass size={18} /><span>{t.home}</span><span className="nav-dot" /></button>
          <button className={section === 'explore' ? 'active' : ''} onClick={() => setSection('explore')}><Sparkles size={18} /><span>{t.explore}</span></button>
          <button className={section === 'news' ? 'active' : ''} onClick={() => setSection('news')}><Newspaper size={18} /><span>News &amp; video</span></button>
          <button className={section === 'marketplace' ? 'active' : ''} onClick={() => setSection('marketplace')}><Store size={18} /><span>Marketplace</span></button>
          <button className={section === 'books' ? 'active' : ''} onClick={() => setSection('books')}><Library size={18} /><span>Read books</span></button>
          <button className={section === 'messages' ? 'active' : ''} onClick={() => setSection('messages')}><MessageCircle size={18} /><span>{t.messages}</span><span className="nav-count">2</span></button>
          <button className={section === 'saved' ? 'active' : ''} onClick={() => setSection('saved')}><Bookmark size={18} /><span>{t.saved}</span></button>
        </nav>
        <div className="side-label circles-label">YOUR CIRCLES <button title="Find people" onClick={() => setSection('explore')}><Plus size={14} /></button></div>
        <div className="circle-list">{otherUsers.slice(0, 4).map((user) => <button key={user.id} className="circle-person" onClick={() => setActiveProfile(user.id)}><span className="avatar-wrap"><img src={user.avatar} alt="" />{user.online && <i />}</span><span>{user.name.split(' ')[0]}</span>{follows.includes(user.id) && <span className="circle-check"><Check size={11} /></span>}</button>)}</div>
        <div className="sidebar-bottom"><div className="local-note"><span className="local-note-icon"><Sparkles size={16} /></span><div><strong>A little more you.</strong><small>Make this space yours.</small></div><ChevronRight size={15} /></div><button className="side-settings" onClick={() => setShowProfileEditor(true)}><PenLine size={17} />Edit profile</button><button className="side-settings" onClick={() => setShowSettings(true)}><Settings size={17} />{t.settings}</button><button className="side-settings sign-out" onClick={() => { void signOut() }}><LogOut size={17} />{t.logout}</button></div>
      </aside>

      <main className="main-column">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark">i</span> inzu</div>
          <div className="search-box"><Search size={17} /><input aria-label="Search people and posts" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search} />{query && <button aria-label="Clear search" onClick={() => setQuery('')}><X size={15} /></button>}<kbd>⌘ K</kbd></div>
          <div className="topbar-actions">
            <button className="icon-button language-button" onClick={() => setShowSettings(true)} title="Language"><Languages size={18} /><span>{language.toUpperCase()}</span></button>
            <button className="icon-button notification-button" onClick={() => setShowNotifications(!showNotifications)} aria-label={`Notifications${unreadNotifications ? `, ${unreadNotifications} unread` : ''}`}><Bell size={19} />{unreadNotifications > 0 && <span className="notification-count">{unreadNotifications > 99 ? '99+' : unreadNotifications}</span>}</button>
            <button className="top-avatar" onClick={() => setShowProfileEditor(true)} aria-label="Edit your profile"><img src={me.avatar} alt={me.name} /></button>
          </div>
        </header>
        {section === 'messages' ?         <section className="messages-view"><div className="messages-list"><div className="view-heading"><div><span className="eyebrow">YOUR LITTLE CORNER</span><h1>{t.messages}</h1></div><button className="soft-icon" onClick={() => setSection('explore')} title="Start a conversation"><PenLine size={17} /></button></div><div className="chat-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a conversation..." /></div>{filteredUsers.map((user) => { const last = conversations.find((item) => item.userId === user.id)?.messages.at(-1); return <button key={user.id} className={`conversation-row ${selectedChat === user.id ? 'selected' : ''}`} onClick={() => setSelectedChat(user.id)}><span className="avatar-wrap"><img src={user.avatar} alt="" />{user.online && <i />}</span><span className="conversation-info"><strong>{user.name}<time>{last?.time ?? 'New'}</time></strong><small>{last?.text ?? 'Say hello and start a conversation'}{last?.attachment && <span className="attachment-label"> · {last.attachment}</span>}</small></span>{user.online && <span className="conversation-unread" />}</button> })}</div><div className={`chat-panel ${chatWallpaper}`}><div className="chat-header"><button className="back-button" onClick={() => setSelectedChat('')} aria-label="Back"><ArrowLeft size={18} /></button><button className="chat-contact" onClick={() => setActiveProfile(currentUser.id)}><span className="avatar-wrap"><img src={currentUser.avatar} alt="" /><i /></span><span><strong>{currentUser.name}</strong><small><span className="online-pulse" />{t.online}</small></span></button><div className="chat-actions"><button className="soft-icon" title="Voice call" onClick={() => startCall('voice')}><Phone size={17} /></button><button className="soft-icon" title="Video call" onClick={() => startCall('video')}><Video size={18} /></button><button className="soft-icon" title="Chat settings" onClick={() => setShowSettings(true)}><Ellipsis size={19} /></button></div></div><div className="chat-day"><span>TODAY</span></div><div className="message-list">{currentConversation.length === 0 && <div className="conversation-start"><span>👋</span><strong>Say hello to {currentUser.name.split(' ')[0]}</strong><small>A new conversation is a lovely place to start.</small><button onClick={() => setChatText(`Hi ${currentUser.name.split(' ')[0]}! `)}>Send a little hello</button></div>}{currentConversation.map((message) => <div key={message.id} className={`message-row ${message.from === 'maya' ? 'mine' : ''}`}>{message.from !== 'maya' && <img className="message-avatar" src={currentUser.avatar} alt="" />}<div className="message-content"><div className="message-bubble">{message.statusReplyContent && <div className="status-reply-quote"><Clock3 size={13} /><span>Replying to status: {message.statusReplyContent}</span></div>}{message.text && <p>{message.text}</p>}{message.attachment && <div className="message-attachment"><AudioLines size={17} /><span>{message.attachment}</span><button title="Play voice note" onClick={() => notify('Voice notes are saved to this conversation.')}>▶</button></div>}</div><small className="message-time">{message.time}{message.from === 'maya' && <CheckCheck size={14} />}</small></div></div>)}</div><div className="chat-composer"><div className="composer-tools"><input ref={chatFileInput} type="file" hidden onChange={(event) => changeFile(event, 'chat')} /><button className="soft-icon" title="Attach a file" onClick={() => chatFileInput.current?.click()}><Paperclip size={17} /></button><button className={`soft-icon ${isRecording ? 'recording' : ''}`} title={isRecording ? 'Stop voice note' : 'Record a voice note'} onClick={toggleRecording}>{isRecording ? <MicOff size={17} /> : <Mic size={17} />}</button><button className="soft-icon emoji-tool" title="Add a smile" onClick={() => setChatText((text) => text + ' 😊')}><Smile size={17} /></button></div><input value={chatText} onChange={(event) => setChatText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage() } }} placeholder={isRecording ? 'Recording… tap the microphone when you’re done' : t.send} aria-label="Write a message" /><button className="send-button" onClick={() => sendMessage()} disabled={!chatText.trim()} aria-label="Send message"><Send size={17} /></button></div></div></section> : <div className="feed-layout"><section className="feed-column"><div className="greeting-row"><div><span className="eyebrow">{new Date().toLocaleDateString(language === 'rw' ? 'rw-RW' : language === 'fr' ? 'fr-FR' : language === 'sw' ? 'sw-KE' : 'en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}</span><h1>{t.welcome.split(' ')[0]}, {me.name.split(' ')[0]} <span className="wave">✳</span></h1><p>There’s always something good happening around you.</p></div><button className="primary-button write-post" onClick={() => setShowPost(true)}><Plus size={17} /> Create post</button></div>
          <div className="stories-strip"><div className="stories-heading"><span>{t.stories}</span><button onClick={() => setShowStatusComposer(true)}><Plus size={14} /> {t.addStatus}</button></div><div className="story-list">
            <button className="story-item your-story" onClick={() => ownStatuses[0] ? openMemberStatus(ownStatuses[0]) : setShowStatusComposer(true)} aria-label={ownStatuses.length ? `View your ${ownStatuses.length} active statuses` : 'Add a status'}>
              <span className="story-ring own-ring"><img src={me.avatar} alt="" /><i><Plus size={13} /></i></span><span>{ownStatuses.length ? t.yourStatus : t.addStatus}</span>
            </button>
            {statusAuthors.filter((userId) => userId !== account.id).map((userId) => {
              const user = otherUsers.find((item) => item.id === userId)
              const memberStatuses = statuses.filter((status) => status.user_id === userId)
              if (!user || memberStatuses.length === 0) return null
              const unseen = memberStatuses.some((status) => !status.viewed)
              return <button key={userId} className="story-item" onClick={() => openMemberStatus(memberStatuses.find((status) => !status.viewed) ?? memberStatuses[0])} aria-label={`View ${user.name}'s status`}>
                <span className={`story-ring ${unseen ? 'unseen' : ''}`}><img src={user.avatar} alt="" /><i className={user.online ? 'story-online' : ''} /></span><span>{user.name.split(' ')[0]}</span>
              </button>
            })}
            {statusAuthors.length === 0 && <p className="stories-empty">Share a status to let your followers know what’s new.</p>}
          </div></div>
          {section === 'explore' && <div className="explore-banner"><div className="explore-icon"><Sparkles size={20} /></div><div><strong>Good people, right around you.</strong><p>Meet someone new today. Kigali has more stories than you think.</p></div><button onClick={() => setQuery('')}>Meet your neighbours <ArrowRight size={15} /></button></div>}
          <div className="feed-tabs"><button className="active" onClick={() => setSection('home')}>{t.forYou}</button><button onClick={() => setSection('following')}>{t.following}</button><span className="feed-filter"><Sparkles size={14} /> A little inspiration</span></div>
          <button className="quick-composer" onClick={beginCreatePost}><img src={me.avatar} alt="" /><span>{t.createPost}</span><span className="quick-image"><ImagePlus size={18} /></span><span className="quick-label">Add a photo</span></button>
          {visiblePosts.filter((post) => { const author = post.userId === 'maya' ? me : users.find((user) => user.id === post.userId); return !query || `${author?.name} ${post.text}`.toLowerCase().includes(query.toLowerCase()) }).map((post) => {
            const author = post.userId === account.id ? me : users.find((user) => user.id === post.userId) ?? otherUsers[0]
            return <PostCard
              key={post.id}
              post={post}
              author={author}
              focused={activePostId === post.id}
              isMine={post.userId === account.id}
              commentsOpen={commentsOpenId === post.id}
              comments={commentsByPost[post.id] ?? []}
              commentDraft={commentDraft}
              commentLoading={commentLoadingId === post.id}
              onOpenAuthor={() => setActiveProfile(author.id)}
              onLike={() => { void likePost(post.id) }}
              onToggleComments={() => { void toggleComments(post.id) }}
              onCommentDraftChange={setCommentDraft}
              onComment={(event) => { void submitPostComment(post.id, event) }}
              onRepost={() => { void toggleRepost(post.id) }}
              onShare={() => setSharePostId(post.id)}
              onSave={() => setPosts((current) => current.map((item) => item.id === post.id ? { ...item, saved: !item.saved } : item))}
              onOpenPost={openPost}
              onEdit={() => beginEditPost(post)}
              onDelete={() => setDeletePostId(post.id)}
            />
          })}{visiblePosts.length === 0 && <div className="empty-state"><Bookmark size={24} /><strong>A little room for something lovely.</strong><p>Posts you save will find a home here.</p></div>}</section>
          <aside className="right-rail">
            <section className="rail-card people-card"><div className="rail-heading"><div><span className="eyebrow">MEET YOUR NEIGHBOURS</span><h3>{t.suggestions}</h3></div><button onClick={() => setSection('explore')} aria-label="See all people"><ArrowRight size={16} /></button></div><div className="people-list">{otherUsers.filter((user) => !follows.includes(user.id)).slice(0, 4).map((user) => <div className="person-row" key={user.id}><button className="person-info" onClick={() => setActiveProfile(user.id)}><span className="avatar-wrap"><img src={user.avatar} alt="" />{user.online && <i />}</span><span><strong>{user.name}</strong><small>{user.city.split(',')[0]} · Suggested</small></span></button><button className="follow-button" onClick={() => { void toggleFollow(user.id) }}><UserPlus size={16} /></button></div>)}{otherUsers.every((user) => follows.includes(user.id)) && <div className="all-followed"><span>✳</span><strong>You know everyone!</strong><small>Share this space with a friend.</small></div>}</div><button className="rail-link" onClick={() => setSection('explore')}>{t.seeAll} <ArrowRight size={14} /></button></section>
            <TrendingAndNews
              topics={trendingTopics}
              news={rwandaNews}
              topicsLoading={trendsLoading}
              newsLoading={newsLoading}
              topicsError={trendsError}
              newsError={newsError}
              onSelectTag={(tag) => { setQuery(tag); setSection('home') }}
            />
            <div className="daily-note"><span className="note-sparkle">✳</span><span className="eyebrow">A THOUGHT FOR TODAY</span><p>“Alone we can do so little; together we can do so much.”</p><small>— Helen Keller</small></div>
          </aside></div>}
      </main>
      {showNotifications && <NotificationPanel
        notifications={notifications}
        onClose={() => setShowNotifications(false)}
        onOpen={(notification) => { void openNotification(notification) }}
      />}
      {sharePostId && postToShare && <SharePostModal
        people={otherUsers}
        post={postToShare}
        onClose={() => setSharePostId(null)}
        onShare={(recipientIds) => sharePostWithPeople(postToShare.id, recipientIds)}
      />}
      {deletePostId && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !postDeleting) setDeletePostId(null) }}>
        <section className="modal-card delete-post-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-post-title" aria-describedby="delete-post-description">
          <div className="delete-post-icon"><Trash2 size={19} /></div>
          <h2 id="delete-post-title">Delete this moment?</h2>
          <p id="delete-post-description">This will remove your post and its comments from Inzu. This can’t be undone.</p>
          <div className="edit-profile-actions">
            <button type="button" className="outline-button" disabled={postDeleting} onClick={() => setDeletePostId(null)}>Keep post</button>
            <button type="button" className="delete-post-confirm" disabled={postDeleting} onClick={() => { void confirmDeletePost() }}><Trash2 size={14} />{postDeleting ? 'Deleting…' : 'Delete moment'}</button>
          </div>
        </section>
      </div>}
      {showStatusComposer && <StatusComposer me={me} saving={statusSaving} copy={statusTranslations[language]} onClose={() => setShowStatusComposer(false)} onSubmit={publishStatus} />}
      {activeStatusId && account && <StatusViewer
        statuses={statuses}
        statusId={activeStatusId}
        viewerId={account.id}
        copy={statusTranslations[language]}
        onClose={() => setActiveStatusId(null)}
        onSelect={openMemberStatus}
        onReact={(status, emoji) => { void reactToStatus(status, emoji) }}
        onReply={replyToMemberStatus}
      />}
      {showProfileEditor && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowProfileEditor(false) }}><form className="modal-card profile-edit-modal" onSubmit={updateProfile}><div className="modal-heading"><div><span className="eyebrow">A LITTLE MORE YOU</span><h2>Edit your profile</h2></div><button type="button" className="soft-icon" onClick={() => setShowProfileEditor(false)} aria-label="Close"><X size={19} /></button></div><input ref={profilePhotoInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={selectProfilePhoto} /><div className="avatar-edit-row"><img src={profilePhotoPreview || me.avatar} alt="Profile picture preview" /><div><strong>Profile picture</strong><small>JPG, PNG, WebP, or GIF · up to 5 MB</small><button type="button" className="add-photo-button" onClick={() => profilePhotoInput.current?.click()}><Camera size={15} /> Choose a photo</button></div></div><label className="edit-field">Your name<input name="name" defaultValue={me.name} required maxLength={50} /></label><label className="edit-field">Where you call home<input name="city" defaultValue={me.city} required maxLength={80} /></label><label className="edit-field">A little about you<textarea name="bio" defaultValue={me.bio} rows={3} maxLength={180} /></label><div className="edit-profile-actions"><button type="button" className="outline-button" onClick={() => { setProfilePhoto(null); setProfilePhotoPreview(''); setShowProfileEditor(false) }}>Cancel</button><button className="primary-button" disabled={profileSaving}>{profileSaving ? 'Saving…' : <><Check size={15} /> Save changes</>}</button></div></form></div>}
      <nav className="mobile-nav"><button className={section === 'home' ? 'active' : ''} onClick={() => setSection('home')}><Compass size={20} /><span>Home</span></button><button className={section === 'explore' ? 'active' : ''} onClick={() => setSection('explore')}><Sparkles size={20} /><span>Explore</span></button><button className="mobile-create" onClick={beginCreatePost}><Plus size={21} /></button><button className={section === 'news' ? 'active' : ''} onClick={() => setSection('news')}><Newspaper size={20} /><span>News</span></button><button className={section === 'marketplace' ? 'active' : ''} onClick={() => setSection('marketplace')}><Store size={20} /><span>Market</span></button><button className={section === 'books' ? 'active' : ''} onClick={() => setSection('books')}><Library size={20} /><span>Books</span></button><button className={section === 'messages' ? 'active' : ''} onClick={() => setSection('messages')}><MessageCircle size={20} /><span>Chat</span></button><button onClick={() => { void signOut() }}><LogOut size={20} /><span>Sign out</span></button></nav>
      {toast && <div className="toast-message"><span className="toast-check"><Check size={14} /></span>{toast}</div>}
      {showPost && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closePostEditor() }}>
        <form className="modal-card post-modal" onSubmit={createPost}>
          <div className="modal-heading"><div><span className="eyebrow">{editingPostId ? 'MAKE IT JUST RIGHT' : 'YOUR WORLD, YOUR WORDS'}</span><h2>{editingPostId ? 'Edit your moment' : t.newPost}</h2></div><button type="button" className="soft-icon" onClick={closePostEditor} aria-label="Close"><X size={19} /></button></div>
          <div className="modal-author"><img src={me.avatar} alt="" /><strong>{me.name}</strong><span>· Everyone</span></div>
          <textarea autoFocus value={postText} onChange={(event) => setPostText(event.target.value)} placeholder="A thought, a little win, a view you love..." rows={5} />
          {newPostImage && <div className={`image-preview-wrap ${previewIsVideo ? 'video-preview-wrap' : ''}`}>
            {previewIsVideo ? <video src={newPostImage} controls muted playsInline aria-label="Video moment preview" /> : <img src={newPostImage} alt="Moment image preview" />}
            <button type="button" onClick={() => { setNewPostImage(undefined); setRemoveEditingPostImage(Boolean(editingPostId)) }} aria-label="Remove media"><X size={16} /></button>
          </div>}
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(event) => changeFile(event, 'post')} />
          <input ref={videoFileInput} type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={(event) => changeFile(event, 'post')} />
          <div className="modal-footer">
            <div className="post-media-buttons">
              <button type="button" className="add-photo-button" onClick={() => fileInput.current?.click()}><ImagePlus size={16} />{editingPostId && newPostImage && !previewIsVideo ? 'Replace photo' : 'Add photo'}</button>
              <button type="button" className="add-photo-button" onClick={() => videoFileInput.current?.click()}><Film size={16} />{editingPostId && newPostImage && previewIsVideo ? 'Replace video' : 'Add video'}</button>
            </div>
            <span>Images ≤5 MB · videos ≤50 MB</span>
            <button className="primary-button" disabled={!postText.trim() && !newPostImage}><Send size={15} />{editingPostId ? 'Save changes' : t.share}</button>
          </div>
        </form>
      </div>}
      {showSettings && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowSettings(false) }}><div className="modal-card settings-modal"><div className="modal-heading"><div><span className="eyebrow">MAKE YOURSELF AT HOME</span><h2>{t.settings}</h2></div><button className="soft-icon" onClick={() => setShowSettings(false)} aria-label="Close"><X size={19} /></button></div><button className="settings-profile" onClick={() => { setShowSettings(false); setShowProfileEditor(true) }}><img src={me.avatar} alt="" /><span><strong>{me.name}</strong><small>Edit your profile</small></span><ChevronRight size={17} /></button>      <div className="setting-section"><div className="setting-label"><Palette size={16} /><span><strong>{t.appearance}</strong><small>A colour that feels like you</small></span></div><div className="theme-choices">{[['violet', 'Dreamy lilac'], ['rose', 'Warm rose'], ['ocean', 'Quiet ocean'], ['forest', 'Soft forest']].map(([value, name]) => <button key={value} className={`theme-choice ${theme === value ? 'chosen' : ''}`} onClick={() => setTheme(value)}><i className={`theme-swatch ${value}`} />{name}{theme === value && <Check size={14} />}</button>)}</div><button className={`dark-mode-choice ${darkMode ? 'enabled' : ''}`} onClick={() => setDarkMode(!darkMode)} aria-pressed={darkMode}><span className="dark-mode-icon">{darkMode ? <Moon size={16} /> : <Sun size={16} />}</span><span><strong>Dark mode</strong><small>{darkMode ? 'An easier view for low light' : 'Switch to a darker look'}</small></span><i className="dark-mode-switch"><b /></i></button></div><div className="setting-section"><label className="setting-label" htmlFor="language-choice"><Globe2 size={16} /><span><strong>{t.language}</strong><small>Choose the words that feel like home</small></span></label><select id="language-choice" value={language} onChange={(event) => setLanguage(event.target.value as Language)}><option value="en">English</option><option value="rw">Kinyarwanda</option><option value="fr">Français</option><option value="sw">Kiswahili</option></select></div><div className="setting-section"><div className="setting-label"><ImagePlus size={16} /><span><strong>{t.wallpaper}</strong><small>A lovely backdrop for your chats</small></span></div><div className="wallpaper-choices">{[['none', 'Plain'], ['lavender', 'Lavender'], ['sunset', 'Sunset'], ['mist', 'Morning mist']].map(([value, name]) => <button key={value} className={`wallpaper-choice ${value} ${wallpaper === value ? 'selected' : ''}`} onClick={() => setWallpaper(value)}><span>{wallpaper === value && <Check size={14} />}</span>{name}</button>)}</div></div><div className="settings-note"><CircleHelp size={15} /> Your personal touches are saved on this device.</div><button className="settings-signout" onClick={() => { void signOut() }}><LogOut size={16} /> Sign out of Inzu</button></div></div>}
      {activeProfile && viewedProfile && <div className="modal-backdrop profile-page-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveProfile(null) }}>
        <section className="modal-card profile-modal profile-page-modal" role="dialog" aria-modal="true" aria-label={`${viewedProfile.name}'s profile`}>
          <header className="profile-page-topbar">
            <button className="profile-page-back" onClick={() => setActiveProfile(null)} aria-label="Back"><ArrowLeft size={21} /></button>
            <div><strong>{viewedProfile.handle}</strong><small>{viewedProfilePosts.length} posts</small></div>
            <button className="soft-icon profile-page-close" onClick={() => setActiveProfile(null)} aria-label="Close profile"><X size={19} /></button>
          </header>
          <div className="profile-page-content">
            <section className="profile-page-overview">
              <div className="profile-page-summary">
                <img className="profile-page-avatar" src={viewedProfile.avatar} alt={`${viewedProfile.name}'s profile`} />
                <div className="profile-page-heading">
                  <h1>{viewedProfile.name}</h1>
                  <div className="profile-page-stats" aria-label="Profile statistics">
                    <span><strong>{profileCounts[viewedProfile.id]?.moments ?? viewedProfilePosts.length}</strong><small>posts</small></span>
                    <span><strong>{profileCounts[viewedProfile.id]?.followers ?? 0}</strong><small>followers</small></span>
                    <span><strong>{profileCounts[viewedProfile.id]?.following ?? 0}</strong><small>following</small></span>
                  </div>
                </div>
              </div>
              <div className="profile-page-bio">
                <strong>{viewedProfile.name}</strong>
                {viewedProfile.bio && <p>{viewedProfile.bio}</p>}
                {viewedProfile.city && <span>{viewedProfile.city}</span>}
              </div>
              {activeProfile !== 'maya' && <div className="profile-page-actions">
                <button className={`primary-button ${follows.includes(viewedProfile.id) ? 'followed-button' : ''}`} onClick={() => { void toggleFollow(viewedProfile.id) }}>
                  {follows.includes(viewedProfile.id) ? <Check size={16} /> : <UserPlus size={16} />}
                  {follows.includes(viewedProfile.id) ? 'Following' : 'Follow'}
                </button>
                <button className="outline-button" onClick={() => { void startConversation(viewedProfile.id); setActiveProfile(null) }}><MessageCircle size={16} /> Message</button>
              </div>}
            </section>
            <nav className="profile-page-tabs" aria-label="Profile posts">
              <button className={activeProfileTab === 'posts' ? 'active' : ''} aria-pressed={activeProfileTab === 'posts'} onClick={() => setActiveProfileTab('posts')}><Grid3X3 size={18} /><span>Posts</span></button>
              <button className={activeProfileTab === 'videos' ? 'active' : ''} aria-pressed={activeProfileTab === 'videos'} onClick={() => setActiveProfileTab('videos')}><Film size={18} /><span>Videos</span></button>
            </nav>
            {visibleProfilePosts.length > 0
              ? <div className="profile-post-grid">{visibleProfilePosts.map((post) => (
                <button key={post.id} className={`profile-post-tile ${post.image || post.video ? '' : 'text-post-tile'}`} onClick={() => { setActiveProfile(null); openPost(post.id) }} aria-label={`Open post: ${post.text || 'Photo or video'}`}>
                  {post.image
                    ? <img src={post.image} alt="" loading="lazy" />
                    : post.video
                      ? <video src={post.video} muted playsInline preload="metadata" />
                    : <span>{post.text}</span>}
                  {post.video && <span className="profile-video-mark"><Film size={17} /></span>}
                  <span className="profile-post-likes"><Heart size={14} /> {post.likes}</span>
                </button>
              ))}</div>
              : <div className="profile-post-empty"><Grid3X3 size={25} /><strong>{activeProfileTab === 'videos' ? 'No videos yet' : 'No posts yet'}</strong><p>{activeProfileTab === 'videos' ? 'Videos this person shares will appear here.' : 'Posts this person shares will appear here.'}</p></div>}
          </div>
        </section>
      </div>}
      {callControls.call && <CallOverlay call={callControls.call} onAccept={() => { void callControls.acceptCall() }} onEnd={() => { void callControls.endCall() }} onToggleMicrophone={callControls.toggleMicrophone} onToggleCamera={callControls.toggleCamera} onSendGift={(gift) => { void callControls.sendGift(gift) }} />}
    </div>
  )
}

export default App
