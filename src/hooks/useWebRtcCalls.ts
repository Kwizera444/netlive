import { useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import {
  createGroupCallRoom, endGroupCallRoom, joinGroupCallRoom, leaveGroupCallRoom, supabase,
} from '../lib/supabase'

export type CallPeer = { id: string; name: string; avatar: string }
export type CallMode = 'voice' | 'video'
export type CallGift = { emoji: string; label: string; sender: string; id: number }
export type CallParticipant = { peer: CallPeer; stream: MediaStream | null }
export type GroupCallInvitee = { peer: CallPeer; conversation: { id: string; userId: string } }
export type ActiveCall = {
  conversationId: string
  groupCallId?: string
  ownerId: string
  peer: CallPeer
  participants: CallParticipant[]
  mode: CallMode
  phase: 'incoming' | 'calling' | 'connecting' | 'connected'
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  microphoneOn: boolean
  cameraOn: boolean
  connectedAt?: number
  lastGift?: CallGift
  error?: string
}

type ConversationPeer = { id: string; userId: string }
type Signal = {
  from: string
  to: string
  type: 'invite' | 'group-invite' | 'accepted' | 'declined' | 'busy' | 'offer' | 'answer' | 'ice' | 'end' | 'gift' | 'typing'
  mode?: CallMode
  groupCallId?: string
  description?: RTCSessionDescriptionInit
  candidate?: RTCIceCandidateInit
  gift?: { emoji: string; label: string }
  typing?: boolean
}
type GroupSignal = {
  from: string
  to?: string
  type: 'join' | 'leave' | 'offer' | 'answer' | 'ice' | 'end' | 'gift'
  peer?: CallPeer
  description?: RTCSessionDescriptionInit
  candidate?: RTCIceCandidateInit
  gift?: { emoji: string; label: string }
}
type Room = { channel: RealtimeChannel; ready: Promise<void> }
type GroupConnection = { connection: RTCPeerConnection; pendingCandidates: RTCIceCandidateInit[] }

const defaultIceServers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]

export function useWebRtcCalls(
  userId: string | undefined,
  conversations: ConversationPeer[],
  getPeer: (id: string) => CallPeer,
  onError: (message: string) => void,
  onTyping: (peerId: string, typing: boolean) => void,
) {
  const [call, setCall] = useState<ActiveCall | null>(null)
  const callRef = useRef<ActiveCall | null>(null)
  const rooms = useRef(new Map<string, Room>())
  const groupRooms = useRef(new Map<string, Room>())
  const peerConnection = useRef<RTCPeerConnection | null>(null)
  const groupConnections = useRef(new Map<string, GroupConnection>())
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([])
  const callTimeout = useRef<number | undefined>(undefined)
  const inviteInterval = useRef<number | undefined>(undefined)
  const giftTimeout = useRef<number | undefined>(undefined)
  const peopleRef = useRef({ getPeer, onError, onTyping })

  useEffect(() => { callRef.current = call }, [call])
  peopleRef.current = { getPeer, onError, onTyping }

  function updateCall(update: (current: ActiveCall) => ActiveCall) {
    const current = callRef.current
    if (!current) return
    const next = update(current)
    callRef.current = next
    setCall(next)
  }

  function markConnected() {
    updateCall((current) => ({
      ...current,
      phase: 'connected',
      connectedAt: current.connectedAt ?? Date.now(),
    }))
  }

  function clearCallState() {
    if (callTimeout.current !== undefined) window.clearTimeout(callTimeout.current)
    if (inviteInterval.current !== undefined) window.clearInterval(inviteInterval.current)
    if (giftTimeout.current !== undefined) window.clearTimeout(giftTimeout.current)
    callTimeout.current = undefined
    inviteInterval.current = undefined
    giftTimeout.current = undefined
    peerConnection.current?.close()
    peerConnection.current = null
    for (const item of groupConnections.current.values()) item.connection.close()
    groupConnections.current.clear()
    pendingCandidates.current = []
    for (const room of groupRooms.current.values()) void supabase?.removeChannel(room.channel)
    groupRooms.current.clear()
    callRef.current?.localStream?.getTracks().forEach((track) => track.stop())
    callRef.current = null
    setCall(null)
  }

  async function openRoom(
    name: string,
    register: (channel: RealtimeChannel) => void,
    collection: Map<string, Room>,
    key: string,
  ) {
    if (!supabase) throw new Error('Signaling is not configured. Connect the app to Supabase.')
    const existing = collection.get(key)
    if (existing) {
      await existing.ready
      return existing
    }
    let resolveReady: () => void = () => undefined
    let rejectReady: (error: Error) => void = () => undefined
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve
      rejectReady = reject
    })
    void ready.catch(() => undefined)
    const channel = supabase.channel(name, { config: { private: true, broadcast: { ack: true, self: false } } })
    collection.set(key, { channel, ready })
    register(channel)
    channel.subscribe((status, error) => {
      if (status === 'SUBSCRIBED') resolveReady()
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        rejectReady(new Error(error?.message ?? 'Call signaling could not connect. Apply the calls migration and retry.'))
      }
    })
    await ready
    return { channel, ready }
  }

  async function sendDirect(conversationId: string, peerId: string, message: Omit<Signal, 'from' | 'to'>) {
    if (!userId) throw new Error('Sign in before starting a call.')
    const room = rooms.current.get(conversationId)
    if (!room) throw new Error('Call signaling is not ready yet. Please try again.')
    await room.ready
    const result = await room.channel.send({
      type: 'broadcast',
      event: 'signal',
      payload: { ...message, from: userId, to: peerId } satisfies Signal,
    })
    if (result !== 'ok') throw new Error('The call signal could not be sent. Check your connection and try again.')
  }

  async function sendGroup(callId: string, message: Omit<GroupSignal, 'from'>) {
    if (!userId) throw new Error('Sign in before joining a group call.')
    const room = groupRooms.current.get(callId)
    if (!room) throw new Error('Group call signaling is not ready yet. Please try again.')
    await room.ready
    const result = await room.channel.send({
      type: 'broadcast',
      event: 'signal',
      payload: { ...message, from: userId } satisfies GroupSignal,
    })
    if (result !== 'ok') throw new Error('The group call signal could not be sent.')
  }

  async function acquireMedia(mode: CallMode) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Calls need a secure connection (HTTPS) and a browser with microphone support.')
    }
    return navigator.mediaDevices.getUserMedia({
      audio: true,
      video: mode === 'video' ? { facingMode: 'user' } : false,
    })
  }

  async function addPendingCandidates(connection: RTCPeerConnection, candidates: RTCIceCandidateInit[]) {
    const queued = candidates.splice(0)
    for (const candidate of queued) await connection.addIceCandidate(candidate)
  }

  async function makeDirectOffer() {
    const active = callRef.current
    if (!active) return
    const connection = new RTCPeerConnection({ iceServers: defaultIceServers })
    peerConnection.current = connection
    active.localStream?.getTracks().forEach((track) => connection.addTrack(track, active.localStream!))
    connection.ontrack = (event) => {
      const stream = event.streams[0]
      if (stream) updateCall((current) => ({ ...current, remoteStream: stream }))
    }
    connection.onicecandidate = (event) => {
      if (event.candidate) {
        void sendDirect(active.conversationId, active.peer.id, { type: 'ice', candidate: event.candidate.toJSON() })
          .catch((error: unknown) => peopleRef.current.onError(error instanceof Error ? error.message : 'Could not send a network candidate.'))
      }
    }
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === 'connected') {
        if (callTimeout.current !== undefined) window.clearTimeout(callTimeout.current)
        callTimeout.current = undefined
        markConnected()
      } else if (connection.connectionState === 'failed') {
        updateCall((current) => ({ ...current, error: 'Could not connect. A TURN relay may be required on this network.' }))
      }
    }
    const offer = await connection.createOffer()
    await connection.setLocalDescription(offer)
    await sendDirect(active.conversationId, active.peer.id, { type: 'offer', description: offer })
    updateCall((current) => ({ ...current, phase: 'connecting' }))
  }

  async function acceptDirectOffer(description: RTCSessionDescriptionInit) {
    const active = callRef.current
    if (!active) return
    const connection = new RTCPeerConnection({ iceServers: defaultIceServers })
    peerConnection.current = connection
    active.localStream?.getTracks().forEach((track) => connection.addTrack(track, active.localStream!))
    connection.ontrack = (event) => {
      const stream = event.streams[0]
      if (stream) updateCall((current) => ({ ...current, remoteStream: stream }))
    }
    connection.onicecandidate = (event) => {
      if (event.candidate) {
        void sendDirect(active.conversationId, active.peer.id, { type: 'ice', candidate: event.candidate.toJSON() })
          .catch((error: unknown) => peopleRef.current.onError(error instanceof Error ? error.message : 'Could not send a network candidate.'))
      }
    }
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === 'connected') {
        if (callTimeout.current !== undefined) window.clearTimeout(callTimeout.current)
        callTimeout.current = undefined
        markConnected()
      } else if (connection.connectionState === 'failed') {
        updateCall((current) => ({ ...current, error: 'Could not connect. A TURN relay may be required on this network.' }))
      }
    }
    await connection.setRemoteDescription(description)
    await addPendingCandidates(connection, pendingCandidates.current)
    const answer = await connection.createAnswer()
    await connection.setLocalDescription(answer)
    await sendDirect(active.conversationId, active.peer.id, { type: 'answer', description: answer })
    updateCall((current) => ({ ...current, phase: 'connecting' }))
  }

  function receiveGift(sender: string, gift: { emoji: string; label: string }) {
    updateCall((current) => ({
      ...current,
      lastGift: { ...gift, sender, id: Date.now() },
    }))
    if (giftTimeout.current !== undefined) window.clearTimeout(giftTimeout.current)
    giftTimeout.current = window.setTimeout(() => {
      updateCall((current) => ({ ...current, lastGift: undefined }))
      giftTimeout.current = undefined
    }, 2000)
  }

  function setupDirectRoom(conversation: ConversationPeer) {
    if (!userId || !supabase || rooms.current.has(conversation.id)) return
    void openRoom(`inzu-call:${conversation.id}`, (channel) => {
      channel.on('broadcast', { event: 'signal' }, ({ payload }) => {
        const signal = payload as Signal
        if (signal.to !== userId || signal.from !== conversation.userId) return
        if (signal.type === 'typing') {
          peopleRef.current.onTyping(signal.from, signal.typing === true)
          return
        }
        const active = callRef.current
        if (signal.type === 'invite' || signal.type === 'group-invite') {
          if (active) {
            const duplicate = signal.type === 'invite'
              ? active.conversationId === conversation.id && active.peer.id === signal.from
              : active.groupCallId === signal.groupCallId
            if (duplicate) return
            void sendDirect(conversation.id, signal.from, { type: 'busy' }).catch(peopleRef.current.onError)
            return
          }
          if (signal.mode !== 'voice' && signal.mode !== 'video') return
          if (signal.type === 'group-invite' && !signal.groupCallId) return
          const incoming: ActiveCall = {
            conversationId: conversation.id,
            ...(signal.groupCallId ? { groupCallId: signal.groupCallId } : {}),
            ownerId: signal.from,
            peer: peopleRef.current.getPeer(signal.from),
            participants: [],
            mode: signal.mode,
            phase: 'incoming',
            localStream: null,
            remoteStream: null,
            microphoneOn: true,
            cameraOn: signal.mode === 'video',
          }
          callRef.current = incoming
          setCall(incoming)
          return
        }
        if (
          active?.groupCallId
          && signal.groupCallId === active.groupCallId
          && (signal.type === 'declined' || signal.type === 'busy')
        ) {
          peopleRef.current.onError(signal.type === 'busy'
            ? `${peopleRef.current.getPeer(signal.from).name} is already on another call.`
            : `${peopleRef.current.getPeer(signal.from).name} declined the group call.`)
          return
        }
        if (!active || active.conversationId !== conversation.id || active.peer.id !== signal.from) return
        if (signal.type === 'gift' && signal.gift) {
          receiveGift(active.peer.name, signal.gift)
        } else if (signal.type === 'accepted' && active.phase === 'calling') {
          if (inviteInterval.current !== undefined) window.clearInterval(inviteInterval.current)
          inviteInterval.current = undefined
          void makeDirectOffer().catch((error: unknown) => peopleRef.current.onError(error instanceof Error ? error.message : 'Could not start the call.'))
        } else if (signal.type === 'declined' || signal.type === 'busy' || signal.type === 'end') {
          clearCallState()
          if (signal.type !== 'end') peopleRef.current.onError(signal.type === 'busy' ? `${active.peer.name} is already on another call.` : `${active.peer.name} declined the call.`)
        } else if (signal.type === 'offer' && signal.description) {
          void acceptDirectOffer(signal.description).catch((error: unknown) => peopleRef.current.onError(error instanceof Error ? error.message : 'Could not answer the call.'))
        } else if (signal.type === 'answer' && signal.description && peerConnection.current) {
          void peerConnection.current.setRemoteDescription(signal.description)
            .then(() => addPendingCandidates(peerConnection.current!, pendingCandidates.current))
            .catch((error: unknown) => peopleRef.current.onError(error instanceof Error ? error.message : 'Could not connect the call.'))
        } else if (signal.type === 'ice' && signal.candidate) {
          if (peerConnection.current?.remoteDescription) {
            void peerConnection.current.addIceCandidate(signal.candidate)
              .catch((error: unknown) => peopleRef.current.onError(error instanceof Error ? error.message : 'Could not add a network candidate.'))
          } else {
            pendingCandidates.current.push(signal.candidate)
          }
        }
      })
    }, rooms.current, conversation.id).catch((error: unknown) => {
      peopleRef.current.onError(error instanceof Error ? error.message : 'Call signaling could not connect.')
    })
  }

  async function sendGroupOffer(active: ActiveCall, peerId: string) {
    const existing = groupConnections.current.get(peerId)
    if (existing) return
    const connection = new RTCPeerConnection({ iceServers: defaultIceServers })
    const peerConnectionState: GroupConnection = { connection, pendingCandidates: [] }
    groupConnections.current.set(peerId, peerConnectionState)
    active.localStream?.getTracks().forEach((track) => connection.addTrack(track, active.localStream!))
    connection.ontrack = (event) => {
      const stream = event.streams[0]
      if (!stream) return
      updateCall((current) => ({
        ...current,
        participants: current.participants.map((participant) =>
          participant.peer.id === peerId ? { ...participant, stream } : participant),
      }))
    }
    connection.onicecandidate = (event) => {
      if (event.candidate && active.groupCallId) {
        void sendGroup(active.groupCallId, { type: 'ice', to: peerId, candidate: event.candidate.toJSON() })
          .catch((error: unknown) => peopleRef.current.onError(error instanceof Error ? error.message : 'Could not send a group-call network candidate.'))
      }
    }
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === 'failed') {
        updateCall((current) => ({ ...current, error: 'A group connection failed. This network may require a TURN relay.' }))
      } else if (connection.connectionState === 'connected') {
        if (callTimeout.current !== undefined) window.clearTimeout(callTimeout.current)
        callTimeout.current = undefined
        markConnected()
      }
    }
    const offer = await connection.createOffer()
    await connection.setLocalDescription(offer)
    if (active.groupCallId) await sendGroup(active.groupCallId, { type: 'offer', to: peerId, description: offer })
  }

  async function answerGroupOffer(signal: GroupSignal) {
    const active = callRef.current
    if (!active?.groupCallId || !signal.description) return
    const peerId = signal.from
    let peerConnectionState = groupConnections.current.get(peerId)
    if (!peerConnectionState) {
      const connection = new RTCPeerConnection({ iceServers: defaultIceServers })
      peerConnectionState = { connection, pendingCandidates: [] }
      groupConnections.current.set(peerId, peerConnectionState)
      active.localStream?.getTracks().forEach((track) => connection.addTrack(track, active.localStream!))
      connection.ontrack = (event) => {
        const stream = event.streams[0]
        if (!stream) return
        updateCall((current) => ({
          ...current,
          participants: current.participants.map((participant) =>
            participant.peer.id === peerId ? { ...participant, stream } : participant),
        }))
      }
      connection.onicecandidate = (event) => {
        if (event.candidate && active.groupCallId) {
          void sendGroup(active.groupCallId, { type: 'ice', to: peerId, candidate: event.candidate.toJSON() })
            .catch((error: unknown) => peopleRef.current.onError(error instanceof Error ? error.message : 'Could not send a group-call network candidate.'))
        }
      }
      connection.onconnectionstatechange = () => {
        if (connection.connectionState === 'failed') {
          updateCall((current) => ({ ...current, error: 'A group connection failed. This network may require a TURN relay.' }))
        } else if (connection.connectionState === 'connected') {
          if (callTimeout.current !== undefined) window.clearTimeout(callTimeout.current)
          callTimeout.current = undefined
          markConnected()
        }
      }
    }
    const { connection, pendingCandidates: candidates } = peerConnectionState
    await connection.setRemoteDescription(signal.description)
    await addPendingCandidates(connection, candidates)
    const answer = await connection.createAnswer()
    await connection.setLocalDescription(answer)
    await sendGroup(active.groupCallId, { type: 'answer', to: peerId, description: answer })
  }

  async function setupGroupRoom(callId: string) {
    if (!userId) throw new Error('Sign in before joining a group call.')
    return openRoom(`inzu-group-call:${callId}`, (channel) => {
      channel.on('broadcast', { event: 'signal' }, ({ payload }) => {
        const signal = payload as GroupSignal
        if (!userId || signal.from === userId || (signal.to && signal.to !== userId)) return
        const active = callRef.current
        if (!active || active.groupCallId !== callId) return
        if (signal.type === 'join' && signal.peer) {
          const wasKnown = active.participants.some((participant) => participant.peer.id === signal.from)
          updateCall((current) => {
            const nextParticipants = current.participants.filter((participant) => participant.peer.id !== signal.from)
            return { ...current, participants: [...nextParticipants, { peer: signal.peer!, stream: null }] }
          })
          if (!wasKnown) {
            void sendGroupOffer(active, signal.from)
              .catch((error: unknown) => peopleRef.current.onError(error instanceof Error ? error.message : 'Could not connect a group member.'))
          }
        } else if (signal.type === 'leave') {
          groupConnections.current.get(signal.from)?.connection.close()
          groupConnections.current.delete(signal.from)
          updateCall((current) => ({
            ...current,
            participants: current.participants.filter((participant) => participant.peer.id !== signal.from),
          }))
        } else if (signal.type === 'offer' && signal.description) {
          void answerGroupOffer(signal).catch((error: unknown) => peopleRef.current.onError(error instanceof Error ? error.message : 'Could not answer a group call.'))
        } else if (signal.type === 'answer' && signal.description) {
          const connection = groupConnections.current.get(signal.from)
          if (connection) {
            void connection.connection.setRemoteDescription(signal.description)
              .then(() => addPendingCandidates(connection.connection, connection.pendingCandidates))
              .catch((error: unknown) => peopleRef.current.onError(error instanceof Error ? error.message : 'Could not connect a group member.'))
          }
        } else if (signal.type === 'ice' && signal.candidate) {
          const connection = groupConnections.current.get(signal.from)
          if (connection?.connection.remoteDescription) {
            void connection.connection.addIceCandidate(signal.candidate)
              .catch((error: unknown) => peopleRef.current.onError(error instanceof Error ? error.message : 'Could not add a group network candidate.'))
          } else if (connection) {
            connection.pendingCandidates.push(signal.candidate)
          }
        } else if (signal.type === 'gift' && signal.gift) {
          receiveGift(peopleRef.current.getPeer(signal.from).name, signal.gift)
        } else if (signal.type === 'end') {
          clearCallState()
          peopleRef.current.onError('The group call has ended.')
        }
      })
    }, groupRooms.current, callId)
  }

  useEffect(() => {
    for (const room of rooms.current.values()) void supabase?.removeChannel(room.channel)
    rooms.current.clear()
    clearCallState()
  }, [userId])

  useEffect(() => {
    if (!userId || !supabase) return
    conversations.forEach(setupDirectRoom)
  }, [userId, conversations.map((conversation) => conversation.id).join(',')])

  useEffect(() => () => {
    for (const room of rooms.current.values()) void supabase?.removeChannel(room.channel)
    rooms.current.clear()
    clearCallState()
  }, [])

  async function startCall(conversation: ConversationPeer, peer: CallPeer, mode: CallMode) {
    if (callRef.current) {
      peopleRef.current.onError('Finish your current call before starting another one.')
      return
    }
    try {
      setupDirectRoom(conversation)
      const room = rooms.current.get(conversation.id)
      if (!room) throw new Error('Call signaling could not be started.')
      await room.ready
      const localStream = await acquireMedia(mode)
      const active: ActiveCall = {
        conversationId: conversation.id, ownerId: userId ?? '', peer, participants: [], mode,
        phase: 'calling', localStream, remoteStream: null, microphoneOn: true, cameraOn: mode === 'video',
      }
      callRef.current = active
      setCall(active)
      await sendDirect(conversation.id, peer.id, { type: 'invite', mode })
      inviteInterval.current = window.setInterval(() => {
        if (callRef.current?.phase === 'calling') {
          void sendDirect(conversation.id, peer.id, { type: 'invite', mode }).catch(peopleRef.current.onError)
        }
      }, 3000)
      callTimeout.current = window.setTimeout(() => {
        if (callRef.current?.phase === 'calling') {
          void sendDirect(conversation.id, peer.id, { type: 'end' }).catch(() => undefined)
          clearCallState()
          peopleRef.current.onError('No answer. The call has ended.')
        }
      }, 45000)
    } catch (error) {
      clearCallState()
      peopleRef.current.onError(error instanceof Error ? error.message : 'Could not start the call.')
    }
  }

  async function startGroupCall(invitees: GroupCallInvitee[], mode: CallMode) {
    if (!userId) throw new Error('Sign in before starting a group call.')
    if (callRef.current) throw new Error('Finish your current call before starting another one.')
    if (invitees.length < 1 || invitees.length > 7) throw new Error('Choose between 1 and 7 people for a group call.')
    let groupCallId: string | undefined
    try {
      const localStream = await acquireMedia(mode)
      groupCallId = await createGroupCallRoom(invitees.map((invitee) => invitee.peer.id), mode)
      const active: ActiveCall = {
        conversationId: invitees[0].conversation.id,
        groupCallId,
        ownerId: userId,
        peer: invitees[0].peer,
        participants: [],
        mode,
        phase: 'calling',
        localStream,
        remoteStream: null,
        microphoneOn: true,
        cameraOn: mode === 'video',
      }
      callRef.current = active
      setCall(active)
      await setupGroupRoom(groupCallId)
      await sendGroup(groupCallId, {
        type: 'join',
        peer: peopleRef.current.getPeer(userId),
      })
      for (const invitee of invitees) {
        setupDirectRoom(invitee.conversation)
        await rooms.current.get(invitee.conversation.id)?.ready
        await sendDirect(invitee.conversation.id, invitee.peer.id, { type: 'group-invite', mode, groupCallId })
      }
      callTimeout.current = window.setTimeout(() => {
        if (callRef.current?.groupCallId === groupCallId && callRef.current.participants.length === 0) {
          void endCall()
          peopleRef.current.onError('No one joined the group call. It has ended.')
        }
      }, 45000)
    } catch (error) {
      if (groupCallId) {
        await endGroupCallRoom(groupCallId).catch((closeError: unknown) => {
          peopleRef.current.onError(closeError instanceof Error ? closeError.message : 'The unused group-call room could not be closed.')
        })
      }
      clearCallState()
      throw error
    }
  }

  async function acceptCall() {
    const active = callRef.current
    if (!active || active.phase !== 'incoming') return
    try {
      const localStream = await acquireMedia(active.mode)
      updateCall((current) => ({ ...current, localStream, phase: 'connecting' }))
      if (active.groupCallId) {
        await joinGroupCallRoom(active.groupCallId)
        await setupGroupRoom(active.groupCallId)
        await sendGroup(active.groupCallId, { type: 'join', peer: peopleRef.current.getPeer(userId ?? '') })
      } else {
        await sendDirect(active.conversationId, active.peer.id, { type: 'accepted' })
      }
      callTimeout.current = window.setTimeout(() => {
        if (callRef.current?.phase === 'connecting') {
          peopleRef.current.onError('The call could not connect. A TURN relay may be required on this network.')
          void endCall()
        }
      }, 30000)
    } catch (error) {
      peopleRef.current.onError(error instanceof Error ? error.message : 'Could not accept the call.')
      await endCall()
    }
  }

  async function endCall(notifyPeer = true) {
    const active = callRef.current
    if (!active) return
    if (active.groupCallId) {
      try {
        if (active.phase === 'incoming') {
          if (notifyPeer) {
            await sendDirect(active.conversationId, active.peer.id, {
              type: 'declined',
              groupCallId: active.groupCallId,
            })
          }
        } else if (active.ownerId === userId) {
          if (notifyPeer) await sendGroup(active.groupCallId, { type: 'end' })
          await endGroupCallRoom(active.groupCallId)
        } else {
          if (notifyPeer) await sendGroup(active.groupCallId, { type: 'leave' })
          await leaveGroupCallRoom(active.groupCallId)
        }
      } catch (error) {
        peopleRef.current.onError(error instanceof Error ? error.message : 'The other call participants may not have received the hang-up.')
      }
    } else if (notifyPeer) {
      const signal = active.phase === 'incoming' ? 'declined' : 'end'
      try {
        await sendDirect(active.conversationId, active.peer.id, { type: signal })
      } catch (error) {
        peopleRef.current.onError(error instanceof Error ? error.message : 'The other person may not have received the hang-up.')
      }
    }
    clearCallState()
  }

  async function sendGift(gift: { emoji: string; label: string }) {
    const active = callRef.current
    if (!active || active.phase !== 'connected') {
      peopleRef.current.onError('Gifts can be sent after the call connects.')
      return
    }
    try {
      if (active.groupCallId) await sendGroup(active.groupCallId, { type: 'gift', gift })
      else await sendDirect(active.conversationId, active.peer.id, { type: 'gift', gift })
      receiveGift('You', gift)
    } catch (error) {
      peopleRef.current.onError(error instanceof Error ? error.message : 'Could not send the call gift.')
    }
  }

  async function sendTyping(conversationId: string, peerId: string, typing: boolean) {
    await sendDirect(conversationId, peerId, { type: 'typing', typing })
  }

  function toggleMicrophone() {
    const active = callRef.current
    if (!active?.localStream) return
    const enabled = !active.microphoneOn
    active.localStream.getAudioTracks().forEach((track) => { track.enabled = enabled })
    updateCall((current) => ({ ...current, microphoneOn: enabled }))
  }

  function toggleCamera() {
    const active = callRef.current
    if (!active?.localStream) return
    const enabled = !active.cameraOn
    active.localStream.getVideoTracks().forEach((track) => { track.enabled = enabled })
    updateCall((current) => ({ ...current, cameraOn: enabled }))
  }

  return { call, startCall, startGroupCall, acceptCall, endCall, toggleMicrophone, toggleCamera, sendGift, sendTyping }
}
