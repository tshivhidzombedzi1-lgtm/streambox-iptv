import { ArrowLeft, BarChart3, Share2, ShieldAlert } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

const LOGO = "/manus-storage/wonderbox-logo-clean_4a0b7be4.png";

export default function ShareAnalyticsScreen() {
  const { user, loading } = useAuth();
  const isAdmin = user?.role === "admin";
  const shares = trpc.analytics.shares.useQuery({ limit: 100 }, { enabled: isAdmin });
  if (loading) return <main className="analytics-screen"><div className="analytics-empty">Loading account…</div></main>;
  if (!isAdmin) return <main className="analytics-screen"><Link href="/home" className="analytics-logo"><img src={LOGO} alt="WONDERBOX" /></Link><div className="analytics-empty"><ShieldAlert size={28} /><h1>Owner access only</h1><p>Share recipient data is available only to WONDERBOX administrators.</p><Link href="/home" className="primary-button">Return home</Link></div></main>;
  return <main className="analytics-screen">
    <header><Link href="/home" className="analytics-logo"><img src={LOGO} alt="WONDERBOX" /></Link><Link href="/home" className="back-link"><ArrowLeft size={15} /> Back to WONDERBOX</Link></header>
    <div className="analytics-wrap"><p className="eyebrow">Owner intelligence</p><div className="analytics-title"><div><h1>Share analytics</h1><p>See who shared which channel, the destination they entered, the method, and when it happened.</p></div><span><BarChart3 size={18} /> {shares.data?.length || 0} recent shares</span></div>
      <div className="analytics-table"><div className="analytics-table-head"><span>Shared by</span><span>Channel</span><span>Recipient / destination</span><span>Method</span><span>Time</span></div>{shares.data?.length ? shares.data.map((share) => <div className="analytics-row" key={share.id}><span><strong>{share.userName || "Viewer"}</strong><small>{share.userEmail || `User #${share.userId}`}</small></span><span><strong>{share.channelName}</strong><small>{share.channelId}</small></span><span>{share.recipient}</span><span className="analytics-method"><Share2 size={14} /> {share.method}</span><time>{new Date(share.createdAt).toLocaleString()}</time></div>) : <div className="analytics-empty compact"><Share2 size={23} /><p>No tracked shares yet.</p></div>}</div>
    </div>
  </main>;
}
