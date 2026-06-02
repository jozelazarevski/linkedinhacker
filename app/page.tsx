"use client";

import { useEffect, useState } from "react";
import { api } from "./lib-client";
import Compose from "./components/Compose";
import Posts from "./components/Posts";
import Calendar from "./components/Calendar";
import Engage from "./components/Engage";
import Cockpit from "./components/Cockpit";
import Analytics from "./components/Analytics";

interface Me {
  configured: boolean;
  aiEnabled: boolean;
  account: {
    name: string | null;
    email: string | null;
    picture: string | null;
    tokenExpiresAt: number;
    tokenExpired: boolean;
  } | null;
}

type Tab = "compose" | "posts" | "calendar" | "engage" | "cockpit" | "analytics";

export default function Home() {
  const [me, setMe] = useState<Me | null>(null);
  const [tab, setTab] = useState<Tab>("compose");
  const [refreshKey, setRefreshKey] = useState(0);
  const [authError, setAuthError] = useState<string | null>(null);

  function loadMe() {
    api<Me>("/api/me").then(setMe).catch(() => setMe(null));
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const e = params.get("auth_error");
    if (e) {
      setAuthError(e);
      window.history.replaceState({}, "", "/");
    }
    loadMe();
  }, []);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    loadMe();
  }

  const bump = () => setRefreshKey((k) => k + 1);

  if (!me) {
    return (
      <div className="container">
        <p>Loading…</p>
      </div>
    );
  }

  // Landing / sign-in
  if (!me.account) {
    return (
      <>
        <header className="topbar">
          <div className="brand">
            <span className="logo">in</span> LinkedIn Growth Studio
          </div>
        </header>
        <div className="container">
          <div className="hero">
            <h1>Grow on LinkedIn — the legit way</h1>
            <p>
              Schedule and publish your own posts through LinkedIn&apos;s official API, draft with AI,
              and manage engagement with a human-in-the-loop queue. No bots, no scraping, no
              ban-risk automation.
            </p>

            {authError && <div className="notice error">Sign-in failed: {authError}</div>}

            {me.configured ? (
              <a href="/api/auth/login">
                <button>Sign in with LinkedIn</button>
              </a>
            ) : (
              <div className="notice warn">
                LinkedIn OAuth isn&apos;t configured yet. Copy <code>.env.example</code> to{" "}
                <code>.env.local</code> and add your app credentials (see the README).
              </div>
            )}

            <div className="feature-grid">
              <div className="card">
                <h2>✍️ Compose &amp; schedule</h2>
                <p className="sub">Publish now or queue posts for the perfect time.</p>
              </div>
              <div className="card">
                <h2>🤖 AI drafting</h2>
                <p className="sub">Value-first drafts and rewrites — never engagement-bait.</p>
              </div>
              <div className="card">
                <h2>💬 Smart engagement</h2>
                <p className="sub">Draft thoughtful comments you approve and post yourself.</p>
              </div>
              <div className="card">
                <h2>📊 Cadence analytics</h2>
                <p className="sub">Track consistency — the real driver of follower growth.</p>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Authenticated app
  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="logo">in</span> LinkedIn Growth Studio
        </div>
        <div className="user">
          {me.account.picture && <img src={me.account.picture} alt="" />}
          <span>{me.account.name || me.account.email}</span>
          <button className="ghost" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      <div className="container">
        <div className="tabs">
          {(
            [
              ["compose", "✍️ Compose"],
              ["posts", "🗂 Posts"],
              ["calendar", "📅 Calendar"],
              ["engage", "💬 Engage"],
              ["cockpit", "🎯 Cockpit"],
              ["analytics", "📊 Analytics"],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <div
              key={key}
              className={`tab ${tab === key ? "active" : ""}`}
              onClick={() => setTab(key)}
            >
              {label}
            </div>
          ))}
        </div>

        {tab === "compose" && (
          <Compose aiEnabled={me.aiEnabled} tokenExpired={me.account.tokenExpired} onChange={bump} />
        )}
        {tab === "posts" && <Posts refreshKey={refreshKey} onChange={bump} />}
        {tab === "calendar" && (
          <Calendar refreshKey={refreshKey} aiEnabled={me.aiEnabled} onChange={bump} />
        )}
        {tab === "engage" && <Engage aiEnabled={me.aiEnabled} />}
        {tab === "cockpit" && <Cockpit aiEnabled={me.aiEnabled} />}
        {tab === "analytics" && <Analytics refreshKey={refreshKey} />}
      </div>
    </>
  );
}
