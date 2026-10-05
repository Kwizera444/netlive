import { useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export type CallPeer = { id: string; name: string; avatar: string }
export type CallMode = 'voice' | 'video'
export type ActiveCall = {
  conversationId: string
  peer: CallPeer
  mode: CallMode
  phase: 'incoming' | 'calling' | 'connecting' | 'connected'
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  microphoneOn: boolean
  cameraOn: boolean
  error?: string
}

type ConversationPeer = { id: string; userId: string }
type Signal = {
  from: string
  to: string
  type: 'invite' | 'accepted' | 'declined' | 'busy' | 'offer' | 'answer' | 'ice' | 'end'
  mode?: CallMode
  description?: RTCSessionDescriptionInit
  candidate?: RTCIceCandidateInit
}
type Room = { channel: RealtimeChannel; ready: Promise<void> }

const defaultIceServers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]

export function useWebRtcCalls(
  userId: string | undefined,
  conversations: ConversationPeer[],
  getPeer: (id: string) => CallPeer,
  onError: (message: string) => void,
) {
  const [call, setCall] = useState<ActiveCall | null>(null)
  const callRef = useRef<ActiveCall | null>(null)
  const rooms = useRef(new Map<string, Room>())
  const peerConnection = useRef<RTCPeerConnection | null>(null)
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([])
  const callTimeout = useRef<number | undefined>(undefined)
  const inviteInterval = useRef<number | undefined>(undefined)
  const peopleRef = useRef({ getPeer, onError })

  useEffect(() => { callRef.current = call }, [call])
  peopleRef.current = { getPeer, onError }

  function clearMedia() {
    if (callTimeout.current !== undefined) window.clearTimeout(callTimeout.current)
    if (inviteInterval.current !== undefined) window.clearInterval(inviteInterval.current)
    callTimeout.current = undefined
    inviteInterval.current = undefined
    peerConnection.current?.close()
    peerConnection.current = null
    pendingCandidates.current = []
    callRef.current?.localStream?.getTracks().forEach((track) => track.stop())
    setCall(null)
    callRef.current = null
  }

  async function send(conversationId: string, message: Omit<Signal, 'from' | 'to'>, peerId: string) {
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

  async function acquireMedia(mode: CallMode) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Calls need a secure connection (HTTPS) and a browser with microphone support.')
    }
    return navigator.mediaDevices.getUserMedia({
      audio: true,
      video: mode === 'video' ? { facingMode: 'user' } : false,
    })
  }

  function updateCall(update: (current: ActiveCall) => ActiveCall) {
    const current = callRef.current
    if (!current) return
    const next = update(current)
    callRef.current = next
    setCall(next)
  }

  async function addPendingCandidates(connection: RTCPeerConnection) {
    const candidates = pendingCandidates.current
    pendingCandidates.current = []
    for (const candidate of candidates) await connection.addIceCandidate(candidate)
  }

  async function createConnection(active: ActiveCall) {
    const connection = new RTCPeerConnection({ iceServers: defaultIceServers })
    peerConnection.current = connection
    active.localStream?.getTracks().forEach((track) => connection.addTrack(track, active.localStream!))
    connection.ontrack = (event) => {
      const stream = event.streams[0]
      if (stream) updateCall((current) => ({ ...current, remoteStream: stream }))
    }
    connection.onicecandidate = (event) => {
      if (!event.candidate) return
      void send(active.conversationId, { type: 'ice', candidate: event.candidate.toJSON() }, active.peer.id)
        .catch((error: unknown) => peopleRef.current.onError(error instanceof Error ? error.message : 'Could not send a network candidate.'))
    }
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === 'connected') {
        if (callTimeout.current !== undefined) window.clearTimeout(callTimeout.current)
        callTimeout.current = undefined
        updateCall((current) => ({ ...current, phase: 'connected' }))
      }
      if (connection.connectionState === 'failed') {
        updateCall((current) => ({ ...current, error: 'Could not connect. A TURN relay may be required on this network.' }))
      }
    }
    return connection
  }

  async function makeOffer() {
    const active = callRef.current
    if (!active) return
    const connection = await createConnection(active)
    const offer = await connection.createOffer()
    await connection.setLocalDescription(offer)
    await send(active.conversationId, { type: 'offer', description: offer }, active.peer.id)
    updateCall((current) => ({ ...current, phase: 'connecting' }))
  }

  async function acceptOffer(description: RTCSessionDescriptionInit) {
    const active = callRef.current
    if (!active) return
    const connection = peerConnection.current ?? await createConnection(active)
    await connection.setRemoteDescription(description)
    await addPendingCandidates(connection)
    const answer = await connection.createAnswer()
    await connection.setLocalDescription(answer)
    await send(active.conversationId, { type: 'answer', description: answer }, active.peer.id)
    updateCall((current) => ({ ...current, phase: 'connecting' }))
  }

  function setupRoom(conversation: ConversationPeer) {
    if (!userId || !supabase || rooms.current.has(conversation.id)) return
    let resolveReady: () => void = () => undefined
    let rejectReady: (error: Error) => void = () => undefined
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve
      rejectReady = reject
    })
    void ready.catch(() => undefined)
    const channel = supabase.channel(`inzu-call:${conversation.id}`, {
      config: { private: true, broadcast: { ack: true, self: false } },
    })
    rooms.current.set(conversation.id, { channel, ready })
    channel.on('broadcast', { event: 'signal' }, ({ payload }) => {
      const signal = payload as Signal
      if (signal.to !== userId || signal.from !== conversation.userId) return
      const active = callRef.current
      if (signal.type === 'invite') {
        if (active) {
          if (active.conversationId === conversation.id && active.peer.id === signal.from) return
          void send(conversation.id, { type: 'busy' }, signal.from).catch(peopleRef.current.onError)
          return
        }
        if (signal.mode !== 'voice' && signal.mode !== 'video') return
        const incoming: ActiveCall = {
          conversationId: conversation.id,
          peer: peopleRef.current.getPeer(signal.from),
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
      if (!active || active.conversationId !== conversation.id || active.peer.id !== signal.from) return
      if (signal.type === 'accepted' && active.phase === 'calling') {
        if (inviteInterval.current !== undefined) window.clearInterval(inviteInterval.current)
        inviteInterval.current = undefined
        void makeOffer().catch((error: unknown) => peopleRef.current.onError(error instanceof Error ? error.message : 'Could not start the call.'))
      } else if (signal.type === 'declined' || signal.type === 'busy' || signal.type === 'end') {
        clearMedia()
        if (signal.type !== 'end') peopleRef.current.onError(signal.type === 'busy' ? `${active.peer.name} is already on another call.` : `${active.peer.name} declined the call.`)
      } else if (signal.type === 'offer' && signal.description) {
        void acceptOffer(signal.description).catch((error: unknown) => peopleRef.current.onError(error instanceof Error ? error.message : 'Could not answer the call.'))
      } else if (signal.type === 'answer' && signal.description && peerConnection.current) {
        void peerConnection.current.setRemoteDescription(signal.description)
          .then(() => addPendingCandidates(peerConnection.current!))
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
    channel.subscribe((status, error) => {
      if (status === 'SUBSCRIBED') resolveReady()
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        rejectReady(new Error(error?.message ?? 'Call signaling could not connect. Apply the calls migration and try again.'))
      }
    })
  }

  useEffect(() => {
    for (const room of rooms.current.values()) void supabase?.removeChannel(room.channel)
    rooms.current.clear()
    callRef.current?.localStream?.getTracks().forEach((track) => track.stop())
    peerConnection.current?.close()
    peerConnection.current = null
    pendingCandidates.current = []
    if (inviteInterval.current !== undefined) window.clearInterval(inviteInterval.current)
    inviteInterval.current = undefined
    if (callTimeout.current !== undefined) window.clearTimeout(callTimeout.current)
    callTimeout.current = undefined
    callRef.current = null
    setCall(null)
  }, [userId])

  useEffect(() => {
    if (!userId || !supabase) return
    conversations.forEach(setupRoom)
  }, [userId, conversations.map((conversation) => conversation.id).join(',')])

  useEffect(() => () => {
    for (const room of rooms.current.values()) void supabase?.removeChannel(room.channel)
    rooms.current.clear()
    callRef.current?.localStream?.getTracks().forEach((track) => track.stop())
    peerConnection.current?.close()
    if (callTimeout.current !== undefined) window.clearTimeout(callTimeout.current)
    if (inviteInterval.current !== undefined) window.clearInterval(inviteInterval.current)
  }, [])

  async function startCall(conversation: ConversationPeer, peer: CallPeer, mode: CallMode) {
    const { id: conversationId } = conversation
    if (callRef.current) {
      onError('Finish your current call before starting another one.')
      return
    }
    try {
      setupRoom(conversation)
      const room = rooms.current.get(conversationId)
      if (!room) throw new Error('Call signaling could not be started.')
      await room.ready
      const localStream = await acquireMedia(mode)
      const active: ActiveCall = {
        conversationId, peer, mode, phase: 'calling', localStream, remoteStream: null,
        microphoneOn: true, cameraOn: mode === 'video',
      }
      callRef.current = active
      setCall(active)
      await send(conversationId, { type: 'invite', mode }, peer.id)
      inviteInterval.current = window.setInterval(() => {
        if (callRef.current?.phase === 'calling') {
          void send(conversationId, { type: 'invite', mode }, peer.id).catch(peopleRef.current.onError)
        }
      }, 3000)
      callTimeout.current = window.setTimeout(() => {
        if (callRef.current?.phase === 'calling') {
          void send(conversationId, { type: 'end' }, peer.id).catch(() => undefined)
          clearMedia()
          onError('No answer. The call has ended.')
        }
      }, 45000)
    } catch (error) {
      callRef.current?.localStream?.getTracks().forEach((track) => track.stop())
      callRef.current = null
      setCall(null)
      onError(error instanceof Error ? error.message : 'Could not start the call.')
    }
  }

  async function acceptCall() {
    const active = callRef.current
    if (!active || active.phase !== 'incoming') return
    try {
      const localStream = await acquireMedia(active.mode)
      updateCall((current) => ({ ...current, localStream }))
      updateCall((current) => ({ ...current, phase: 'connecting' }))
      await send(active.conversationId, { type: 'accepted' }, active.peer.id)
      callTimeout.current = window.setTimeout(() => {
        if (callRef.current?.phase === 'connecting') {
          onError('The call could not connect. A TURN relay may be required on this network.')
          endCall()
        }
      }, 30000)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not accept the call.')
      endCall(false)
    }
  }

  async function endCall(notifyPeer = true) {
    const active = callRef.current
    if (!active) return
    if (notifyPeer) {
      const signal = active.phase === 'incoming' ? 'declined' : 'end'
      try {
        await send(active.conversationId, { type: signal }, active.peer.id)
      } catch (error) {
        onError(error instanceof Error ? error.message : 'The other person may not have received the hang-up.')
      }
    }
    clearMedia()
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

  return { call, startCall, acceptCall, endCall, toggleMicrophone, toggleCamera }
}
