"use client";

import { useEffect, useState } from "react";
import { api, fmtDate } from "../lib-client";

interface Profile {
  samples: string | null;
  styleGuide: string | null;
  updatedAt: number;
}

// Lets the user teach the app their writing voice by pasting their own posts.
// Everything the AI generates then matches this voice.
export default function Voice({ aiEnabled }: { aiEnabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [samples, setSamples] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    try {
      const { profile } = await api<{ profile: Profile | null }>("/api/voice");
      setProfile(profile);
      if (profile?.samples) setSamples(profile.samples);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    if (!samples.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const { profile } = await api<{ profile: Profile }>("/api/voice", {
        method: "POST",
        body: JSON.stringify({ samples }),
      });
      setProfile(profile);
      setMsg(
        profile.styleGuide
          ? "Voice saved & analyzed. New drafts will sound like you. ✍️"
          : "Samples saved. New drafts will mimic them."
      );
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  const trained = Boolean(profile?.samples);

  return (
    <div className="card">
      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
        onClick={() => setOpen((o) => !o)}
      >
        <h2 style={{ margin: 0 }}>
          🗣 Your voice {trained && <span className="pill approved">trained</span>}
        </h2>
        <button className="ghost" type="button">
          {open ? "Hide" : trained ? "Edit" : "Set up"}
        </button>
      </div>
      <p className="sub" style={{ marginTop: 8, marginBottom: open ? 16 : 0 }}>
        Hate generic AI writing? Paste a few of your own posts and everything the assistant writes —
        drafts, rewrites, comments — will sound like <em>you</em>, not a robot.
      </p>

      {open && (
        <>
          {!aiEnabled && (
            <div className="notice warn">
              AI is disabled, so style analysis is off — but your samples are still saved and used
              as examples once you add <code>ANTHROPIC_API_KEY</code>.
            </div>
          )}
          <label>Paste 2–5 of your own LinkedIn posts (separate them with blank lines)</label>
          <textarea
            rows={10}
            value={samples}
            onChange={(e) => setSamples(e.target.value)}
            placeholder="Paste posts you've actually written. The more authentic, the better the match."
          />
          {msg && <div className="notice info" style={{ marginTop: 10 }}>{msg}</div>}
          <div className="btn-row">
            <button onClick={save} disabled={busy || !samples.trim()}>
              {busy ? <span className="spin" /> : trained ? "Update my voice" : "Train my voice"}
            </button>
            {profile?.updatedAt && (
              <span className="muted" style={{ alignSelf: "center", fontSize: 12 }}>
                Updated {fmtDate(profile.updatedAt)}
              </span>
            )}
          </div>

          {profile?.styleGuide && (
            <div className="list-item" style={{ marginTop: 14 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                How the assistant sees your style:
              </div>
              <div className="body" style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>
                {profile.styleGuide}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
