import { Copy, CreditCard, Heart, Mail, MessageCircle, Send, Share2, ThumbsDown, ThumbsUp, Users, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import type { Channel } from "@/pages/Home";

type ShareMethod = "copy" | "email" | "whatsapp" | "direct";

export default function WatchEngagement({ channel, onOpenRoom, onOpenPricing }: { channel: Channel; onOpenRoom: () => void; onOpenPricing: () => void }) {
  const { user, isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const [comment, setComment] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [method, setMethod] = useState<ShareMethod>("copy");
  const engagement = trpc.engagement.get.useQuery({ channelId: channel.id }, { refetchInterval: 5000 });
  const react = trpc.engagement.react.useMutation({ onSuccess: () => utils.engagement.get.invalidate({ channelId: channel.id }) });
  const postComment = trpc.engagement.comment.useMutation({ onSuccess: () => { setComment(""); utils.engagement.get.invalidate({ channelId: channel.id }); } });
  const trackShare = trpc.engagement.share.useMutation();
  const data = engagement.data;

  const requireLogin = () => {
    if (isAuthenticated) return true;
    toast("Sign in to use community features");
    startLogin();
    return false;
  };

  const toggleReaction = (reaction: "like" | "dislike") => {
    if (!requireLogin()) return;
    react.mutate({ channelId: channel.id, reaction: data?.viewerReaction === reaction ? null : reaction });
  };

  const submitComment = () => {
    if (!comment.trim() || !requireLogin()) return;
    postComment.mutate({ channelId: channel.id, body: comment.trim() });
  };

  const completeShare = async () => {
    if (!recipient.trim()) {
      toast.error("Add the person, group, or destination you are sharing to");
      return;
    }
    if (!requireLogin()) return;
    const url = window.location.href;
    await trackShare.mutateAsync({ channelId: channel.id, channelName: channel.name, recipient: recipient.trim(), method });
    if (method === "email") window.location.href = `mailto:${encodeURIComponent(recipient.trim())}?subject=${encodeURIComponent(`Watch ${channel.name} on WONDERBOX`)}&body=${encodeURIComponent(url)}`;
    else if (method === "whatsapp") window.open(`https://wa.me/${recipient.replace(/\D/g, "")}?text=${encodeURIComponent(`Watch ${channel.name} on WONDERBOX: ${url}`)}`, "_blank", "noopener,noreferrer");
    else if (method === "direct" && navigator.share) await navigator.share({ title: channel.name, text: `Watch ${channel.name} on WONDERBOX`, url });
    else await navigator.clipboard.writeText(url);
    toast.success("Share recorded and link prepared");
    setShareOpen(false);
    setRecipient("");
  };

  return <>
    <div className="channel-action-row">
      <div className="channel-identity"><span>{channel.logo ? <img src={channel.logo} alt="" /> : channel.name.slice(0, 2)}</span><div><strong>{channel.name}</strong><small>{channel.group} · Public live feed</small></div></div>
      <div className="watch-actions">
        <div className="reaction-group">
          <button className={data?.viewerReaction === "like" ? "active" : ""} onClick={() => toggleReaction("like")}><ThumbsUp size={17} /> {data?.likes || 0}</button>
          <button className={data?.viewerReaction === "dislike" ? "active" : ""} onClick={() => toggleReaction("dislike")} aria-label="Dislike"><ThumbsDown size={17} /> {data?.dislikes || 0}</button>
        </div>
        <button onClick={() => setShareOpen(true)}><Share2 size={17} /> Share</button>
        <button onClick={onOpenRoom}><Users size={17} /> Watch together</button>
        <button onClick={onOpenPricing}><CreditCard size={17} /> Plans</button>
      </div>
    </div>

    <section className="watch-comments">
      <div className="comments-heading"><div><p className="eyebrow">Live community</p><h2>{data?.comments.length || 0} comments</h2></div><span><span className="live-pulse" /> Refreshes live</span></div>
      <div className="comment-composer"><span className="comment-avatar">{(user?.name || "Guest").slice(0, 2).toUpperCase()}</span><div><textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder={isAuthenticated ? "Add a live comment…" : "Sign in to join the conversation"} rows={2} /><button onClick={submitComment} disabled={!comment.trim() || postComment.isPending}><Send size={15} /> Comment</button></div></div>
      <div className="comment-list">{data?.comments.length ? data.comments.map((item) => <article key={item.id}><span className="comment-avatar">{(item.name || "Viewer").slice(0, 2).toUpperCase()}</span><div><header><strong>{item.name || "WONDERBOX viewer"}</strong><time>{new Date(item.createdAt).toLocaleString()}</time></header><p>{item.body}</p><button><Heart size={13} /> Appreciate</button></div></article>) : <div className="comments-empty"><MessageCircle size={20} /><p>Start the conversation for this channel.</p></div>}</div>
    </section>

    {shareOpen && <div className="share-backdrop" role="dialog" aria-modal="true" aria-label="Share this channel"><div className="share-dialog"><button className="share-close" onClick={() => setShareOpen(false)} aria-label="Close"><X size={18} /></button><p className="eyebrow">Tracked share</p><h2>Share {channel.name}</h2><p>WONDERBOX records who shared this channel and the destination label for owner analytics.</p><label>Person, email, phone, or group<input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="e.g. Alex, family group, alex@example.com" /></label><div className="share-methods"><button onClick={() => setMethod("copy")} className={method === "copy" ? "active" : ""}><Copy size={16} /> Copy link</button><button onClick={() => setMethod("email")} className={method === "email" ? "active" : ""}><Mail size={16} /> Email</button><button onClick={() => setMethod("whatsapp")} className={method === "whatsapp" ? "active" : ""}><MessageCircle size={16} /> WhatsApp</button><button onClick={() => setMethod("direct")} className={method === "direct" ? "active" : ""}><Share2 size={16} /> Device share</button></div><button className="primary-button share-submit" onClick={completeShare} disabled={trackShare.isPending}>{trackShare.isPending ? "Recording…" : "Continue to share"}</button></div></div>}
  </>;
}
