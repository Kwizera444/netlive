import { useEffect, useRef, useState, type ChangeEvent, type ComponentProps, type FormEvent, type ReactNode } from 'react'
import {
  ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, AudioLines, Bell, Bookmark, Camera,
  Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, Compass, Ellipsis,
  Globe2, Heart, ImagePlus, Languages, LogOut, MessageCircle, Mic,
  MicOff, Moon, MoreHorizontal, Palette, Paperclip, PenLine, Phone, PhoneOff, Plus, Search,
  Send, Settings, Smile, Sparkles, Sun, ThumbsUp, UserPlus, Users, Video, VideoOff,
  X,
} from 'lucide-react'
import {
  createPost as savePost, draftChatReply, explainAvatarUploadError, explainSupabaseError, isSupabaseConfigured,
  loadConversations, loadNotifications, loadPeople, loadPosts, loadProfile, loadProfileCounts, loadRwandaNews, loadTrendingTopics,
  markNotificationsRead, openConversation, sendChatMessage, setFollowing, subscribeToMessages,
  subscribeToConversations, subscribeToNotifications, supabase, togglePostLike, updateAvatar as saveAvatar,
  updateProfile as saveProfile,
  type AiChatMessage, type ChatMessage, type LoadedPost, type PostNotification, type Profile,
  type RwandaNews, type TrendingTopic,
} from './lib/supabase'
import { useWebRtcCalls, type ActiveCall, type CallMode, type CallPeer } from './hooks/useWebRtcCalls'
import './App.css'

type Language = 'en' | 'rw' | 'fr' | 'sw'
type User = { id: string; name: string; handle: string; city: string; bio: string; avatar: string; online?: boolean }
type Post = { id: string; userId: string; text: string; image?: string; time: string; likes: number; comments: number; liked?: boolean; saved?: boolean }
type Message = { id: string; from: string; text: string; time: string; attachment?: string }
type Conversation = { id: string; userId: string; messages: Message[] }
type Account = { id: string; name: string; email: string; handle: string; city: string; bio: string; avatar: string }

const photo = (id: string, width = 600) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=85`
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
  time: new Date(post.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }),
  likes: post.likes,
  comments: 0,
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
  call, onAccept, onEnd, onToggleMicrophone, onToggleCamera,
}: {
  call: ActiveCall
  onAccept: () => void
  onEnd: () => void
  onToggleMicrophone: () => void
  onToggleCamera: () => void
}) {
  const localVideo = useRef<HTMLVideoElement>(null)
  const remoteVideo = useRef<HTMLVideoElement>(null)
  const remoteAudio = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    if (localVideo.current) localVideo.current.srcObject = call.localStream
    if (remoteVideo.current) remoteVideo.current.srcObject = call.remoteStream
    if (remoteAudio.current) remoteAudio.current.srcObject = call.remoteStream
  }, [call.localStream, call.remoteStream])

  const status = call.phase === 'incoming'
    ? `Incoming ${call.mode} call`
    : call.phase === 'calling'
      ? 'Calling…'
      : call.phase === 'connecting'
        ? 'Connecting…'
        : 'Connected'
  return (
    <div className="call-backdrop">
      <section className={`call-window ${call.mode === 'voice' ? 'voice-call-window' : ''}`} role="dialog" aria-modal="true" aria-label={`${call.mode} call with ${call.peer.name}`}>
        <header className="call-window-header">
          <span><i className={`call-status-dot ${call.phase}`} />{status}</span>
          <button className="soft-icon" onClick={onEnd} aria-label="End call"><X size={18} /></button>
        </header>
        <div className={`call-video-stage ${call.mode}`}>
          {call.mode === 'video' && call.phase !== 'incoming'
            ? <>
              <video ref={remoteVideo} className="call-remote-video" autoPlay playsInline />
              <video ref={localVideo} className="call-local-video" autoPlay muted playsInline />
              {!call.remoteStream && <div className="call-waiting"><img src={call.peer.avatar} alt="" /><strong>{call.peer.name}</strong><span>{status}</span></div>}
            </>
            : <div className="call-avatar-stage"><span className="call-avatar-ring"><img src={call.peer.avatar} alt="" /></span><h2>{call.peer.name}</h2><p>{call.error || status}</p></div>}
          {call.mode === 'voice' && <audio ref={remoteAudio} autoPlay />}
          {call.error && <div className="call-error">{call.error}</div>}
        </div>
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
        <div className="trend-section-heading"><strong>Rwanda news</strong>{news && <a href={news.sourceUrl} target="_blank" rel="noreferrer">{news.source}</a>}</div>
        {newsLoading && !news && <p className="trend-state">Loading the latest headlines…</p>}
        {newsError && !news && <p className="trend-state trend-error">{newsError}</p>}
        {news?.items.map((item) => (
          <a className="news-item" key={item.url} href={item.url} target="_blank" rel="noreferrer">
            <strong>{item.title}</strong>
            <small>{Number.isNaN(Date.parse(item.publishedAt)) ? 'Latest report' : timeAgo(item.publishedAt)} <ArrowUpRight size={11} /></small>
          </a>
        ))}
        {news && news.items.length === 0 && <p className="trend-state">No recent headlines are available from {news.source}.</p>}
        {!newsLoading && newsError && news && <p className="trend-state trend-error">{newsError}</p>}
      </div>
      <div className="trend-foot"><span>Headlines via IGIHE</span><span>·</span><span>Community counts are live</span></div>
    </section>
  )
}

const translations: Record<Language, Record<string, string>> = {
  en: { home: 'Home', explore: 'Explore', messages: 'Messages', saved: 'Saved', settings: 'Settings', search: 'Search people, posts...', stories: 'Your circles', feed: 'Your feed', forYou: 'For you', following: 'Following', createPost: 'What’s happening in your world?', share: 'Share post', suggestions: 'People you may know', seeAll: 'See all', online: 'Online', trending: 'Trending in Rwanda', welcome: 'Welcome back', signIn: 'Sign in', signUp: 'Create account', register: 'Join your community', email: 'Email address', password: 'Password', fullName: 'Your name', newPost: 'Share a little moment', profile: 'Profile', appearance: 'Appearance', language: 'Language', wallpaper: 'Chat wallpaper', send: 'Send a message...', logout: 'Sign out' },
  rw: { home: 'Ahabanza', explore: 'Shakisha', messages: 'Ubutumwa', saved: 'Byabitswe', settings: 'Igenamiterere', search: 'Shakisha abantu n’inyandiko...', stories: 'Inshuti zawe', feed: 'Amakuru yawe', forYou: 'Ibyo ukunda', following: 'Ukuri gukurikira', createPost: 'Ni ibiki bishya mu buzima bwawe?', share: 'Sangiza', suggestions: 'Abantu ushobora kumenya', seeAll: 'Reba byose', online: 'Ari kuri murandasi', trending: 'Ibikunzwe mu Rwanda', welcome: 'Wongeye kugaruka', signIn: 'Injira', signUp: 'Fungura konti', register: 'Injira mu muryango wawe', email: 'Imeyili', password: 'Ijambo ry’ibanga', fullName: 'Amazina yawe', newPost: 'Sangiza abandi ibyiza', profile: 'Umwirondoro', appearance: 'Imigaragarire', language: 'Ururimi', wallpaper: 'Ishusho y’ubutumwa', send: 'Andika ubutumwa...', logout: 'Sohoka' },
  fr: { home: 'Accueil', explore: 'Découvrir', messages: 'Messages', saved: 'Enregistrés', settings: 'Paramètres', search: 'Rechercher des personnes...', stories: 'Vos cercles', feed: 'Votre fil', forYou: 'Pour vous', following: 'Abonnements', createPost: 'Quoi de neuf dans votre monde ?', share: 'Partager', suggestions: 'Suggestions', seeAll: 'Tout voir', online: 'En ligne', trending: 'Tendances au Rwanda', welcome: 'Bon retour', signIn: 'Connexion', signUp: 'Créer un compte', register: 'Rejoignez votre communauté', email: 'Adresse e-mail', password: 'Mot de passe', fullName: 'Votre nom', newPost: 'Partager un moment', profile: 'Profil', appearance: 'Apparence', language: 'Langue', wallpaper: 'Fond de discussion', send: 'Écrire un message...', logout: 'Déconnexion' },
  sw: { home: 'Nyumbani', explore: 'Gundua', messages: 'Ujumbe', saved: 'Zilizohifadhiwa', settings: 'Mipangilio', search: 'Tafuta watu na machapisho...', stories: 'Marafiki wako', feed: 'Habari zako', forYou: 'Kwa ajili yako', following: 'Unaowafuata', createPost: 'Kuna nini kipya kwako?', share: 'Shiriki', suggestions: 'Unaweza kuwajua', seeAll: 'Tazama zote', online: 'Yuko mtandaoni', trending: 'Maarufu Rwanda', welcome: 'Karibu tena', signIn: 'Ingia', signUp: 'Fungua akaunti', register: 'Jiunge na jumuiya yako', email: 'Barua pepe', password: 'Nenosiri', fullName: 'Jina lako', newPost: 'Shiriki wakati mzuri', profile: 'Wasifu', appearance: 'Muonekano', language: 'Lugha', wallpaper: 'Mandhari ya mazungumzo', send: 'Andika ujumbe...', logout: 'Toka' },
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
})

type RouteSection = 'home' | 'explore' | 'messages'

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
        <button className={section === 'messages' ? 'active' : ''} onClick={() => onNavigate('messages')}><MessageCircle size={20} /><span>Chat</span></button>
        <button onClick={onSignOut}><LogOut size={20} /><span>Sign out</span></button>
      </nav>
    </div>
  )
}

function DiscoverRoute({
  me, people, follows, theme, darkMode, query, onQueryChange, onFollow, onChat, ...frameProps
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
                <img className="directory-avatar" src={person.avatar} alt="" />
                <h2>{person.name}</h2>
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
  onQueryChange, onSelect, onDraftChange, onSend, onAttach, onRecord, onVoiceCall, onVideoCall, onAIDraft, onNavigate,
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
  onQueryChange: (value: string) => void
  onSelect: (id: string) => void
  onDraftChange: (value: string) => void
  onSend: (text: string, attachment?: string) => void
  onAttach: (file: File) => void
  onRecord: () => void
  onVoiceCall: () => void
  onVideoCall: () => void
  onAIDraft: (contactName: string, messages: AiChatMessage[]) => Promise<string>
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

  function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSend(draft)
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
          <div className="view-heading"><div><span className="eyebrow">YOUR LITTLE CORNER</span><h1>Messages</h1></div><button className="soft-icon" onClick={() => onNavigate('explore')} title="Discover people"><UserPlus size={17} /></button></div>
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
              <div className="chat-header"><button className="back-button" onClick={() => onNavigate('explore')} aria-label="Back to Discover"><ArrowLeft size={18} /></button><div className="chat-contact"><span className="avatar-wrap"><img src={selectedPerson.avatar} alt="" /></span><span><strong>{selectedPerson.name}</strong><small>{selectedPerson.city}</small></span></div><div className="chat-actions"><button className="soft-icon" title="Voice call" aria-label="Start voice call" onClick={onVoiceCall}><Phone size={16} /></button><button className="soft-icon" title="Video call" aria-label="Start video call" onClick={onVideoCall}><Video size={17} /></button></div></div>
              <div className="chat-day"><span>YOUR CONVERSATION</span></div>
              <div className="message-list">
                {messages.length === 0 && <div className="conversation-start"><span>👋</span><strong>Say hello to {selectedPerson.name.split(' ')[0]}</strong><small>Send a message to start your conversation.</small><button onClick={() => onDraftChange(`Hi ${selectedPerson.name.split(' ')[0]}! `)}>Write a hello</button></div>}
                {messages.map((message) => <div key={message.id} className={`message-row ${message.from === me.id ? 'mine' : ''}`}>{message.from !== me.id && <img className="message-avatar" src={selectedPerson.avatar} alt="" />}<div className="message-content"><div className="message-bubble">{message.text && <p>{message.text}</p>}{message.attachment && <div className="message-attachment"><AudioLines size={17} /><span>{message.attachment}</span></div>}</div><small className="message-time">{message.time}{message.from === me.id && <CheckCheck size={14} />}</small></div></div>)}
              </div>
              <form className="chat-composer" onSubmit={submitMessage}>
                <div className="composer-tools"><input ref={fileInput} type="file" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onAttach(file); event.target.value = '' }} /><button type="button" className="soft-icon" title="Attach a file" onClick={() => fileInput.current?.click()}><Paperclip size={17} /></button><button type="button" className={`soft-icon ${recording ? 'recording' : ''}`} title={recording ? 'Stop voice note' : 'Record a voice note'} onClick={onRecord}>{recording ? <MicOff size={17} /> : <Mic size={17} />}</button><button type="button" className="soft-icon" title="Add a smile" onClick={() => onDraftChange(`${draft}😊`)}><Smile size={17} /></button><button type="button" className={`soft-icon ai-draft-button ${aiDraftLoading ? 'working' : ''}`} title="Draft a reply with AI" aria-label="Draft a reply with AI" disabled={aiDraftLoading} onClick={() => { void suggestReply() }}><Sparkles size={16} /></button></div>
                <input value={draft} onChange={(event) => onDraftChange(event.target.value)} placeholder={recording ? 'Recording… tap the microphone when you’re done' : 'Write a message...'} aria-label="Write a message" />
                <button className="send-button" type="submit" disabled={!draft.trim()} aria-label="Send message"><Send size={17} /></button>
              </form>
              <p className={`ai-draft-note ${aiDraftError ? 'has-error' : ''}`} role={aiDraftError ? 'alert' : undefined}>{aiDraftError || (aiDraftLoading ? 'Drafting a reply…' : 'AI suggestions are drafts only; review before sending.')}</p>
            </>
            : <div className="chat-blank"><MessageCircle size={29} /><strong>Your next conversation starts here.</strong><p>Choose someone from your community, or discover a new friend.</p><button className="primary-button" onClick={() => onNavigate('explore')}><Sparkles size={15} /> Discover people</button></div>}
        </div>
      </section>
    </RouteFrame>
  )
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
  const [section, setSection] = useState('home')
  const [selectedChat, setSelectedChat] = useState('')
  const [query, setQuery] = useState('')
  const [toast, setToast] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [authMode, setAuthMode] = useState<'signin' | 'register' | null>(null)
  const [showProfileEditor, setShowProfileEditor] = useState(false)
  const [showPost, setShowPost] = useState(false)
  const [postText, setPostText] = useState('')
  const [chatText, setChatText] = useState('')
  const [authError, setAuthError] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [activeProfile, setActiveProfileState] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [profilePhoto, setProfilePhoto] = useState<File | null>(null)
  const [profilePhotoPreview, setProfilePhotoPreview] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [newPostImage, setNewPostImageState] = useState<string | undefined>()
  const [newPostFile, setNewPostFile] = useState<File | undefined>()
  const setNewPostImage = (image: string | undefined) => {
    setNewPostImageState(image)
    if (!image) setNewPostFile(undefined)
  }
  const [showNotifications, setShowNotifications] = useState(false)
  const recorder = useRef<MediaRecorder | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const chatFileInput = useRef<HTMLInputElement>(null)
  const profilePhotoInput = useRef<HTMLInputElement>(null)
  const t = translations[language]
  const me: User = account ? { id: account.id, name: account.name, handle: account.handle, city: account.city, bio: account.bio, avatar: account.avatar, online: true } : initialUsers[0]
  const setActiveProfile = (profileId: string | null) => setActiveProfileState(profileId === account?.id ? 'maya' : profileId)
  const otherUsers = users.filter((user) => user.id !== account?.id)
  const currentUser = otherUsers.find((user) => user.id === selectedChat) ?? initialUsers[1]
  const hasSelectedContact = otherUsers.some((user) => user.id === selectedChat)
  const activeConversation = conversations.find((item) => item.userId === selectedChat)
  const currentConversation = activeConversation?.messages ?? []
  const callControls = useWebRtcCalls(
    account?.id,
    conversations,
    (peerId): CallPeer => {
      const person = users.find((user) => user.id === peerId) ?? initialUsers.find((user) => user.id === peerId)
      return { id: peerId, name: person?.name ?? 'Inzu member', avatar: person?.avatar ?? fallbackAvatar(0) }
    },
    notify,
  )

  useEffect(() => () => {
    if (profilePhotoPreview) URL.revokeObjectURL(profilePhotoPreview)
  }, [profilePhotoPreview])

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
        setSelectedChat('')
        setAuthError('')
        try {
          const loadedPosts = await loadPosts(userId)
          if (mounted && revision === authRevision) setPosts(loadedPosts.map(toPost))
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
      setConversations((current) => current.map((conversation) => {
        if (conversation.id !== activeConversation.id || conversation.messages.some((item) => item.id === message.id)) return conversation
        return { ...conversation, messages: [...conversation.messages, toMessage(message)] }
      }))
    }, (message) => {
      setToast(message)
      window.setTimeout(() => setToast(''), 3000)
    })
    return () => { void supabase?.removeChannel(channel) }
  }, [activeConversation?.id])

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
    const refreshNews = async () => {
      setNewsLoading(true)
      try {
        const result = await loadRwandaNews()
        if (mounted) {
          setRwandaNews(result)
          setNewsError('')
        }
      } catch (error) {
        if (mounted) setNewsError(error instanceof Error ? error.message : 'Rwanda headlines could not be loaded.')
      } finally {
        if (mounted) setNewsLoading(false)
      }
    }
    void refreshTrending()
    void refreshNews()
    const refreshInterval = window.setInterval(() => {
      void refreshTrending()
      void refreshNews()
    }, 5 * 60 * 1000)
    return () => {
      mounted = false
      window.clearInterval(refreshInterval)
    }
  }, [account?.id])

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
  async function toggleFollow(id: string) {
    if (!account) return
    const following = follows.includes(id)
    const person = users.find((user) => user.id === id)
    try {
      await setFollowing(account.id, id, !following)
      setFollows((current) => following ? current.filter((item) => item !== id) : [...current, id])
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
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Your message could not be sent. Please try again.')
    }
  }
  async function createPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!account || (!postText.trim() && !newPostFile)) return
    try {
      const saved = await savePost(account.id, postText.trim(), newPostFile)
      setPosts((current) => [toPost({ ...saved, likes: 0, liked: false }), ...current])
      setProfileCounts((current) => {
        const counts = current[account.id]
        return counts ? { ...current, [account.id]: { ...counts, moments: counts.moments + 1 } } : current
      })
      setPostText('')
      setNewPostImage(undefined)
      setNewPostFile(undefined)
      setShowPost(false)
      notify('Your moment has been shared ✨')
      void loadTrendingTopics().then(setTrendingTopics).catch((error: unknown) => {
        notify(`Moment saved, but trending counts could not refresh: ${explainSupabaseError(error)}`)
      })
    } catch (error) {
      notify(`Your moment could not be shared: ${explainSupabaseError(error)}`)
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
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
        notify('Choose a JPG, PNG, WebP, or GIF image for your moment.')
        event.target.value = ''
        return
      }
      if (file.size > 5 * 1024 * 1024) {
        notify('Moment images must be 5 MB or smaller.')
        event.target.value = ''
        return
      }
      setNewPostFile(file)
      const reader = new FileReader()
      reader.onload = () => setNewPostImage(String(reader.result))
      reader.readAsDataURL(file)
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
  const chatWallpaper = wallpaper === 'none' ? '' : wallpaper === 'lavender' ? 'wall-lavender' : wallpaper === 'sunset' ? 'wall-sunset' : 'wall-mist'
  const routeFrameProps = {
    onNavigate: (nextSection: RouteSection) => setSection(nextSection),
    onSettings: () => { setSection('home'); setShowSettings(true) },
    onEditProfile: () => { setSection('home'); setShowProfileEditor(true) },
    onSignOut: () => { void signOut() },
  }

  if (authLoading) return <main className="auth-loading"><span className="brand-mark">i</span><strong>Finding your place...</strong></main>

  if (!account) return (
    <main className="welcome-screen">
      <div className="welcome-art"><span className="welcome-orbit orbit-a" /><span className="welcome-orbit orbit-b" /><div className="welcome-copy"><span className="brand-mark large">i</span><p className="eyebrow">A LITTLE CLOSER, EVERY DAY</p><h1>Good things<br />happen <em>together.</em></h1><p>A place to find your people, share your world, and feel a little more at home.</p><div className="welcome-faces">{initialUsers.slice(1, 5).map((user) => <img key={user.id} src={user.avatar} alt="" />)}<span>Made for us, in Rwanda 🇷🇼</span></div></div><div className="welcome-photo" /></div>
      <div className="welcome-form"><span className="brand-word"><span className="brand-mark">i</span> inzu</span><div className="auth-heading"><span className="eyebrow">{authMode === 'register' ? 'YOUR PEOPLE ARE HERE' : 'A WARM WELCOME AWAITS'}</span><h2>{authMode === 'register' ? t.register : t.welcome}</h2><p>{authMode === 'register' ? 'Make a little space for the people who make life brighter.' : 'Come on in. Your community has been waiting.'}</p></div>{!isSupabaseConfigured && <div className="backend-notice"><strong>One quick setup before you join</strong><span>Connect the app to your Supabase project. The README has the setup steps; then registration, discovery, and chat will work across devices.</span></div>}<form onSubmit={authenticate} className="auth-form">{authMode === 'register' && <label>{t.fullName}<input value={formName} onChange={(event) => setFormName(event.target.value)} placeholder="e.g. Aline Mukamana" autoComplete="name" required /></label>}<label>{t.email}<input value={formEmail} onChange={(event) => setFormEmail(event.target.value)} placeholder="you@example.com" type="email" autoComplete="email" required /></label><label>{t.password}<input value={formPassword} onChange={(event) => setFormPassword(event.target.value)} placeholder="At least 6 characters" type="password" autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} required minLength={6} /></label>{authError && <div className="auth-error">{authError}</div>}<button className="primary-button full-button" disabled={authLoading}>{authLoading ? 'Connecting…' : authMode === 'register' ? t.signUp : t.signIn}<ArrowRight size={16} /></button></form><p className="auth-switch">{authMode === 'register' ? 'Already have an account?' : 'New around here?'} <button onClick={() => { setAuthMode(authMode === 'register' ? 'signin' : 'register'); setAuthError('') }}>{authMode === 'register' ? t.signIn : t.signUp}</button></p><div className="welcome-foot"><Globe2 size={14} /> A kinder corner of the internet, wherever you are.</div></div>
    </main>
  )

  if (section === 'explore') {
    return <>
      <DiscoverRoute me={me} people={otherUsers} follows={follows} theme={theme} darkMode={darkMode} query={query} onQueryChange={setQuery} onFollow={(id) => { void toggleFollow(id) }} onChat={(id) => { void startConversation(id) }} {...routeFrameProps} />
      {callControls.call && <CallOverlay call={callControls.call} onAccept={() => { void callControls.acceptCall() }} onEnd={() => { void callControls.endCall() }} onToggleMicrophone={callControls.toggleMicrophone} onToggleCamera={callControls.toggleCamera} />}
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
        onQueryChange={setQuery}
        onSelect={(id) => { void startConversation(id) }}
        onDraftChange={setChatText}
        onSend={(text, attachment) => { void sendMessage(text, attachment) }}
        onAttach={(file) => { void sendMessage('', file.name) }}
        onRecord={() => { void toggleRecording() }}
        onVoiceCall={() => { void startCall('voice') }}
        onVideoCall={() => { void startCall('video') }}
        onAIDraft={(contactName, messages) => draftChatReply(contactName, messages)}
        {...routeFrameProps}
      />
      {callControls.call && <CallOverlay call={callControls.call} onAccept={() => { void callControls.acceptCall() }} onEnd={() => { void callControls.endCall() }} onToggleMicrophone={callControls.toggleMicrophone} onToggleCamera={callControls.toggleCamera} />}
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
        {section === 'messages' ?         <section className="messages-view"><div className="messages-list"><div className="view-heading"><div><span className="eyebrow">YOUR LITTLE CORNER</span><h1>{t.messages}</h1></div><button className="soft-icon" onClick={() => setSection('explore')} title="Start a conversation"><PenLine size={17} /></button></div><div className="chat-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a conversation..." /></div>{filteredUsers.map((user) => { const last = conversations.find((item) => item.userId === user.id)?.messages.at(-1); return <button key={user.id} className={`conversation-row ${selectedChat === user.id ? 'selected' : ''}`} onClick={() => setSelectedChat(user.id)}><span className="avatar-wrap"><img src={user.avatar} alt="" />{user.online && <i />}</span><span className="conversation-info"><strong>{user.name}<time>{last?.time ?? 'New'}</time></strong><small>{last?.text ?? 'Say hello and start a conversation'}{last?.attachment && <span className="attachment-label"> · {last.attachment}</span>}</small></span>{user.online && <span className="conversation-unread" />}</button> })}</div><div className={`chat-panel ${chatWallpaper}`}><div className="chat-header"><button className="back-button" onClick={() => setSelectedChat('')} aria-label="Back"><ArrowLeft size={18} /></button><button className="chat-contact" onClick={() => setActiveProfile(currentUser.id)}><span className="avatar-wrap"><img src={currentUser.avatar} alt="" /><i /></span><span><strong>{currentUser.name}</strong><small><span className="online-pulse" />{t.online}</small></span></button><div className="chat-actions"><button className="soft-icon" title="Voice call" onClick={() => startCall('voice')}><Phone size={17} /></button><button className="soft-icon" title="Video call" onClick={() => startCall('video')}><Video size={18} /></button><button className="soft-icon" title="Chat settings" onClick={() => setShowSettings(true)}><Ellipsis size={19} /></button></div></div><div className="chat-day"><span>TODAY</span></div><div className="message-list">{currentConversation.length === 0 && <div className="conversation-start"><span>👋</span><strong>Say hello to {currentUser.name.split(' ')[0]}</strong><small>A new conversation is a lovely place to start.</small><button onClick={() => setChatText(`Hi ${currentUser.name.split(' ')[0]}! `)}>Send a little hello</button></div>}{currentConversation.map((message) => <div key={message.id} className={`message-row ${message.from === 'maya' ? 'mine' : ''}`}>{message.from !== 'maya' && <img className="message-avatar" src={currentUser.avatar} alt="" />}<div className="message-content"><div className="message-bubble">{message.text && <p>{message.text}</p>}{message.attachment && <div className="message-attachment"><AudioLines size={17} /><span>{message.attachment}</span><button title="Play voice note" onClick={() => notify('Voice notes are saved to this conversation.')}>▶</button></div>}</div><small className="message-time">{message.time}{message.from === 'maya' && <CheckCheck size={14} />}</small></div></div>)}</div><div className="chat-composer"><div className="composer-tools"><input ref={chatFileInput} type="file" hidden onChange={(event) => changeFile(event, 'chat')} /><button className="soft-icon" title="Attach a file" onClick={() => chatFileInput.current?.click()}><Paperclip size={17} /></button><button className={`soft-icon ${isRecording ? 'recording' : ''}`} title={isRecording ? 'Stop voice note' : 'Record a voice note'} onClick={toggleRecording}>{isRecording ? <MicOff size={17} /> : <Mic size={17} />}</button><button className="soft-icon emoji-tool" title="Add a smile" onClick={() => setChatText((text) => text + ' 😊')}><Smile size={17} /></button></div><input value={chatText} onChange={(event) => setChatText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage() } }} placeholder={isRecording ? 'Recording… tap the microphone when you’re done' : t.send} aria-label="Write a message" /><button className="send-button" onClick={() => sendMessage()} disabled={!chatText.trim()} aria-label="Send message"><Send size={17} /></button></div></div></section> : <div className="feed-layout"><section className="feed-column"><div className="greeting-row"><div><span className="eyebrow">{new Date().toLocaleDateString(language === 'rw' ? 'rw-RW' : language === 'fr' ? 'fr-FR' : language === 'sw' ? 'sw-KE' : 'en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}</span><h1>{t.welcome.split(' ')[0]}, {me.name.split(' ')[0]} <span className="wave">✳</span></h1><p>There’s always something good happening around you.</p></div><button className="primary-button write-post" onClick={() => setShowPost(true)}><Plus size={17} /> Create post</button></div>
          <div className="stories-strip"><div className="stories-heading"><span>{t.stories}</span><button onClick={() => setSection('explore')}>{t.seeAll} <ArrowRight size={14} /></button></div><div className="story-list"><button className="story-item your-story" onClick={() => setShowPost(true)}><span className="story-ring own-ring"><img src={me.avatar} alt="" /><i><Plus size={13} /></i></span><span>Your story</span></button>{otherUsers.slice(0, 5).map((user, index) => <button key={user.id} className="story-item" onClick={() => setActiveProfile(user.id)}><span className={`story-ring ${index < 3 ? 'unseen' : ''}`}><img src={user.avatar} alt="" /><i className={user.online ? 'story-online' : ''} /></span><span>{user.name.split(' ')[0]}</span></button>)}</div></div>
          {section === 'explore' && <div className="explore-banner"><div className="explore-icon"><Sparkles size={20} /></div><div><strong>Good people, right around you.</strong><p>Meet someone new today. Kigali has more stories than you think.</p></div><button onClick={() => setQuery('')}>Meet your neighbours <ArrowRight size={15} /></button></div>}
          <div className="feed-tabs"><button className="active" onClick={() => setSection('home')}>{t.forYou}</button><button onClick={() => setSection('following')}>{t.following}</button><span className="feed-filter"><Sparkles size={14} /> A little inspiration</span></div>
          <button className="quick-composer" onClick={() => setShowPost(true)}><img src={me.avatar} alt="" /><span>{t.createPost}</span><span className="quick-image"><ImagePlus size={18} /></span><span className="quick-label">Add a photo</span></button>
          {visiblePosts.filter((post) => { const author = post.userId === 'maya' ? me : users.find((user) => user.id === post.userId); return !query || `${author?.name} ${post.text}`.toLowerCase().includes(query.toLowerCase()) }).map((post) => { const author = post.userId === 'maya' ? me : users.find((user) => user.id === post.userId) ?? otherUsers[0]; return <article className="post-card" key={post.id}><div className="post-head"><button className="post-author" onClick={() => setActiveProfile(author.id)}><span className="avatar-wrap"><img src={author.avatar} alt="" />{author.online && <i />}</span><span><strong>{author.name}<span className="verified-mark">✓</span></strong><small>@{author.handle} <span>·</span> {post.time}</small></span></button><button className="post-more" aria-label="More post options" onClick={() => setPosts((current) => current.map((item) => item.id === post.id ? { ...item, saved: !item.saved } : item))}><MoreHorizontal size={21} /></button></div><p className="post-text">{post.text}</p>{post.image && <img className="post-image" src={post.image} alt="A moment shared with the community" />}<div className="post-reactions"><span className="reaction-stack"><i><Heart size={10} fill="currentColor" /></i><i><ThumbsUp size={10} fill="currentColor" /></i></span><span>{post.likes} kind hearts</span><button onClick={() => notify('Comments are coming soon.')} >{post.comments} replies</button></div><div className="post-actions"><button className={post.liked ? 'is-liked' : ''} onClick={() => likePost(post.id)}><Heart size={17} fill={post.liked ? 'currentColor' : 'none'} /> <span>Like</span></button><button onClick={() => { setSection('messages'); setSelectedChat(author.id === 'maya' ? 'keza' : author.id) }}><MessageCircle size={17} /> <span>Reply</span></button><button onClick={() => setPosts((current) => current.map((item) => item.id === post.id ? { ...item, saved: !item.saved } : item))} className={post.saved ? 'is-saved' : ''}><Bookmark size={17} fill={post.saved ? 'currentColor' : 'none'} /> <span>{post.saved ? 'Saved' : 'Save'}</span></button><button onClick={() => { navigator.clipboard?.writeText(window.location.href); notify('Link copied — share something lovely!') }}><ArrowDownLeft size={17} /> <span>Share</span></button></div></article> })}{visiblePosts.length === 0 && <div className="empty-state"><Bookmark size={24} /><strong>A little room for something lovely.</strong><p>Posts you save will find a home here.</p></div>}</section>
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
      {showProfileEditor && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowProfileEditor(false) }}><form className="modal-card profile-edit-modal" onSubmit={updateProfile}><div className="modal-heading"><div><span className="eyebrow">A LITTLE MORE YOU</span><h2>Edit your profile</h2></div><button type="button" className="soft-icon" onClick={() => setShowProfileEditor(false)} aria-label="Close"><X size={19} /></button></div><input ref={profilePhotoInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={selectProfilePhoto} /><div className="avatar-edit-row"><img src={profilePhotoPreview || me.avatar} alt="Profile picture preview" /><div><strong>Profile picture</strong><small>JPG, PNG, WebP, or GIF · up to 5 MB</small><button type="button" className="add-photo-button" onClick={() => profilePhotoInput.current?.click()}><Camera size={15} /> Choose a photo</button></div></div><label className="edit-field">Your name<input name="name" defaultValue={me.name} required maxLength={50} /></label><label className="edit-field">Where you call home<input name="city" defaultValue={me.city} required maxLength={80} /></label><label className="edit-field">A little about you<textarea name="bio" defaultValue={me.bio} rows={3} maxLength={180} /></label><div className="edit-profile-actions"><button type="button" className="outline-button" onClick={() => { setProfilePhoto(null); setProfilePhotoPreview(''); setShowProfileEditor(false) }}>Cancel</button><button className="primary-button" disabled={profileSaving}>{profileSaving ? 'Saving…' : <><Check size={15} /> Save changes</>}</button></div></form></div>}
      <nav className="mobile-nav"><button className={section === 'home' ? 'active' : ''} onClick={() => setSection('home')}><Compass size={20} /><span>Home</span></button><button className={section === 'explore' ? 'active' : ''} onClick={() => setSection('explore')}><Sparkles size={20} /><span>Explore</span></button><button className="mobile-create" onClick={() => setShowPost(true)}><Plus size={21} /></button><button className={section === 'messages' ? 'active' : ''} onClick={() => setSection('messages')}><MessageCircle size={20} /><span>Chat</span></button><button onClick={() => { void signOut() }}><LogOut size={20} /><span>Sign out</span></button></nav>
      {toast && <div className="toast-message"><span className="toast-check"><Check size={14} /></span>{toast}</div>}
      {showPost && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowPost(false) }}><form className="modal-card post-modal" onSubmit={createPost}><div className="modal-heading"><div><span className="eyebrow">YOUR WORLD, YOUR WORDS</span><h2>{t.newPost}</h2></div><button type="button" className="soft-icon" onClick={() => setShowPost(false)} aria-label="Close"><X size={19} /></button></div><div className="modal-author"><img src={me.avatar} alt="" /><strong>{me.name}</strong><span>· Everyone</span></div><textarea autoFocus value={postText} onChange={(event) => setPostText(event.target.value)} placeholder="A thought, a little win, a view you love..." rows={5} />{newPostImage && <div className="image-preview-wrap"><img src={newPostImage} alt="Your post preview" /><button type="button" onClick={() => setNewPostImage(undefined)} aria-label="Remove image"><X size={16} /></button></div>}<input ref={fileInput} type="file" accept="image/*" hidden onChange={(event) => changeFile(event, 'post')} /><div className="modal-footer"><button type="button" className="add-photo-button" onClick={() => fileInput.current?.click()}><ImagePlus size={17} /> Add a photo</button><span>Made with a little heart <Heart size={12} fill="currentColor" /></span><button className="primary-button" disabled={!postText.trim() && !newPostImage}><Send size={15} />{t.share}</button></div></form></div>}
      {showSettings && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowSettings(false) }}><div className="modal-card settings-modal"><div className="modal-heading"><div><span className="eyebrow">MAKE YOURSELF AT HOME</span><h2>{t.settings}</h2></div><button className="soft-icon" onClick={() => setShowSettings(false)} aria-label="Close"><X size={19} /></button></div><button className="settings-profile" onClick={() => { setShowSettings(false); setShowProfileEditor(true) }}><img src={me.avatar} alt="" /><span><strong>{me.name}</strong><small>Edit your profile</small></span><ChevronRight size={17} /></button>      <div className="setting-section"><div className="setting-label"><Palette size={16} /><span><strong>{t.appearance}</strong><small>A colour that feels like you</small></span></div><div className="theme-choices">{[['violet', 'Dreamy lilac'], ['rose', 'Warm rose'], ['ocean', 'Quiet ocean'], ['forest', 'Soft forest']].map(([value, name]) => <button key={value} className={`theme-choice ${theme === value ? 'chosen' : ''}`} onClick={() => setTheme(value)}><i className={`theme-swatch ${value}`} />{name}{theme === value && <Check size={14} />}</button>)}</div><button className={`dark-mode-choice ${darkMode ? 'enabled' : ''}`} onClick={() => setDarkMode(!darkMode)} aria-pressed={darkMode}><span className="dark-mode-icon">{darkMode ? <Moon size={16} /> : <Sun size={16} />}</span><span><strong>Dark mode</strong><small>{darkMode ? 'An easier view for low light' : 'Switch to a darker look'}</small></span><i className="dark-mode-switch"><b /></i></button></div><div className="setting-section"><label className="setting-label" htmlFor="language-choice"><Globe2 size={16} /><span><strong>{t.language}</strong><small>Choose the words that feel like home</small></span></label><select id="language-choice" value={language} onChange={(event) => setLanguage(event.target.value as Language)}><option value="en">English</option><option value="rw">Kinyarwanda</option><option value="fr">Français</option><option value="sw">Kiswahili</option></select></div><div className="setting-section"><div className="setting-label"><ImagePlus size={16} /><span><strong>{t.wallpaper}</strong><small>A lovely backdrop for your chats</small></span></div><div className="wallpaper-choices">{[['none', 'Plain'], ['lavender', 'Lavender'], ['sunset', 'Sunset'], ['mist', 'Morning mist']].map(([value, name]) => <button key={value} className={`wallpaper-choice ${value} ${wallpaper === value ? 'selected' : ''}`} onClick={() => setWallpaper(value)}><span>{wallpaper === value && <Check size={14} />}</span>{name}</button>)}</div></div><div className="settings-note"><CircleHelp size={15} /> Your personal touches are saved on this device.</div><button className="settings-signout" onClick={() => { void signOut() }}><LogOut size={16} /> Sign out of Inzu</button></div></div>}
      {activeProfile && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveProfile(null) }}><div className="modal-card profile-modal"><button className="profile-close soft-icon" onClick={() => setActiveProfile(null)} aria-label="Close"><X size={19} /></button><div className="profile-cover" /><img className="profile-large-avatar" src={activeProfile === 'maya' ? me.avatar : users.find((user) => user.id === activeProfile)?.avatar ?? me.avatar} alt="" /><div className="profile-details"><span className="eyebrow">{activeProfile === 'maya' ? 'THIS IS YOUR SPACE' : 'A NEIGHBOUR NEAR YOU'}</span><h2>{activeProfile === 'maya' ? me.name : users.find((user) => user.id === activeProfile)?.name}</h2><p className="profile-handle">@{activeProfile === 'maya' ? me.handle : users.find((user) => user.id === activeProfile)?.handle} <span>·</span> {activeProfile === 'maya' ? me.city : users.find((user) => user.id === activeProfile)?.city}</p><p className="profile-bio">{activeProfile === 'maya' ? me.bio : users.find((user) => user.id === activeProfile)?.bio}</p><div className="profile-stats"><span><strong>{profileCounts[activeProfile === 'maya' ? account.id : activeProfile]?.moments ?? 0}</strong> moments</span><span><strong>{profileCounts[activeProfile === 'maya' ? account.id : activeProfile]?.following ?? 0}</strong> following</span><span><strong>{profileCounts[activeProfile === 'maya' ? account.id : activeProfile]?.followers ?? 0}</strong> followers</span></div>{activeProfile !== 'maya' && <div className="profile-actions"><button className={`primary-button ${follows.includes(activeProfile) ? 'followed-button' : ''}`} onClick={() => { void toggleFollow(activeProfile) }}>{follows.includes(activeProfile) ? <Check size={16} /> : <UserPlus size={16} />}{follows.includes(activeProfile) ? 'Following' : 'Follow'}</button><button className="outline-button" onClick={() => { void startConversation(activeProfile); setActiveProfile(null) }}><MessageCircle size={16} /> Say hello</button></div>}</div></div></div>}
      {callControls.call && <CallOverlay call={callControls.call} onAccept={() => { void callControls.acceptCall() }} onEnd={() => { void callControls.endCall() }} onToggleMicrophone={callControls.toggleMicrophone} onToggleCamera={callControls.toggleCamera} />}
    </div>
  )
}

export default App
