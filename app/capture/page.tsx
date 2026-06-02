"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "../lib-client";

// Landing page the quick-capture bookmarklet opens. It reads the selected post
// text + URL from the query string and adds it to the engagement queue, then
// auto-closes the popup. (You still post the comment yourself on LinkedIn.)
function CaptureInner() {
  const params = useSearchParams();
  const [state, setState] = useState<"saving" | "done" | "auth" | "error">("saving");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const kind = params.get("kind") === "person" ? "person" : "post";
    const url = params.get("url") || "";
    const context = params.get("text") || "";
    const name = params.get("name") || "";

    api("/api/targets", {
      method: "POST",
      body: JSON.stringify({ kind, url, context, name }),
    })
      .then(() => {
        setState("done");
        // Auto-close if we were opened as a popup.
        setTimeout(() => window.close(), 1200);
      })
      .catch((e: any) => {
        if (String(e.message).includes("authenticated")) setState("auth");
        else {
          setState("error");
          setErr(e.message);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="container" style={{ maxWidth: 480, textAlign: "center", paddingTop: 80 }}>
      <div className="card">
        {state === "saving" && (
          <p>
            <span className="spin" /> Adding to your engagement queue…
          </p>
        )}
        {state === "done" && (
          <>
            <h2>✅ Added to your queue</h2>
            <p className="muted">Open the Cockpit tab to draft a voice-matched reply.</p>
            <a href="/">
              <button className="secondary">Go to Studio</button>
            </a>
          </>
        )}
        {state === "auth" && (
          <>
            <h2>Sign in first</h2>
            <p className="muted">Log in to LinkedIn Growth Studio, then capture again.</p>
            <a href="/">
              <button>Go to sign in</button>
            </a>
          </>
        )}
        {state === "error" && <div className="notice error">{err}</div>}
      </div>
    </div>
  );
}

export default function CapturePage() {
  return (
    <Suspense fallback={<div className="container">Loading…</div>}>
      <CaptureInner />
    </Suspense>
  );
}
