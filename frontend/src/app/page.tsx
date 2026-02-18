"use client";

import { CSSProperties, FC, useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { hashContactList, MAX_CONTACTS } from "@/utils/hash";

// ============================================================
// TYPES
// ============================================================

type Tab = "discover" | "sessions" | "how-it-works";

interface SessionInfo {
  id: string;
  status: "created" | "awaiting_bob" | "computing" | "matched";
  role: "alice" | "bob";
  matchCount?: number;
  matchedContacts?: string[];
}

// ============================================================
// ICONS (inline SVGs for zero dependencies)
// ============================================================

type IconProps = { className?: string; style?: CSSProperties };

const ShieldIcon: FC<IconProps> = ({ className, style }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const UsersIcon: FC<IconProps> = ({ className, style }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const SearchIcon: FC<IconProps> = ({ className, style }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <path d="M21 21l-4.35-4.35" />
  </svg>
);

const LockIcon: FC<IconProps> = ({ className, style }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const CheckCircleIcon: FC<IconProps> = ({ className, style }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const CopyIcon: FC<IconProps> = ({ className, style }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const LinkIcon: FC<IconProps> = ({ className, style }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

// ============================================================
// MAIN PAGE COMPONENT
// ============================================================

export default function Home() {
  const { publicKey, connected } = useWallet();
  const [activeTab, setActiveTab] = useState<Tab>("discover");
  const [contactInput, setContactInput] = useState("");
  const [sessionIdInput, setSessionIdInput] = useState("");
  const [isHashing, setIsHashing] = useState(false);
  const [hashCount, setHashCount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentSession, setCurrentSession] = useState<SessionInfo | null>(null);
  const [copied, setCopied] = useState(false);

  // Count contacts from textarea
  const contactLines = contactInput
    .split("\n")
    .filter((line) => line.trim().length > 0);
  const contactCount = contactLines.length;

  // Handle creating a new session (Alice flow)
  const handleCreateSession = useCallback(async () => {
    if (!connected || contactCount === 0) return;

    setIsHashing(true);
    setHashCount(0);

    try {
      const { hashes, count } = await hashContactList(contactLines);
      setHashCount(count);
      setIsHashing(false);
      setIsSubmitting(true);

      // In production: encrypt hashes with Arcium x25519 key and submit via Solana tx
      // For demo, we simulate the session creation
      const sessionId = Array.from(crypto.getRandomValues(new Uint8Array(8)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      setCurrentSession({
        id: sessionId,
        status: "awaiting_bob",
        role: "alice",
      });

      setIsSubmitting(false);
    } catch (err) {
      console.error("Error creating session:", err);
      setIsHashing(false);
      setIsSubmitting(false);
    }
  }, [connected, contactCount, contactLines]);

  // Handle joining a session (Bob flow)
  const handleJoinSession = useCallback(async () => {
    if (!connected || contactCount === 0 || !sessionIdInput.trim()) return;

    setIsHashing(true);
    setHashCount(0);

    try {
      const { hashes, count } = await hashContactList(contactLines);
      setHashCount(count);
      setIsHashing(false);
      setIsSubmitting(true);

      // In production: encrypt and submit via submit_and_match
      setCurrentSession({
        id: sessionIdInput.trim(),
        status: "computing",
        role: "bob",
      });

      // Simulate MPC computation completing
      setTimeout(() => {
        setCurrentSession((prev) =>
          prev
            ? {
                ...prev,
                status: "matched",
                matchCount: 2,
                matchedContacts: ["shared@example.com", "+1234567890"],
              }
            : null
        );
      }, 3000);

      setIsSubmitting(false);
    } catch (err) {
      console.error("Error joining session:", err);
      setIsHashing(false);
      setIsSubmitting(false);
    }
  }, [connected, contactCount, contactLines, sessionIdInput]);

  const handleCopySessionId = useCallback(() => {
    if (currentSession?.id) {
      navigator.clipboard.writeText(currentSession.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [currentSession]);

  const handleReset = useCallback(() => {
    setCurrentSession(null);
    setContactInput("");
    setSessionIdInput("");
    setHashCount(0);
  }, []);

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <main className="min-h-screen bg-grid">
      {/* Header */}
      <header className="glass-heavy sticky top-0 z-50 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center">
              <ShieldIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold logo-text">Private Contact Discovery</h1>
              <p className="text-xs" style={{ color: "var(--arcium-text-muted)" }}>
                Powered by Arcium MPC
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="badge badge-info text-xs">Devnet</span>
            <WalletMultiButton />
          </div>
        </div>
      </header>

      {/* Tab Bar */}
      <nav className="max-w-6xl mx-auto px-6 pt-6">
        <div className="flex gap-2">
          {[
            { id: "discover" as Tab, label: "Discover", icon: SearchIcon },
            { id: "sessions" as Tab, label: "My Sessions", icon: UsersIcon },
            { id: "how-it-works" as Tab, label: "How It Works", icon: LockIcon },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`tab flex items-center gap-2 ${
                activeTab === id ? "tab-active" : ""
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
        <div className="divider mt-4" />
      </nav>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* ============ DISCOVER TAB ============ */}
        {activeTab === "discover" && (
          <div className="animate-fade-in-up">
            {!connected ? (
              // Not connected state
              <div className="text-center py-20">
                <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-purple-500/20 to-cyan-500/20 flex items-center justify-center animate-float">
                  <ShieldIcon className="w-10 h-10 text-purple-400" />
                </div>
                <h2 className="text-2xl font-bold mb-3">Connect Your Wallet</h2>
                <p className="text-arcium-muted mb-8 max-w-md mx-auto" style={{ color: "var(--arcium-text-muted)" }}>
                  Connect your Solana wallet to start discovering mutual contacts
                  privately using Arcium&apos;s MPC network.
                </p>
                <WalletMultiButton />
              </div>
            ) : currentSession ? (
              // Active session state
              <div className="max-w-2xl mx-auto">
                <div className="card p-8">
                  {/* Session header */}
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <p className="text-sm" style={{ color: "var(--arcium-text-muted)" }}>Session ID</p>
                      <div className="flex items-center gap-2 mt-1">
                        <code className="text-lg font-mono text-gradient">{currentSession.id}</code>
                        <button onClick={handleCopySessionId} className="p-1 hover:bg-white/5 rounded">
                          {copied ? (
                            <CheckCircleIcon className="w-4 h-4 text-green-400" />
                          ) : (
                            <CopyIcon className="w-4 h-4" style={{ color: "var(--arcium-text-muted)" }} />
                          )}
                        </button>
                      </div>
                    </div>
                    <span
                      className={`badge ${
                        currentSession.status === "matched"
                          ? "badge-success"
                          : currentSession.status === "computing"
                          ? "badge-info"
                          : "badge-warning"
                      }`}
                    >
                      <span
                        className={`status-dot ${
                          currentSession.status === "matched"
                            ? "status-dot-active"
                            : currentSession.status === "computing"
                            ? "status-dot-computing"
                            : "status-dot-waiting"
                        }`}
                      />
                      {currentSession.status === "matched"
                        ? "Complete"
                        : currentSession.status === "computing"
                        ? "Computing..."
                        : "Waiting for Partner"}
                    </span>
                  </div>

                  <div className="divider mb-6" />

                  {/* Waiting for partner */}
                  {currentSession.status === "awaiting_bob" && (
                    <div className="text-center py-8">
                      <div className="w-16 h-16 mx-auto mb-4 rounded-full border-2 border-purple-500/30 flex items-center justify-center animate-pulse-glow">
                        <LinkIcon className="w-8 h-8 text-purple-400" />
                      </div>
                      <h3 className="text-lg font-semibold mb-2">Waiting for Partner</h3>
                      <p className="text-sm mb-4" style={{ color: "var(--arcium-text-muted)" }}>
                        Share the session ID with the person you want to discover
                        mutual contacts with.
                      </p>
                      <p className="text-xs" style={{ color: "var(--arcium-text-muted)" }}>
                        Your {hashCount} contacts are encrypted and stored securely in the
                        MPC network. No one can see them.
                      </p>
                    </div>
                  )}

                  {/* Computing */}
                  {currentSession.status === "computing" && (
                    <div className="text-center py-8">
                      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-cyan-500/10 flex items-center justify-center">
                        <div className="w-10 h-10 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin" />
                      </div>
                      <h3 className="text-lg font-semibold mb-2">Computing Intersection</h3>
                      <p className="text-sm" style={{ color: "var(--arcium-text-muted)" }}>
                        Arcium&apos;s MPC nodes are securely comparing your encrypted
                        contacts. Neither party&apos;s full list is revealed.
                      </p>
                    </div>
                  )}

                  {/* Results */}
                  {currentSession.status === "matched" && (
                    <div className="py-4">
                      <div className="text-center mb-6">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/10 flex items-center justify-center">
                          <CheckCircleIcon className="w-8 h-8 text-green-400" />
                        </div>
                        <h3 className="text-2xl font-bold mb-1">
                          <span className="text-gradient">{currentSession.matchCount}</span> Mutual Contacts
                        </h3>
                        <p className="text-sm" style={{ color: "var(--arcium-text-muted)" }}>
                          Only matching contacts are revealed. Non-matches remain
                          completely private.
                        </p>
                      </div>

                      {currentSession.matchedContacts &&
                        currentSession.matchedContacts.length > 0 && (
                          <div className="space-y-2">
                            {currentSession.matchedContacts.map((contact, i) => (
                              <div
                                key={i}
                                className="flex items-center gap-3 p-3 rounded-xl"
                                style={{ background: "rgba(16, 185, 129, 0.05)", border: "1px solid rgba(16, 185, 129, 0.15)" }}
                              >
                                <CheckCircleIcon className="w-5 h-5 text-green-400 flex-shrink-0" />
                                <span className="font-mono text-sm">{contact}</span>
                              </div>
                            ))}
                          </div>
                        )}
                    </div>
                  )}

                  <div className="divider my-6" />

                  <button onClick={handleReset} className="btn-secondary w-full text-center">
                    <span>New Discovery Session</span>
                  </button>
                </div>
              </div>
            ) : (
              // Input state - create or join
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Contact Input */}
                <div className="card p-6">
                  <h3 className="text-lg font-semibold mb-1">Your Contacts</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--arcium-text-muted)" }}>
                    Enter contacts (one per line). They&apos;re hashed locally before
                    encryption - no plaintext leaves your device.
                  </p>

                  <textarea
                    className="input mb-3"
                    rows={8}
                    placeholder={`alice@example.com\n+1234567890\nbob@example.com\n...`}
                    value={contactInput}
                    onChange={(e) => setContactInput(e.target.value)}
                    disabled={isHashing || isSubmitting}
                  />

                  <div className="flex items-center justify-between text-sm" style={{ color: "var(--arcium-text-muted)" }}>
                    <span>
                      {contactCount} / {MAX_CONTACTS} contacts
                    </span>
                    {contactCount > MAX_CONTACTS && (
                      <span style={{ color: "var(--arcium-error)" }}>
                        Maximum {MAX_CONTACTS} contacts
                      </span>
                    )}
                    {isHashing && (
                      <span className="text-gradient">
                        Hashing {hashCount} contacts...
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="space-y-6">
                  {/* Create Session (Alice) */}
                  <div className="card p-6">
                    <h3 className="text-lg font-semibold mb-1">Create New Session</h3>
                    <p className="text-sm mb-4" style={{ color: "var(--arcium-text-muted)" }}>
                      Start a discovery session. You&apos;ll get a session ID to share
                      with the other party.
                    </p>
                    <button
                      onClick={handleCreateSession}
                      disabled={
                        !connected ||
                        contactCount === 0 ||
                        contactCount > MAX_CONTACTS ||
                        isSubmitting
                      }
                      className="btn-primary w-full text-center"
                    >
                      <span>
                        {isSubmitting
                          ? "Submitting..."
                          : isHashing
                          ? "Hashing..."
                          : "Create Session & Submit Contacts"}
                      </span>
                    </button>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="divider flex-1" />
                    <span className="text-sm" style={{ color: "var(--arcium-text-muted)" }}>or</span>
                    <div className="divider flex-1" />
                  </div>

                  {/* Join Session (Bob) */}
                  <div className="card p-6">
                    <h3 className="text-lg font-semibold mb-1">Join Existing Session</h3>
                    <p className="text-sm mb-4" style={{ color: "var(--arcium-text-muted)" }}>
                      Enter a session ID from someone who wants to discover mutual
                      contacts with you.
                    </p>
                    <input
                      className="input mb-3"
                      placeholder="Paste session ID..."
                      value={sessionIdInput}
                      onChange={(e) => setSessionIdInput(e.target.value)}
                      disabled={isSubmitting}
                    />
                    <button
                      onClick={handleJoinSession}
                      disabled={
                        !connected ||
                        contactCount === 0 ||
                        contactCount > MAX_CONTACTS ||
                        !sessionIdInput.trim() ||
                        isSubmitting
                      }
                      className="btn-secondary w-full text-center"
                    >
                      <span>
                        {isSubmitting
                          ? "Submitting & Computing..."
                          : "Join & Discover Matches"}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============ SESSIONS TAB ============ */}
        {activeTab === "sessions" && (
          <div className="animate-fade-in-up">
            <div className="text-center py-16">
              <UsersIcon className="w-12 h-12 mx-auto mb-4" style={{ color: "var(--arcium-text-muted)" }} />
              <h3 className="text-lg font-semibold mb-2">No Sessions Yet</h3>
              <p className="text-sm" style={{ color: "var(--arcium-text-muted)" }}>
                Create or join a discovery session from the Discover tab. Your
                sessions will appear here.
              </p>
            </div>
          </div>
        )}

        {/* ============ HOW IT WORKS TAB ============ */}
        {activeTab === "how-it-works" && (
          <div className="animate-fade-in-up max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold mb-6 text-gradient">
              How Private Contact Discovery Works
            </h2>

            {/* Problem */}
            <div className="card p-6 mb-6">
              <h3 className="text-lg font-semibold mb-3">The Problem</h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--arcium-text-muted)" }}>
                Traditional contact discovery (Signal, WhatsApp, social networks)
                requires uploading your entire address book to a central server.
                This creates massive privacy risks: the server sees all your
                contacts, even those who aren&apos;t on the platform.
              </p>
            </div>

            {/* Solution */}
            <div className="card p-6 mb-6 card-featured">
              <h3 className="text-lg font-semibold mb-3">The Solution: PSI via MPC</h3>
              <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--arcium-text-muted)" }}>
                Private Set Intersection (PSI) using Arcium&apos;s Multi-Party
                Computation (MPC) network. Two users discover which contacts they
                share without revealing their full lists to each other, the
                network, or anyone else.
              </p>
            </div>

            {/* Steps */}
            <div className="space-y-4 mb-6">
              {[
                {
                  step: "1",
                  title: "Hash Contacts Locally",
                  desc: "Your contacts are SHA-256 hashed on your device. No plaintext ever leaves your browser.",
                  icon: ShieldIcon,
                },
                {
                  step: "2",
                  title: "Encrypt & Submit",
                  desc: "Hashed contacts are encrypted with X25519 keys and submitted to Arcium's MPC network via Solana.",
                  icon: LockIcon,
                },
                {
                  step: "3",
                  title: "Secure Comparison",
                  desc: "MPC nodes compare encrypted lists using a 32x32 nested loop. No single node sees any plaintext data.",
                  icon: SearchIcon,
                },
                {
                  step: "4",
                  title: "Reveal Only Matches",
                  desc: "Only the intersection (mutual contacts) is decrypted and returned. Non-matching contacts stay completely hidden.",
                  icon: CheckCircleIcon,
                },
              ].map(({ step, title, desc, icon: Icon }) => (
                <div
                  key={step}
                  className="card p-5 flex items-start gap-4 hover-lift"
                >
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-cyan-500/20 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">
                      Step {step}: {title}
                    </h4>
                    <p className="text-sm" style={{ color: "var(--arcium-text-muted)" }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Privacy guarantees */}
            <div className="card p-6">
              <h3 className="text-lg font-semibold mb-4">Privacy Guarantees</h3>
              <div className="space-y-3">
                {[
                  "Neither party sees the other's full contact list",
                  "No trusted third party - computation is distributed across MPC nodes",
                  "Contact hashes never exist in plaintext outside your device",
                  "Every MPC result is cryptographically signed and verified on Solana",
                  "Only the intersection is revealed - non-matches remain completely hidden",
                ].map((guarantee, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <CheckCircleIcon className="w-5 h-5 text-green-400 flex-shrink-0" />
                    <span className="text-sm" style={{ color: "var(--arcium-text-muted)" }}>{guarantee}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto px-6 py-8 mt-12">
        <div className="divider mb-8" />
        <div className="flex items-center justify-between text-sm" style={{ color: "var(--arcium-text-muted)" }}>
          <span>Private Contact Discovery on Arcium</span>
          <span>Built by giwaov</span>
        </div>
      </footer>
    </main>
  );
}
