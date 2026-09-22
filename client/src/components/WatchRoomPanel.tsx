import { useEffect, useRef, useState } from "react";
import { Camera, Check, Copy, Crown, LogIn, MessageCircle, Mic, MicOff, Send, ShieldCheck, Users, Video, VideoOff, X } from "lucide-react";
import { toast } from "sonner";
import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

type RoomChannel = { id: string; name: string; url: string };
type Snapshot = { room?: { id: number; code: string; name: string; hostUserId: number }; members: Array<{ userId: number; role: "host" | "co-host" | "member"; name?: string | null }>; messages: Array<{ id: number; userId: number; body: string; name?: string | null; createdAt: Date }>; playback: { channelId: string; channelName: string; streamUrl: string; isPlaying: number; positionMs: number; updatedAt?: Date } | null };
type RoomSignal = { id: number; fromUserId: number; kind: "hello" | "offer" | "answer" | "ice"; payload: string };

export default function WatchRoomPanel({ open, onClose, activeChannel, onRemotePlayback }: { open: boolean; onClose: () => void; activeChannel: RoomChannel; onRemotePlayback: (playback: Snapshot["playback"]) => void }) {
  const { user, isAuthenticated } = useAuth();
  const [tab, setTab] = useState<"chat" | "people" | "vc">("chat");
  const [roomCode, setRoomCode] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [roomName, setRoomName] = useState("Friday night watch party");
  const [body, setBody] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [micOn, setMicOn] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<Map<number, RTCPeerConnection>>(new Map());
  const [remoteStreams, setRemoteStreams] = useState<Record<number, MediaStream>>({});
  const [afterSignalId, setAfterSignalId] = useState(0);
  const utils = trpc.useUtils();

  const roomQuery = trpc.watchRooms.get.useQuery({ code: roomCode }, { enabled: Boolean(roomCode && isAuthenticated && open), refetchInterval: 2500 });
  const createRoom = trpc.watchRooms.create.useMutation({ onSuccess: (data) => { setRoomCode(data.room.code); setSnapshot(data.snapshot as Snapshot); toast.success(`Room ${data.room.code} is ready`); } });
  const joinRoom = trpc.watchRooms.join.useMutation({ onSuccess: (data) => { setRoomCode(data.room.code); setSnapshot(data as Snapshot); toast.success("Joined the watch room"); } });
  const sendMessage = trpc.watchRooms.message.useMutation({ onSuccess: (data) => { setSnapshot(data as Snapshot); setBody(""); } });
  const sendSignal = trpc.watchRooms.signal.useMutation();
  const updatePlayback = trpc.watchRooms.playback.useMutation({ onSuccess: (data) => { setSnapshot(data as Snapshot); } });
  const setRole = trpc.watchRooms.setMemberRole.useMutation({ onSuccess: (data) => setSnapshot(data as Snapshot) });
  const signalsQuery = trpc.watchRooms.signals.useQuery({ code: roomCode, afterId: afterSignalId }, { enabled: Boolean(roomCode && isAuthenticated && open && (micOn || cameraOn)), refetchInterval: 1200 });

  useEffect(() => { if (roomQuery.data) setSnapshot(roomQuery.data as Snapshot); }, [roomQuery.data]);
  useEffect(() => { if (snapshot?.playback) onRemotePlayback(snapshot.playback); }, [snapshot?.playback?.updatedAt, snapshot?.playback?.channelId]);
  useEffect(() => () => { mediaRef.current?.getTracks().forEach((track) => track.stop()); }, []);
  useEffect(() => { if (videoRef.current && mediaRef.current) videoRef.current.srcObject = mediaRef.current; }, [cameraOn]);
  useEffect(() => {
    const incoming = (signalsQuery.data || []) as RoomSignal[];
    if (!incoming.length) return;
    incoming.forEach((signal) => handleSignal(signal));
    setAfterSignalId(Math.max(afterSignalId, ...incoming.map((signal) => signal.id)));
  }, [signalsQuery.data]);

  const sendPeerSignal = (toUserId: number, kind: RoomSignal["kind"], payload: unknown) => {
    if (!roomCode) return;
    sendSignal.mutate({ code: roomCode, toUserId, kind, payload: JSON.stringify(payload) });
  };

  const ensurePeer = (targetUserId: number, initiator: boolean) => {
    const existing = peerRef.current.get(targetUserId);
    if (existing) return existing;
    const peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    peerRef.current.set(targetUserId, peer);
    mediaRef.current?.getTracks().forEach((track) => peer.addTrack(track, mediaRef.current as MediaStream));
    peer.onicecandidate = (event) => { if (event.candidate) sendPeerSignal(targetUserId, "ice", event.candidate.toJSON()); };
    peer.ontrack = (event) => { const stream = event.streams[0]; if (stream) setRemoteStreams((current) => ({ ...current, [targetUserId]: stream })); };
    if (initiator) peer.createOffer().then((offer) => peer.setLocalDescription(offer).then(() => sendPeerSignal(targetUserId, "offer", offer)));
    return peer;
  };

  async function handleSignal(signal: RoomSignal) {
    const initiator = (user?.id || 0) < signal.fromUserId;
    const peer = ensurePeer(signal.fromUserId, signal.kind === "hello" ? initiator : false);
    if (signal.kind === "hello") return;
    const payload = JSON.parse(signal.payload) as RTCSessionDescriptionInit & RTCIceCandidateInit;
    if (signal.kind === "offer") { await peer.setRemoteDescription(payload); const answer = await peer.createAnswer(); await peer.setLocalDescription(answer); sendPeerSignal(signal.fromUserId, "answer", answer); }
    if (signal.kind === "answer") await peer.setRemoteDescription(payload);
    if (signal.kind === "ice" && payload.candidate) await peer.addIceCandidate(payload);
  }

  if (!open) return null;
  const role = snapshot?.members.find((member) => member.userId === user?.id)?.role;
  const canControl = role === "host" || role === "co-host";
  const canPromote = role === "host";
  const isHost = role === "host";

  const startVoice = async () => {
    if (mediaRef.current) { mediaRef.current.getTracks().forEach((track) => track.stop()); peerRef.current.forEach((peer) => peer.close()); peerRef.current.clear(); mediaRef.current = null; setRemoteStreams({}); setMicOn(false); setCameraOn(false); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      mediaRef.current = stream; setMicOn(true); setCameraOn(true); if (videoRef.current) videoRef.current.srcObject = stream;
      snapshot?.members.filter((member) => member.userId !== user?.id).forEach((member) => sendPeerSignal(member.userId, "hello", { name: user?.name || "Guest" }));
      toast.success("Camera and microphone connected");
    } catch { toast.error("Camera or microphone permission was denied"); }
  };

  const syncPlayback = (playing: boolean) => {
    if (!roomCode || !canControl) return;
    updatePlayback.mutate({ code: roomCode, channelId: activeChannel.id, channelName: activeChannel.name, streamUrl: activeChannel.url, isPlaying: playing, positionMs: 0 });
  };

  return <aside className="watch-room-drawer" aria-label="Watch together room">
    <div className="watch-room-head"><div><div className="eyebrow room-eyebrow">Shared viewing</div><h2 className="font-display text-2xl font-bold text-white">Watch together</h2></div><button onClick={onClose} className="drawer-close"><X size={18} /></button></div>
    {!isAuthenticated ? <div className="room-login"><div className="room-icon"><Users size={22} /></div><h3>Make it a room</h3><p>Sign in to create a private watch channel, invite people, and keep playback under one host.</p><button onClick={startLogin} className="room-primary"><LogIn size={15} /> Sign in to continue</button></div> : !snapshot ? <div className="room-start"><div className="room-icon"><MessageCircle size={22} /></div><h3>Create or join a room</h3><p>Everyone in the room sees the same channel. The host controls play, pause, and channel changes.</p><button onClick={() => createRoom.mutate({ name: roomName })} className="room-primary"><Crown size={15} /> Create room</button><div className="room-divider"><span>or join with a code</span></div><div className="room-code-input"><input value={codeInput} onChange={(event) => setCodeInput(event.target.value.toUpperCase())} placeholder="NOVA-123" maxLength={12} /><button onClick={() => joinRoom.mutate({ code: codeInput })} disabled={codeInput.length < 4}><Check size={15} /></button></div><input value={roomName} onChange={(event) => setRoomName(event.target.value)} className="room-name-input" placeholder="Room name" /></div> : <>
      <div className="room-status"><div className="room-status-copy"><span className="room-live-dot" /> <b>{snapshot.room?.name}</b><small>{snapshot.members.length} watching · {isHost ? "You are host" : `${role || "member"} access`}</small></div><button onClick={() => navigator.clipboard?.writeText(snapshot.room?.code || "").then(() => toast.success("Room code copied"))} className="room-code"><Copy size={13} /> {snapshot.room?.code}</button></div>
      <div className="room-tabs"><button className={tab === "chat" ? "selected" : ""} onClick={() => setTab("chat")}><MessageCircle size={15} /> Chat</button><button className={tab === "people" ? "selected" : ""} onClick={() => setTab("people")}><Users size={15} /> People <span>{snapshot.members.length}</span></button><button className={tab === "vc" ? "selected" : ""} onClick={() => setTab("vc")}><Video size={15} /> VC</button></div>
      {tab === "chat" && <div className="room-chat"><div className="room-messages">{snapshot.messages.length ? snapshot.messages.map((message) => <div key={message.id} className={`room-message ${message.userId === user?.id ? "mine" : ""}`}><div className="message-meta"><b>{message.userId === user?.id ? "You" : message.name || "Guest"}</b><span>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></div><p>{message.body}</p></div>) : <div className="room-empty"><MessageCircle size={18} /><p>Say hello to the room.</p></div>}</div><form onSubmit={(event) => { event.preventDefault(); if (body.trim()) sendMessage.mutate({ code: roomCode, body }); }} className="room-composer"><input value={body} onChange={(event) => setBody(event.target.value)} placeholder="Message everyone…" /><button type="submit" disabled={!body.trim()}><Send size={15} /></button></form></div>}
      {tab === "people" && <div className="room-people"><div className="people-callout"><ShieldCheck size={17} /><span><b>Host controlled</b><small>Only the host and co-hosts can change what the room watches.</small></span></div>{snapshot.members.map((member) => <div className="person-row" key={member.userId}><div className="person-avatar">{(member.name || "G").slice(0, 1).toUpperCase()}</div><div className="person-copy"><b>{member.userId === user?.id ? "You" : member.name || "Guest"}</b><small>{member.role === "host" ? "Host" : member.role === "co-host" ? "Co-host" : "Member"}</small></div>{member.role === "host" && <Crown size={14} className="person-crown" />}{canPromote && member.userId !== user?.id && member.role === "member" && <button onClick={() => setRole.mutate({ code: roomCode, userId: member.userId, role: "co-host" })} className="promote-button">Make co-host</button>}</div>)}</div>}
      {tab === "vc" && <div className="room-vc"><div className="vc-preview">{cameraOn ? <video ref={videoRef} autoPlay muted playsInline /> : <div className="vc-placeholder"><VideoOff size={23} /><span>Camera off</span></div>}<span className="vc-badge"><span className="room-live-dot" /> Room VC</span></div>{Object.entries(remoteStreams).length > 0 && <div className="vc-remotes">{Object.entries(remoteStreams).map(([memberId, stream]) => <video key={memberId} autoPlay playsInline ref={(element) => { if (element) element.srcObject = stream; }} />)}</div>}<div className="vc-controls"><button onClick={() => { const next = !micOn; mediaRef.current?.getAudioTracks().forEach((track) => { track.enabled = next; }); setMicOn(next); }} className={micOn ? "vc-control active" : "vc-control"}>{micOn ? <Mic size={16} /> : <MicOff size={16} />}<span>{micOn ? "Mic on" : "Mic off"}</span></button><button onClick={() => { const next = !cameraOn; mediaRef.current?.getVideoTracks().forEach((track) => { track.enabled = next; }); setCameraOn(next); }} className={cameraOn ? "vc-control active" : "vc-control"}>{cameraOn ? <Camera size={16} /> : <VideoOff size={16} />}<span>{cameraOn ? "Camera on" : "Camera off"}</span></button><button onClick={startVoice} className="vc-control primary"><Video size={16} /><span>{mediaRef.current ? "Leave VC" : "Join VC"}</span></button></div><p className="vc-note">Peer-to-peer room calling is active. Your browser connects directly to the other people in this room; use a headset for the best experience.</p></div>}
      {canControl && <div className="host-dock"><div><span className="host-pill"><Crown size={12} /> {isHost ? "Host controls" : "Co-host controls"}</span><p>Room is tuned to <b>{activeChannel.name}</b></p></div><div className="host-actions"><button onClick={() => syncPlayback(true)}><Send size={13} /> Play for everyone</button><button onClick={() => syncPlayback(false)}><MicOff size={13} /> Pause everyone</button></div></div>}
    </>}
  </aside>;
}
