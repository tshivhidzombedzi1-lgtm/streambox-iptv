import { useEffect, useState } from "react";

type Totals = { gross: number | null; n: number };
type Summary = {
  status: string; subscribers: number; month: Totals; all: Totals;
  recent: { id: string; kind: string; plan: string | null; amount: number; currency: string; email: string; created_at: number }[];
};
const rand = (n: number | null) => `R${(n || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const STATUS: Record<string, string> = {
  off: "Off: payments aren't switched on yet.",
  "missing details": "Switched on, but the Stripe keys are missing or incomplete.",
  "test mode": "Test mode: only admins can pay, with Stripe test cards.",
  live: "Live: viewers can pay.",
};

// Viewer payments (server/payments.ts): what came in and who's Premium.
export default function AdminPayments() {
  const [data, setData] = useState<Summary | null>(null);
  useEffect(() => { fetch("/api/admin/payments", { credentials: "same-origin" }).then((r) => r.json()).then(setData).catch(() => undefined); }, []);
  if (!data) return null;
  return <section className="admin-card">
    <h2>Payments</h2>
    <p className={`admin-empty ${data.status === "live" ? "pay-live" : ""}`}>{STATUS[data.status] || data.status}</p>
    <div className="admin-tiles pay-tiles">
      <div className="admin-tile"><span>This month</span><strong>{rand(data.month.gross)}</strong><small>{data.month.n} payments, before Stripe fees</small></div>
      <div className="admin-tile"><span>All time</span><strong>{rand(data.all.gross)}</strong><small>{data.all.n} payments</small></div>
      <div className="admin-tile"><span>Premium members</span><strong>{data.subscribers.toLocaleString("en-ZA")}</strong><small>with Premium right now</small></div>
    </div>
    {data.recent.length > 0 && <table className="sponsor-table"><thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Email</th></tr></thead>
      <tbody>{data.recent.map((p) => <tr key={p.id}>
        <td>{new Date(p.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}</td>
        <td>{p.kind === "tip" ? "Support" : `Premium (${p.plan === "annual" ? "yearly" : "monthly"})`}</td>
        <td>{rand(p.amount)}{p.currency && p.currency !== "zar" ? ` ${p.currency.toUpperCase()}` : ""}</td>
        <td>{p.email}</td>
      </tr>)}</tbody></table>}
  </section>;
}
