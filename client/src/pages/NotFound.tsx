import { RadioTower } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return <div className="app"><div className="state">
    <RadioTower size={40} />
    <h2>Nothing on this channel</h2>
    <p>The page you’re looking for doesn’t exist.</p>
    <Link href="/" className="btn btn-light">Back to home</Link>
  </div></div>;
}
