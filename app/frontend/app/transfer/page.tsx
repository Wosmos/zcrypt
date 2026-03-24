"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { UploadZone } from "@/components/upload/upload-zone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import { QRShare } from "@/components/ui/qr-code";
import {
  Shield, Send, Download, File, AlertTriangle, CheckCircle2,
  MonitorSmartphone, Lock, Copy, Check,
} from "@/lib/icons";
import { formatBytes } from "@/lib/utils";

const WS_URL = (process.env.NEXT_PUBLIC_API_URL || "")
  .replace(/^http/, "ws") + "/api/transfer/ws";

type Mode = "choose" | "send" | "receive";
type SendState = "selecting" | "waiting" | "paired" | "transferring" | "done" | "error";
type RecvState = "entering" | "connecting" | "paired" | "receiving" | "done" | "error";

interface FileInfo {
  name: string;
  size: number;
  type: string;
}

export default function TransferPage() {
  const [mode, setMode] = useState<Mode>("choose");

  return (
    <div className="min-h-dvh flex items-center justify-center bg-[var(--color-bg)] p-4">
      <div className="w-full max-w-lg animate-fade-in">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-[var(--color-accent)]/10">
            <MonitorSmartphone className="h-5 w-5 text-[var(--color-accent)]" />
          </div>
          <span className="text-xl font-bold font-heading tracking-tight">zcrypt Transfer</span>
        </div>
        <p className="text-center text-sm text-[var(--color-text-muted)] mb-6">
          Stream encrypted files between devices. No storage, no accounts.
        </p>

        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl overflow-hidden">
          {mode === "choose" && (
            <div className="p-6 space-y-3">
              <Button onClick={() => setMode("send")} className="w-full">
                <Send className="h-4 w-4 mr-2" />
                Send a File
              </Button>
              <Button variant="secondary" onClick={() => setMode("receive")} className="w-full">
                <Download className="h-4 w-4 mr-2" />
                Receive a File
              </Button>
              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
                <p className="text-xs text-cyan-700 dark:text-cyan-300">
                  Files stream directly between devices with end-to-end encryption. The server relays encrypted data but cannot read it.
                </p>
              </div>
            </div>
          )}

          {mode === "send" && <SendMode onBack={() => setMode("choose")} />}
          {mode === "receive" && <ReceiveMode onBack={() => setMode("choose")} />}
        </div>

        <p className="text-center text-[10px] text-[var(--color-text-muted)] mt-6">
          Powered by <span className="font-semibold">zcrypt</span> &middot; Zero-knowledge encrypted transfer
        </p>
      </div>
    </div>
  );
}

function SendMode({ onBack }: { onBack: () => void }) {
  const [state, setState] = useState<SendState>("selecting");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [code, setCode] = useState("");
  const [progress, setProgress] = useState({ percent: 0, stage: "" });
  const [errorMsg, setErrorMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const keyRef = useRef<Uint8Array | null>(null);
  const stateRef = useRef<SendState>("selecting");
  stateRef.current = state;

  const handleFiles = useCallback((files: File[]) => {
    if (files[0]) setSelectedFile(files[0]);
  }, []);

  const handleStart = useCallback(async () => {
    if (!selectedFile) return;
    setState("waiting");

    // Generate encryption key
    const key = crypto.getRandomValues(new Uint8Array(32));
    keyRef.current = key;

    // Connect WebSocket
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "create" }));
    };

    ws.onmessage = async (e) => {
      const msg = JSON.parse(e.data);
      switch (msg.type) {
        case "code":
          setCode(msg.data);
          break;
        case "paired":
          setState("paired");
          // Start transfer after a brief delay
          setTimeout(() => startTransfer(ws, selectedFile, key), 200);
          break;
        case "error":
          setState("error");
          setErrorMsg(msg.data || "Transfer error");
          break;
      }
    };

    ws.onerror = () => {
      setState("error");
      setErrorMsg("Connection failed");
    };

    ws.onclose = () => {
      if (stateRef.current !== "done" && stateRef.current !== "error") {
        setState("error");
        setErrorMsg("Connection lost");
      }
    };
  }, [selectedFile]);

  const startTransfer = useCallback(async (ws: WebSocket, file: File, key: Uint8Array) => {
    setState("transferring");

    try {
      const { encryptChunk, toBase64 } = await import("@/lib/crypto");
      const CHUNK = 64 * 1024; // 64 KB chunks for streaming

      // Send file info
      ws.send(JSON.stringify({
        type: "file_info",
        data: { name: file.name, size: file.size, type: file.type, key: toBase64(key) },
      }));

      const totalChunks = Math.ceil(file.size / CHUNK);
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK;
        const end = Math.min(start + CHUNK, file.size);
        const slice = file.slice(start, end);
        const plaintext = new Uint8Array(await slice.arrayBuffer());
        const encrypted = await encryptChunk(key.buffer as ArrayBuffer, plaintext);

        ws.send(JSON.stringify({
          type: "chunk",
          data: { index: i, total: totalChunks, payload: toBase64(encrypted) },
        }));

        setProgress({
          stage: `Sending ${i + 1}/${totalChunks}`,
          percent: Math.round(((i + 1) / totalChunks) * 100),
        });

        // Yield to prevent UI blocking
        if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));
      }

      ws.send(JSON.stringify({ type: "done" }));
      setState("done");
    } catch (err) {
      setState("error");
      setErrorMsg(err instanceof Error ? err.message : "Transfer failed");
    }
  }, []);

  const handleCopyCode = useCallback(async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }, [code]);

  useEffect(() => {
    return () => { wsRef.current?.close(); };
  }, []);

  return (
    <div className="p-6 space-y-4">
      {state === "selecting" && (
        <>
          {!selectedFile ? (
            <UploadZone onFiles={handleFiles} hint="Select a file to send to another device" compact />
          ) : (
            <>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--color-surface-1)]">
                <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-[var(--color-accent)]/10 flex-shrink-0">
                  <File className="h-5 w-5 text-[var(--color-accent)]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">{formatBytes(selectedFile.size)}</p>
                </div>
                <button onClick={() => setSelectedFile(null)} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">
                  Change
                </button>
              </div>
              <Button onClick={handleStart} className="w-full">
                <Lock className="h-4 w-4 mr-2" />
                Start Transfer
              </Button>
            </>
          )}
          <button onClick={onBack} className="w-full text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors py-1">
            Back
          </button>
        </>
      )}

      {state === "waiting" && (
        <div className="space-y-4 text-center">
          <div className="flex flex-col items-center gap-3">
            <LogoSpinner size={32} />
            <p className="text-sm font-medium">Waiting for receiver</p>
            <p className="text-xs text-[var(--color-text-muted)]">Share this code with the receiving device</p>
          </div>
          {code && (
            <>
              <div className="flex items-center justify-center gap-2">
                <div className="text-4xl font-bold font-mono tracking-[0.3em] text-[var(--color-text)]">
                  {code}
                </div>
                <button onClick={handleCopyCode} className="p-2 rounded-lg hover:bg-[var(--color-surface-1)] transition-colors">
                  {copied ? <Check className="h-4 w-4 text-cyan-500" /> : <Copy className="h-4 w-4 text-[var(--color-text-muted)]" />}
                </button>
              </div>
              <QRShare url={`${typeof window !== "undefined" ? window.location.origin : ""}/transfer?code=${code}`} />
            </>
          )}
        </div>
      )}

      {(state === "paired" || state === "transferring") && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <LogoSpinner size={24} speed="fast" />
            <div>
              <p className="text-sm font-semibold">{selectedFile?.name}</p>
              <p className="text-xs text-[var(--color-text-muted)]">{formatBytes(selectedFile?.size || 0)}</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--color-text-muted)]">{progress.stage || "Preparing..."}</span>
              <span className="font-medium tabular-nums">{progress.percent}%</span>
            </div>
            <div className="h-2 rounded-full bg-[var(--color-surface-1)] overflow-hidden">
              <div className="h-full rounded-full bg-[var(--color-accent)] transition-all duration-300" style={{ width: `${progress.percent}%` }} />
            </div>
          </div>
        </div>
      )}

      {state === "done" && (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-cyan-500/10">
            <CheckCircle2 className="h-6 w-6 text-cyan-500" />
          </div>
          <h3 className="text-sm font-semibold">Transfer Complete</h3>
          <p className="text-xs text-[var(--color-text-muted)]">{selectedFile?.name} sent successfully</p>
          <Button variant="secondary" onClick={onBack} className="mt-2">
            Send Another
          </Button>
        </div>
      )}

      {state === "error" && (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-red-500/10">
            <AlertTriangle className="h-6 w-6 text-red-500" />
          </div>
          <h3 className="text-sm font-semibold">Transfer Failed</h3>
          <p className="text-xs text-[var(--color-text-muted)]">{errorMsg}</p>
          <Button variant="secondary" onClick={onBack} className="mt-2">
            Try Again
          </Button>
        </div>
      )}
    </div>
  );
}

function ReceiveMode({ onBack }: { onBack: () => void }) {
  const [state, setState] = useState<RecvState>("entering");
  const [code, setCode] = useState("");
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [progress, setProgress] = useState({ percent: 0, stage: "" });
  const [errorMsg, setErrorMsg] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const chunksRef = useRef<Uint8Array[]>([]);
  const keyRef = useRef<ArrayBuffer | null>(null);

  // Check URL for pre-filled code
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const urlCode = params.get("code");
    if (urlCode && /^\d{6}$/.test(urlCode)) {
      setCode(urlCode);
    }
  }, []);

  const handleConnect = useCallback(() => {
    if (code.length !== 6) return;
    setState("connecting");

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "join", data: code }));
    };

    ws.onmessage = async (e) => {
      const msg = JSON.parse(e.data);
      switch (msg.type) {
        case "paired":
          setState("paired");
          break;
        case "file_info": {
          const info = msg.data;
          setFileInfo({ name: info.name, size: info.size, type: info.type });
          // Extract key
          const { fromBase64 } = await import("@/lib/crypto");
          keyRef.current = fromBase64(info.key).buffer as ArrayBuffer;
          chunksRef.current = [];
          setState("receiving");
          break;
        }
        case "chunk": {
          const { decryptChunk, fromBase64 } = await import("@/lib/crypto");
          const encrypted = fromBase64(msg.data.payload);
          const key = keyRef.current;
          if (!key) return;
          const plaintext = await decryptChunk(key, encrypted);
          chunksRef.current[msg.data.index] = plaintext;
          setProgress({
            stage: `Receiving ${msg.data.index + 1}/${msg.data.total}`,
            percent: Math.round(((msg.data.index + 1) / msg.data.total) * 100),
          });
          break;
        }
        case "done": {
          // Assemble and download
          const totalSize = chunksRef.current.reduce((s, c) => s + c.byteLength, 0);
          const fullFile = new Uint8Array(totalSize);
          let offset = 0;
          for (const chunk of chunksRef.current) {
            fullFile.set(chunk, offset);
            offset += chunk.byteLength;
          }
          const blob = new Blob([fullFile], { type: fileInfo?.type || "application/octet-stream" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = fileInfo?.name || "download";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          setState("done");
          break;
        }
        case "error":
          setState("error");
          setErrorMsg(msg.data || "Transfer error");
          break;
      }
    };

    ws.onerror = () => {
      setState("error");
      setErrorMsg("Connection failed");
    };

    ws.onclose = () => {
      if (state !== "done" && state !== "error") {
        // Only show error if we didn't cleanly finish
      }
    };
  }, [code, fileInfo]);

  useEffect(() => {
    return () => { wsRef.current?.close(); };
  }, []);

  return (
    <div className="p-6 space-y-4">
      {state === "entering" && (
        <>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--color-text-secondary)]">Enter 6-digit code</label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              className="text-center text-2xl font-mono tracking-[0.3em]"
              maxLength={6}
              onKeyDown={(e) => { if (e.key === "Enter" && code.length === 6) handleConnect(); }}
            />
          </div>
          <Button onClick={handleConnect} disabled={code.length !== 6} className="w-full">
            <Download className="h-4 w-4 mr-2" />
            Connect
          </Button>
          <button onClick={onBack} className="w-full text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors py-1">
            Back
          </button>
        </>
      )}

      {state === "connecting" && (
        <div className="flex flex-col items-center gap-3 py-4">
          <LogoSpinner size={32} />
          <p className="text-sm text-[var(--color-text-muted)]">Connecting...</p>
        </div>
      )}

      {state === "paired" && (
        <div className="flex flex-col items-center gap-3 py-4">
          <LogoSpinner size={32} />
          <p className="text-sm text-[var(--color-text-muted)]">Paired! Waiting for file...</p>
        </div>
      )}

      {state === "receiving" && fileInfo && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <LogoSpinner size={24} speed="fast" />
            <div>
              <p className="text-sm font-semibold">{fileInfo.name}</p>
              <p className="text-xs text-[var(--color-text-muted)]">{formatBytes(fileInfo.size)}</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--color-text-muted)]">{progress.stage}</span>
              <span className="font-medium tabular-nums">{progress.percent}%</span>
            </div>
            <div className="h-2 rounded-full bg-[var(--color-surface-1)] overflow-hidden">
              <div className="h-full rounded-full bg-[var(--color-accent)] transition-all duration-300" style={{ width: `${progress.percent}%` }} />
            </div>
          </div>
        </div>
      )}

      {state === "done" && (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-cyan-500/10">
            <CheckCircle2 className="h-6 w-6 text-cyan-500" />
          </div>
          <h3 className="text-sm font-semibold">Transfer Complete</h3>
          <p className="text-xs text-[var(--color-text-muted)]">{fileInfo?.name} received and saved</p>
          <Button variant="secondary" onClick={onBack} className="mt-2">
            Receive Another
          </Button>
        </div>
      )}

      {state === "error" && (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-red-500/10">
            <AlertTriangle className="h-6 w-6 text-red-500" />
          </div>
          <h3 className="text-sm font-semibold">Connection Failed</h3>
          <p className="text-xs text-[var(--color-text-muted)]">{errorMsg}</p>
          <Button variant="secondary" onClick={onBack} className="mt-2">
            Try Again
          </Button>
        </div>
      )}
    </div>
  );
}
