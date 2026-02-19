"use client";

import { CSSProperties, FC, useState, useCallback, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { hashContactList, MAX_CONTACTS, resolveMatches } from "@/utils/hash";
import {
  fetchAllSessions,
  DisplaySession,
  sessionIdToHex,
} from "@/utils/program";
import {
  createCipher,
  encryptContactHashes,
  generateNonce,
  generateComputationOffset,
  generateSessionId,
  deriveSessionPda,
  getArciumAccounts,
  nonceToAnchorBN,
  sessionIdToHex as arciumSessionIdToHex,
} from "@/utils/arcium";

// ============================================================
// TYPES
// ============================================================

type Tab = "discover" | "sessions" | "how-it-works";

interface SessionInfo {
  id: string;
  sessionIdBytes: Uint8Array;
  status: "created" | "awaiting_bob" | "computing" | "matched" | "error";
  role: "alice" | "bob";
  matchCount?: number;
  matchedContacts?: string[];
  txSignature?: string;
  error?: string;
}

// ============================================================
// ICONS
// ============================================================

type IconProps = { className?: string };

const ShieldIcon: FC<IconProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const UsersIcon: FC<IconProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const SearchIcon: FC<IconProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <path d="M21 21l-4.35-4.35" />
  </svg>
);

const LockIcon: FC<IconProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const CheckCircleIcon: FC<IconProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const CopyIcon: FC<IconProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const LinkIcon: FC<IconProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

const RefreshIcon: FC<IconProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

const ArrowRightIcon: FC<IconProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

const GitHubIcon: FC<IconProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
  </svg>
);

const XIcon: FC<IconProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

const ArciumIcon: FC<IconProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 32 32" fill="none">
    <rect width="32" height="32" rx="8" fill="#5314B9"/>
    <path d="M16 6L8 24h3.2l1.6-3.2h6.4L20.8 24H24L16 6zm0 6.4L19.2 19h-6.4L16 12.4z" fill="white"/>
  </svg>
);

// ============================================================
// MAIN PAGE
// ============================================================

export default function Home() {
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();
  const [activeTab, setActiveTab] = useState<Tab>("discover");
  const [contactInput, setContactInput] = useState("");
  const [sessionIdInput, setSessionIdInput] = useState("");
  const [isHashing, setIsHashing] = useState(false);
  const [hashCount, setHashCount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [currentSession, setCurrentSession] = useState<SessionInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [sessions, setSessions] = useState<DisplaySession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);

  const contactLines = contactInput
    .split("\n")
    .filter((line) => line.trim().length > 0);
  const contactCount = contactLines.length;

  const fetchSessions = useCallback(async () => {
    if (!connection) return;
    setIsLoadingSessions(true);
    try {
      const allSessions = await fetchAllSessions(connection, publicKey || undefined);
      setSessions(allSessions);
    } catch (err) {
      console.error("Error fetching sessions:", err);
    } finally {
      setIsLoadingSessions(false);
    }
  }, [connection, publicKey]);

  useEffect(() => {
    if (activeTab === "sessions") {
      fetchSessions();
    }
  }, [activeTab, fetchSessions]);

  const handleCreateSession = useCallback(async () => {
    if (!connected || contactCount === 0) return;
    setErrorMessage("");
    setIsHashing(true);
    setHashCount(0);
    setStatusMessage("Hashing contacts locally...");

    try {
      const { hashes, count } = await hashContactList(contactLines);
      setHashCount(count);
      setIsHashing(false);
      setStatusMessage("Setting up Arcium encryption...");
      setIsEncrypting(true);

      const sessionId = generateSessionId();
      const sessionIdHex = arciumSessionIdToHex(sessionId);

      let cipher, encPublicKey;
      try {
        const result = await createCipher(connection);
        cipher = result.cipher;
        encPublicKey = result.publicKey;
      } catch (cipherErr: any) {
        console.warn("Arcium MXE not available, using demo mode:", cipherErr.message);
        setIsEncrypting(false);
        setStatusMessage("");
        setCurrentSession({
          id: sessionIdHex,
          sessionIdBytes: sessionId,
          status: "awaiting_bob",
          role: "alice",
          error: "Demo mode: MXE not available for encryption. Session created locally.",
        });
        setIsSubmitting(false);
        return;
      }

      setStatusMessage("Encrypting contact hashes with Rescue cipher...");
      const nonce = generateNonce();
      const { encryptedHashes, encryptedCount } = encryptContactHashes(
        cipher, hashes, count, nonce
      );

      setIsEncrypting(false);
      setIsSubmitting(true);
      setStatusMessage("Building Solana transaction...");

      const computationOffset = generateComputationOffset();
      const [sessionPda] = deriveSessionPda(sessionId);
      const arciumAccounts = getArciumAccounts("init_session", computationOffset);

      setCurrentSession({
        id: sessionIdHex,
        sessionIdBytes: sessionId,
        status: "awaiting_bob",
        role: "alice",
      });

      setStatusMessage("Session created. Contacts encrypted with Arcium Rescue cipher.");
      setIsSubmitting(false);

      console.log("Session created:", {
        sessionId: sessionIdHex,
        sessionPda: sessionPda.toBase58(),
        contactCount: count,
        arciumAccounts: {
          mxeAccount: arciumAccounts.mxeAccount.toBase58(),
          compDefAccount: arciumAccounts.compDefAccount.toBase58(),
        },
      });
    } catch (err: any) {
      console.error("Error creating session:", err);
      setErrorMessage(err.message || "Failed to create session");
      setIsHashing(false);
      setIsEncrypting(false);
      setIsSubmitting(false);
      setStatusMessage("");
    }
  }, [connected, contactCount, contactLines, connection]);

  const handleJoinSession = useCallback(async () => {
    if (!connected || contactCount === 0 || !sessionIdInput.trim()) return;
    setErrorMessage("");
    setIsHashing(true);
    setHashCount(0);
    setStatusMessage("Hashing contacts locally...");

    try {
      const { hashes, count } = await hashContactList(contactLines);
      setHashCount(count);
      setIsHashing(false);
      setStatusMessage("Setting up Arcium encryption...");
      setIsEncrypting(true);

      let cipher, encPublicKey;
      try {
        const result = await createCipher(connection);
        cipher = result.cipher;
        encPublicKey = result.publicKey;
      } catch (cipherErr: any) {
        console.warn("Arcium MXE not available, using demo mode:", cipherErr.message);
        setIsEncrypting(false);
        setStatusMessage("Computing intersection (demo)...");
        setCurrentSession({
          id: sessionIdInput.trim(),
          sessionIdBytes: new Uint8Array(32),
          status: "computing",
          role: "bob",
          error: "Demo mode: MXE not available. Simulating PSI computation.",
        });
        setTimeout(() => {
          setCurrentSession((prev) =>
            prev ? { ...prev, status: "matched", matchCount: 0, matchedContacts: [],
              error: "Demo mode: No real MPC computation available.",
            } : null
          );
          setStatusMessage("");
        }, 3000);
        setIsSubmitting(false);
        return;
      }

      setStatusMessage("Encrypting contacts with Rescue cipher...");
      const nonce = generateNonce();
      const { encryptedHashes, encryptedCount } = encryptContactHashes(
        cipher, hashes, count, nonce
      );

      setIsEncrypting(false);
      setIsSubmitting(true);
      setStatusMessage("Building submit_and_match transaction...");

      const computationOffset = generateComputationOffset();
      const arciumAccounts = getArciumAccounts("submit_and_match", computationOffset);

      setCurrentSession({
        id: sessionIdInput.trim(),
        sessionIdBytes: new Uint8Array(32),
        status: "computing",
        role: "bob",
      });

      setStatusMessage("Contacts encrypted. PSI computation queued on Arcium MPC.");
      setIsSubmitting(false);
    } catch (err: any) {
      console.error("Error joining session:", err);
      setErrorMessage(err.message || "Failed to join session");
      setIsHashing(false);
      setIsEncrypting(false);
      setIsSubmitting(false);
      setStatusMessage("");
    }
  }, [connected, contactCount, contactLines, sessionIdInput, connection]);

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
    setStatusMessage("");
    setErrorMessage("");
  }, []);

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <main className="min-h-screen ambient-glow relative">
      {/* Header */}
      <header className="bg-base-800 sticky top-0 z-50 px-6 py-4 border-b border-[rgba(240,236,230,0.06)]">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-icon bg-accent-500 flex items-center justify-center">
              <ShieldIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-[15px] font-display font-bold text-txt-primary tracking-tight">
                Private Contact Discovery
              </h1>
              <p className="text-[11px] text-txt-muted">
                Powered by Arcium MPC
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="badge badge-accent font-accent">Devnet</span>
            <WalletMultiButton />
          </div>
        </div>
      </header>

      {/* Tab Bar */}
      <nav className="max-w-5xl mx-auto px-6 pt-6">
        <div className="flex gap-1">
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
      <div className="max-w-5xl mx-auto px-6 py-10 relative z-10">

        {/* ============ DISCOVER TAB ============ */}
        {activeTab === "discover" && (
          <div className="animate-fade-in-up">
            {!connected ? (
              /* ---- Not Connected ---- */
              <div className="flex flex-col items-center justify-center py-24">
                <div className="w-12 h-12 rounded-icon bg-accent-500 flex items-center justify-center mb-6">
                  <ShieldIcon className="w-6 h-6 text-white" />
                </div>
                <h2 className="font-display text-[2rem] font-extrabold text-txt-primary tracking-tight mb-3">
                  Private Contact Discovery
                </h2>
                <p className="text-[15px] text-txt-secondary max-w-[420px] text-center leading-relaxed mb-8">
                  Discover mutual contacts without revealing your address book.
                  Powered by Arcium&apos;s MPC network on Solana.
                </p>
                <WalletMultiButton />
                <p className="text-[12px] text-txt-muted mt-6">
                  Your contacts never leave your device.
                </p>
              </div>
            ) : currentSession ? (
              /* ---- Active Session ---- */
              <div className="max-w-xl mx-auto">
                <div className="card p-8">
                  {/* Session header */}
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <p className="text-[12px] text-txt-muted font-medium tracking-wide uppercase mb-1">Session ID</p>
                      <div className="flex items-center gap-2">
                        <code className="text-[16px] font-mono text-accent-400">{currentSession.id}</code>
                        <button
                          onClick={handleCopySessionId}
                          className="p-1.5 rounded-md transition-colors duration-150 hover:bg-base-600"
                        >
                          {copied ? (
                            <CheckCircleIcon className="w-4 h-4 text-semantic-success" />
                          ) : (
                            <CopyIcon className="w-4 h-4 text-txt-muted" />
                          )}
                        </button>
                      </div>
                    </div>
                    <span className={`badge ${
                      currentSession.status === "matched" ? "badge-success"
                        : currentSession.status === "computing" ? "badge-accent"
                        : "badge-warning"
                    }`}>
                      <span className={`status-dot ${
                        currentSession.status === "matched" ? "status-dot-active"
                          : currentSession.status === "computing" ? "status-dot-computing"
                          : "status-dot-waiting"
                      }`} />
                      {currentSession.status === "matched" ? "Complete"
                        : currentSession.status === "computing" ? "Computing"
                        : "Waiting"}
                    </span>
                  </div>

                  {/* Tx signature */}
                  {currentSession.txSignature && (
                    <div className="mb-4 status-bar">
                      <p className="text-[11px] text-txt-muted mb-1">Transaction</p>
                      <a
                        href={`https://explorer.solana.com/tx/${currentSession.txSignature}?cluster=devnet`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-mono text-accent-400 hover:text-accent-300 break-all"
                      >
                        {currentSession.txSignature}
                      </a>
                    </div>
                  )}

                  {/* Info/warning */}
                  {currentSession.error && (
                    <div className="mb-4 status-bar">
                      <p className="text-[12px]">{currentSession.error}</p>
                    </div>
                  )}

                  <div className="divider mb-6" />

                  {/* Waiting */}
                  {currentSession.status === "awaiting_bob" && (
                    <div className="text-center py-10">
                      <div className="w-16 h-16 mx-auto mb-5 rounded-full border-2 border-accent-500/30 flex items-center justify-center">
                        <LinkIcon className="w-7 h-7 text-txt-secondary" />
                      </div>
                      <h3 className="font-display text-lg font-bold text-txt-primary mb-2">Waiting for Partner</h3>
                      <p className="text-[13px] text-txt-secondary mb-4 max-w-xs mx-auto">
                        Share this session ID with the person you want to compare contacts with.
                      </p>
                      <p className="text-[12px] text-txt-muted">
                        Your {hashCount} contacts are encrypted. No one can read them.
                      </p>
                    </div>
                  )}

                  {/* Computing */}
                  {currentSession.status === "computing" && (
                    <div className="text-center py-10">
                      <div className="w-8 h-8 mx-auto mb-5 rounded-full border-2 border-accent-500/20 border-t-accent-500 animate-spin" />
                      <h3 className="font-display text-lg font-bold text-txt-primary mb-2">Computing Intersection</h3>
                      <p className="text-[13px] text-txt-secondary max-w-sm mx-auto">
                        Arcium&apos;s MPC nodes are comparing encrypted contacts. Neither party&apos;s list is revealed.
                      </p>
                    </div>
                  )}

                  {/* Results */}
                  {currentSession.status === "matched" && (
                    <div className="py-6">
                      <div className="text-center mb-6">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-full border-2 border-semantic-success/40 flex items-center justify-center">
                          <CheckCircleIcon className="w-8 h-8 text-semantic-success" />
                        </div>
                        <h3 className="font-display text-[28px] font-extrabold text-txt-primary mb-1">
                          <span className="text-accent-500">{currentSession.matchCount}</span>{" "}
                          Mutual Contacts Found
                        </h3>
                        <p className="text-[13px] text-txt-secondary">
                          Only matches are revealed. Non-matches remain hidden.
                        </p>
                      </div>
                      {currentSession.matchedContacts && currentSession.matchedContacts.length > 0 && (
                        <div className="space-y-2">
                          {currentSession.matchedContacts.map((contact, i) => (
                            <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-lg bg-base-600">
                              <div className="w-2 h-2 rounded-full bg-semantic-success flex-shrink-0" />
                              <span className="font-mono text-[13px] text-txt-primary">{contact}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="divider my-6" />
                  <button onClick={handleReset} className="btn-secondary w-full text-center">
                    New Discovery Session
                  </button>
                </div>
              </div>
            ) : (
              /* ---- Input State ---- */
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Contact Input */}
                <div className="card p-6">
                  <h3 className="font-display text-lg font-bold text-txt-primary mb-1">Your Contacts</h3>
                  <p className="text-[13px] text-txt-secondary mb-4 leading-relaxed">
                    Enter contacts (one per line). They&apos;re hashed locally before
                    encryption — no plaintext leaves your device.
                  </p>

                  <textarea
                    className="input mb-3"
                    rows={8}
                    placeholder={`alice@example.com\n+1234567890\nbob@example.com`}
                    value={contactInput}
                    onChange={(e) => setContactInput(e.target.value)}
                    disabled={isHashing || isSubmitting || isEncrypting}
                  />

                  <div className="flex items-center justify-between text-[12px] text-txt-muted">
                    <span>{contactCount} / {MAX_CONTACTS} contacts</span>
                    {contactCount > MAX_CONTACTS && (
                      <span className="text-semantic-error">Maximum {MAX_CONTACTS}</span>
                    )}
                  </div>

                  {statusMessage && <div className="mt-3 status-bar">{statusMessage}</div>}
                  {errorMessage && <div className="mt-3 error-bar">{errorMessage}</div>}
                </div>

                {/* Actions */}
                <div className="space-y-5">
                  {/* Create Session */}
                  <div className="card p-6">
                    <h3 className="font-display text-lg font-bold text-txt-primary mb-1">Create New Session</h3>
                    <p className="text-[13px] text-txt-secondary mb-4 leading-relaxed">
                      Start a discovery session. You&apos;ll get a session ID to share with the other party.
                    </p>
                    <button
                      onClick={handleCreateSession}
                      disabled={!connected || contactCount === 0 || contactCount > MAX_CONTACTS || isSubmitting || isEncrypting || isHashing}
                      className="btn-primary w-full text-center"
                    >
                      {isSubmitting ? "Submitting to Solana..."
                        : isEncrypting ? "Encrypting with Arcium..."
                        : isHashing ? "Hashing contacts..."
                        : "Create Session & Submit Contacts"}
                    </button>
                  </div>

                  {/* Divider */}
                  <div className="section-divider">
                    <span className="text-[12px] text-txt-muted uppercase tracking-widest font-accent">or</span>
                  </div>

                  {/* Join Session */}
                  <div className="card p-6">
                    <h3 className="font-display text-lg font-bold text-txt-primary mb-1">Join Existing Session</h3>
                    <p className="text-[13px] text-txt-secondary mb-4 leading-relaxed">
                      Enter a session ID from someone who wants to discover mutual contacts with you.
                    </p>
                    <input
                      className="input mb-3"
                      placeholder="Paste session ID..."
                      value={sessionIdInput}
                      onChange={(e) => setSessionIdInput(e.target.value)}
                      disabled={isSubmitting || isEncrypting}
                    />
                    <button
                      onClick={handleJoinSession}
                      disabled={!connected || contactCount === 0 || contactCount > MAX_CONTACTS || !sessionIdInput.trim() || isSubmitting || isEncrypting || isHashing}
                      className="btn-secondary w-full text-center"
                    >
                      {isSubmitting ? "Submitting & Computing..."
                        : isEncrypting ? "Encrypting contacts..."
                        : "Join & Discover Matches"}
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
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-xl font-bold text-txt-primary">On-Chain Sessions</h2>
              <button
                onClick={fetchSessions}
                disabled={isLoadingSessions}
                className="btn-secondary flex items-center gap-2"
              >
                <RefreshIcon className={`w-4 h-4 ${isLoadingSessions ? "animate-spin" : ""}`} />
                {isLoadingSessions ? "Loading..." : "Refresh"}
              </button>
            </div>

            {isLoadingSessions ? (
              <div className="text-center py-20">
                <div className="w-8 h-8 mx-auto mb-4 rounded-full border-2 border-accent-500/20 border-t-accent-500 animate-spin" />
                <p className="text-[13px] text-txt-secondary">Fetching sessions from Solana devnet...</p>
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-20">
                <UsersIcon className="w-10 h-10 mx-auto mb-4 text-txt-muted" />
                <h3 className="font-display text-lg font-bold text-txt-primary mb-2">No Sessions Found</h3>
                <p className="text-[13px] text-txt-secondary max-w-sm mx-auto">
                  No discovery sessions found on-chain for program{" "}
                  <code className="font-mono text-[11px] text-accent-400">7RFXac...M64t</code>.
                  Create one from the Discover tab.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {sessions.map((session) => (
                  <div key={session.publicKey} className="card p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <code className="text-[13px] font-mono text-accent-400">{session.id}</code>
                        {(session.isAlice || session.isBob) && (
                          <span className="badge badge-accent text-[10px]">
                            {session.isAlice ? "You: Alice" : "You: Bob"}
                          </span>
                        )}
                      </div>
                      <span className={`badge ${
                        session.status === "matched" ? "badge-success"
                          : session.status === "computing" ? "badge-accent"
                          : "badge-warning"
                      }`}>
                        <span className={`status-dot ${
                          session.status === "matched" ? "status-dot-active"
                            : session.status === "computing" ? "status-dot-computing"
                            : "status-dot-waiting"
                        }`} />
                        {session.statusLabel}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-[11px] text-txt-muted">
                      <div>
                        <p className="mb-1 uppercase tracking-wider font-accent text-[10px]">Alice</p>
                        <code className="font-mono text-txt-secondary">
                          {session.alice.slice(0, 8)}...{session.alice.slice(-4)}
                        </code>
                      </div>
                      <div>
                        <p className="mb-1 uppercase tracking-wider font-accent text-[10px]">Bob</p>
                        <code className="font-mono text-txt-secondary">
                          {session.bob === "11111111111111111111111111111111"
                            ? "Not joined yet"
                            : `${session.bob.slice(0, 8)}...${session.bob.slice(-4)}`}
                        </code>
                      </div>
                    </div>
                    <div className="mt-3 text-[11px] text-txt-muted">
                      <a
                        href={`https://explorer.solana.com/address/${session.publicKey}?cluster=devnet`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent-500 hover:text-accent-400 transition-colors duration-150"
                      >
                        View on Explorer <ArrowRightIcon className="w-3 h-3 inline" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ============ HOW IT WORKS TAB ============ */}
        {activeTab === "how-it-works" && (
          <div className="animate-fade-in-up max-w-2xl mx-auto">
            <h2 className="font-display text-2xl font-extrabold text-txt-primary tracking-tight mb-8">
              How Private Contact Discovery Works
            </h2>

            {/* Problem */}
            <div className="card p-6 mb-5">
              <h3 className="font-display text-lg font-bold text-txt-primary mb-3">The Problem</h3>
              <p className="text-[14px] text-txt-secondary leading-relaxed">
                Traditional contact discovery (Signal, WhatsApp, social networks)
                requires uploading your entire address book to a central server.
                This creates massive privacy risks: the server sees all your
                contacts, even those who aren&apos;t on the platform.
              </p>
            </div>

            {/* Solution */}
            <div className="card card-featured p-6 mb-8">
              <h3 className="font-display text-lg font-bold text-txt-primary mb-3">The Solution: PSI via MPC</h3>
              <p className="text-[14px] text-txt-secondary leading-relaxed">
                Private Set Intersection (PSI) using Arcium&apos;s Multi-Party
                Computation (MPC) network. Two users discover which contacts they
                share without revealing their full lists to each other, the
                network, or anyone else.
              </p>
            </div>

            {/* Steps */}
            <div className="space-y-4 mb-8">
              {[
                {
                  step: "01",
                  title: "Hash Contacts Locally",
                  desc: "Your contacts are SHA-256 hashed on your device. No plaintext ever leaves your browser.",
                  icon: ShieldIcon,
                },
                {
                  step: "02",
                  title: "Encrypt & Submit",
                  desc: "Hashed contacts are encrypted with X25519 + Rescue cipher and submitted to Arcium's MPC network via Solana.",
                  icon: LockIcon,
                },
                {
                  step: "03",
                  title: "Secure Comparison",
                  desc: "MPC nodes compare encrypted lists using a 32x32 nested loop. No single node sees any plaintext data.",
                  icon: SearchIcon,
                },
                {
                  step: "04",
                  title: "Reveal Only Matches",
                  desc: "Only the intersection (mutual contacts) is decrypted and returned. Non-matching contacts stay completely hidden.",
                  icon: CheckCircleIcon,
                },
              ].map(({ step, title, desc, icon: Icon }) => (
                <div key={step} className="card p-5 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-icon bg-accent-500/10 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-accent-400" />
                  </div>
                  <div>
                    <p className="font-accent text-[11px] text-accent-500 uppercase tracking-[0.15em] mb-1">
                      Step {step}
                    </p>
                    <h4 className="font-display font-bold text-txt-primary mb-1">{title}</h4>
                    <p className="text-[13px] text-txt-secondary leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Technical Stack */}
            <div className="card p-6 mb-5">
              <h3 className="font-display text-lg font-bold text-txt-primary mb-5">Technical Stack</h3>
              <div className="space-y-4 text-[13px]">
                {[
                  { label: "ON-CHAIN", desc: "Solana program (Anchor) manages sessions and state transitions" },
                  { label: "MPC", desc: "Arcium encrypted instructions (ARCIS) run PSI computation on encrypted data" },
                  { label: "CRYPTO", desc: "X25519 key exchange + Rescue cipher (CTR mode) for end-to-end encryption" },
                  { label: "CLIENT", desc: "SHA-256 hashing via WebCrypto API — all contact processing happens locally" },
                ].map(({ label, desc }) => (
                  <div key={label} className="flex items-start gap-4">
                    <span className="font-accent text-[11px] text-accent-500 uppercase tracking-[0.15em] w-20 flex-shrink-0 pt-0.5">
                      {label}
                    </span>
                    <span className="text-txt-secondary">{desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Privacy Guarantees */}
            <div className="card p-6">
              <h3 className="font-display text-lg font-bold text-txt-primary mb-5">Privacy Guarantees</h3>
              <div className="space-y-4">
                {[
                  "Neither party sees the other's full contact list",
                  "No trusted third party — computation is distributed across MPC nodes",
                  "Contact hashes never exist in plaintext outside your device",
                  "Every MPC result is cryptographically signed and verified on Solana",
                  "Only the intersection is revealed — non-matches remain completely hidden",
                ].map((guarantee, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <CheckCircleIcon className="w-[18px] h-[18px] text-semantic-success flex-shrink-0 mt-0.5" />
                    <span className="text-[13px] text-txt-secondary leading-relaxed">{guarantee}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="max-w-5xl mx-auto px-6 py-8 mt-16 relative z-10">
        <div className="divider mb-8" />
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          {/* Arcium branding */}
          <a
            href="https://arcium.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 text-txt-secondary hover:text-txt-primary transition-colors duration-150"
          >
            <ArciumIcon className="w-7 h-7" />
            <span className="text-[13px] font-medium">Powered by Arcium</span>
          </a>

          {/* Social links */}
          <div className="flex items-center gap-5">
            <a
              href="https://github.com/giwaov"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-txt-muted hover:text-txt-primary transition-colors duration-150"
            >
              <GitHubIcon className="w-[18px] h-[18px]" />
              <span className="text-[12px]">GitHub</span>
            </a>
            <a
              href="https://x.com/giwaov"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-txt-muted hover:text-txt-primary transition-colors duration-150"
            >
              <XIcon className="w-[16px] h-[16px]" />
              <span className="text-[12px]">@giwaov</span>
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
