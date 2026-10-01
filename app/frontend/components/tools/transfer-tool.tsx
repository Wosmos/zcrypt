"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { UploadZone } from "@/components/upload/upload-zone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconButton } from "@/components/ui/icon-button";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import { QRShare } from "@/components/ui/qr-code";
import { Send, Download, Lock, Copy, Check } from "@/lib/icons";
import { formatBytes } from "@/lib/utils";
import { copyToClipboard } from "@/lib/clipboard";
import {
  deriveTransferKeys,
  formatPairingSecret,
  isCompletePairingSecret,
  newPairingSecret,
  normalizePairingSecret,
  assembleTransfer,
  openChunk,
  openMeta,
  pairingLink,
  sealChunk,
  sealMeta,
  secretFromHash,
} from "@/lib/transfer-crypto";
import { SelectedFileCard } from "./shared/selected-file-card";
import { ProgressBar } from "./shared/progress-bar";
import { ToolErrorState, ToolSuccessState } from "./shared/tool-states";

const WS_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/^http/, "ws") + "/api/transfer/ws";

type Mode = "choose" | "send" | "receive";
type SendState = "selecting" | "waiting" | "paired" | "transferring" | "done" | "error";
type RecvState = "entering" | "connecting" | "paired" | "receiving" | "done" | "error";

interface FileInfo {
  name: string;
  size: number;
  type: string;
  chunks: number;
}

/**
 * Shared onerror/onclose wiring for both the send and receive sockets. After a
 * successful transfer the server tears down the room and closes the socket,
 * which fires an error event: don't overwrite a terminal state, or that
 * produces a bogus "Connection failed" after the transfer already completed.
 */
function attachWsLifecycle(
  ws: WebSocket,
  stateRef: { current: string },
  setState: (s: "error") => void,
  setErrorMsg: (msg: string) => void,
) {
  ws.onerror = () => {
    if (stateRef.current !== "done" && stateRef.current !== "error") {
      setState("error");
      setErrorMsg("Connection failed");
    }
  };
  ws.onclose = () => {
    if (stateRef.current !== "done" && stateRef.current !== "error") {
      setState("error");
      setErrorMsg("Connection lost");
    }
  };
}

function ConfirmCode({ value }: { value: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] p-3 text-center">
      <p className="text-xs text-[var(--color-text-muted)]">
        Both screens must show the same confirmation code
      </p>
      <p className="mt-1 font-mono text-xl tracking-[0.2em] tabular-nums">{value}</p>
    </div>
  );
}

export function TransferTool() {
  const [mode, setMode] = useState<Mode>("choose");

  return (
    <div className="panel overflow-hidden">
      {mode === "choose" && (
        <div className="p-6 space-y-3">
          <Button onClick={() => setMode("send")} className="w-full">
            <Send className="h-4 w-4 mr-2" /> Send a File
          </Button>
          <Button variant="secondary" onClick={() => setMode("receive")} className="w-full">
            <Download className="h-4 w-4 mr-2" /> Receive a File
          </Button>
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
            <p className="text-xs text-cyan-700 dark:text-cyan-300">
              Files are encrypted on the sending device with a key that never touches the server. It
              travels only in the QR code or link you share, or in the pairing key you read out. The
              server relays ciphertext and cannot read the file or its name, but it can see that a
              transfer happened and roughly how large it is.
            </p>
          </div>
        </div>
      )}
      {mode === "send" && <TransferSendMode onBack={() => setMode("choose")} />}
      {mode === "receive" && <TransferReceiveMode onBack={() => setMode("choose")} />}
    </div>
  );
}

function TransferSendMode({ onBack }: { onBack: () => void }) {
  const [state, setState] = useState<SendState>("selecting");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [code, setCode] = useState("");
  const [secret, setSecret] = useState("");
  const [confirm, setConfirm] = useState("");
  const [progress, setProgress] = useState({ percent: 0, stage: "" });
  const [errorMsg, setErrorMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const secretRef = useRef("");
  const codeRef = useRef("");
  const stateRef = useRef<SendState>(state);
  stateRef.current = state;

  const handleFiles = useCallback((files: File[]) => {
    if (files[0]) setSelectedFile(files[0]);
  }, []);

  const startTransfer = useCallback(async (ws: WebSocket, file: File) => {
    setState("transferring");
    try {
      const { key, confirm: cf } = await deriveTransferKeys(secretRef.current, codeRef.current);
      setConfirm(cf);
      const CHUNK = 64 * 1024;
      const totalChunks = Math.ceil(file.size / CHUNK);

      ws.send(
        JSON.stringify({
          type: "file_info",
          data: {
            meta: await sealMeta(key, {
              name: file.name,
              size: file.size,
              type: file.type,
              chunks: totalChunks,
            }),
          },
        }),
      );

      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK;
        const end = Math.min(start + CHUNK, file.size);
        const slice = file.slice(start, end);
        const plaintext = new Uint8Array(await slice.arrayBuffer());
        const payload = await sealChunk(key, i, totalChunks, plaintext);

        ws.send(
          JSON.stringify({
            type: "chunk",
            data: { index: i, total: totalChunks, payload },
          }),
        );

        setProgress({
          stage: `Sending ${i + 1}/${totalChunks}`,
          percent: Math.round(((i + 1) / totalChunks) * 100),
        });
        if (i % 5 === 0) await new Promise((r) => setTimeout(r, 0));
      }

      ws.send(JSON.stringify({ type: "done" }));
      setState("done");
    } catch (err) {
      setState("error");
      setErrorMsg(err instanceof Error ? err.message : "Transfer failed");
    }
  }, []);

  const handleStart = useCallback(async () => {
    if (!selectedFile) return;
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return; // already connecting/open
    setState("waiting");

    const pairSecret = newPairingSecret();
    secretRef.current = pairSecret;
    setSecret(pairSecret);

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "create" }));
    };

    ws.onmessage = async (e) => {
      const msg = JSON.parse(e.data);
      switch (msg.type) {
        case "code":
          codeRef.current = msg.data;
          setCode(msg.data);
          void deriveTransferKeys(pairSecret, msg.data).then((k) => setConfirm(k.confirm));
          break;
        case "paired":
          setState("paired");
          setTimeout(() => {
            void startTransfer(ws, selectedFile);
          }, 200);
          break;
        case "error":
          setState("error");
          setErrorMsg(msg.data || "Transfer error");
          break;
      }
    };

    attachWsLifecycle(ws, stateRef, setState, setErrorMsg);
  }, [selectedFile, startTransfer]);

  const pairLink =
    code && secret
      ? pairingLink(typeof window !== "undefined" ? window.location.origin : "", code, secret)
      : "";

  const handleCopyCode = useCallback(async () => {
    if (!pairLink) return;
    if (await copyToClipboard(pairLink)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [pairLink]);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  return (
    <div className="p-6 space-y-4">
      {state === "selecting" && (
        <>
          {!selectedFile ? (
            <UploadZone
              onFiles={handleFiles}
              hint="Select a file to send to another device"
              compact
            />
          ) : (
            <>
              <SelectedFileCard
                name={selectedFile.name}
                size={selectedFile.size}
                onRemove={() => setSelectedFile(null)}
              />
              <Button onClick={handleStart} className="w-full">
                <Lock className="h-4 w-4 mr-2" /> Start Transfer
              </Button>
            </>
          )}
          <button
            onClick={onBack}
            className="w-full text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors py-1"
          >
            Back
          </button>
        </>
      )}

      {state === "waiting" && (
        <div className="space-y-4 text-center">
          <div className="flex flex-col items-center gap-3">
            <LogoSpinner size={32} />
            <p className="text-sm font-medium">Waiting for receiver</p>
            <p className="text-xs text-[var(--color-text-muted)]">
              Scan the QR code or open the link on the receiving device, or type the code and
              pairing key there
            </p>
          </div>
          {code && (
            <>
              <div className="flex items-center justify-center gap-2">
                <div className="text-4xl font-bold font-mono tracking-[0.3em] tabular-nums text-[var(--color-text)]">
                  {code}
                </div>
                <IconButton
                  icon={copied ? Check : Copy}
                  label={copied ? "Copied" : "Copy link"}
                  variant="ghost"
                  onClick={handleCopyCode}
                  iconClassName={copied ? "h-4 w-4 text-cyan-500" : "h-4 w-4"}
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-[var(--color-text-muted)]">Pairing key</p>
                <p className="font-mono text-sm tracking-wider break-all">
                  {formatPairingSecret(secret)}
                </p>
              </div>
              <QRShare url={pairLink} />
              {confirm && <ConfirmCode value={confirm} />}
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
              <p className="text-xs text-[var(--color-text-muted)]">
                {formatBytes(selectedFile?.size || 0)}
              </p>
            </div>
          </div>
          {confirm && <ConfirmCode value={confirm} />}
          <ProgressBar stage={progress.stage || "Preparing..."} percent={progress.percent} />
        </div>
      )}

      {state === "done" && (
        <ToolSuccessState
          title="Transfer Complete"
          message={<>{selectedFile?.name} sent successfully</>}
          actionLabel="Send Another"
          onAction={onBack}
        />
      )}

      {state === "error" && (
        <ToolErrorState title="Transfer Failed" message={errorMsg} onAction={onBack} />
      )}
    </div>
  );
}

function TransferReceiveMode({ onBack }: { onBack: () => void }) {
  const [state, setState] = useState<RecvState>("entering");
  const [code, setCode] = useState("");
  const [secret, setSecret] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [progress, setProgress] = useState({ percent: 0, stage: "" });
  const [errorMsg, setErrorMsg] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const chunksRef = useRef<Uint8Array[]>([]);
  const keyRef = useRef<ArrayBuffer | null>(null);
  const fileInfoRef = useRef<FileInfo | null>(null);
  const stateRef = useRef<RecvState>(state);
  stateRef.current = state;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const urlCode = params.get("code");
    if (urlCode && /^\d{6}$/.test(urlCode)) setCode(urlCode);
    const urlSecret = secretFromHash(window.location.hash);
    if (urlSecret) {
      setSecret(urlSecret);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  const handleConnect = useCallback(() => {
    if (code.length !== 6 || !isCompletePairingSecret(secret)) return;
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return; // already connecting/open
    setState("connecting");

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    const keysPromise = deriveTransferKeys(secret, code);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "join", data: code }));
    };

    const handle = async (raw: string) => {
      const msg = JSON.parse(raw);
      switch (msg.type) {
        case "paired":
          setState("paired");
          void keysPromise.then((k) => setConfirm(k.confirm));
          break;
        case "file_info": {
          try {
            const { key } = await keysPromise;
            const fi = await openMeta(key, msg.data.meta);
            keyRef.current = key;
            fileInfoRef.current = fi;
            setFileInfo(fi);
            chunksRef.current = [];
            setState("receiving");
          } catch {
            setState("error");
            setErrorMsg("Pairing key does not match the sender");
            ws.close();
          }
          break;
        }
        case "chunk": {
          const key = keyRef.current;
          const fi = fileInfoRef.current;
          if (!key || !fi) return;
          try {
            const index = msg.data.index;
            if (chunksRef.current[index]) throw new Error("Transfer integrity check failed");
            chunksRef.current[index] = await openChunk(key, index, fi.chunks, msg.data.payload);
            setProgress({
              stage: `Receiving ${index + 1}/${fi.chunks}`,
              percent: Math.round(((index + 1) / fi.chunks) * 100),
            });
          } catch {
            setState("error");
            setErrorMsg("Transfer integrity check failed");
            ws.close();
          }
          break;
        }
        case "done": {
          const fi = fileInfoRef.current;
          let fullFile: Uint8Array<ArrayBuffer>;
          try {
            if (!fi) throw new Error("Transfer integrity check failed");
            fullFile = assembleTransfer(chunksRef.current, fi);
          } catch {
            setState("error");
            setErrorMsg("Transfer integrity check failed: the file was incomplete or altered");
            ws.close();
            break;
          }
          setState("done"); // Mark done immediately so onclose doesn't show error
          const blob = new Blob([fullFile], { type: fi?.type || "application/octet-stream" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = fi?.name || "download";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          break;
        }
        case "error":
          setState("error");
          setErrorMsg(msg.data || "Transfer error");
          break;
      }
    };
    let queue = Promise.resolve();
    ws.onmessage = (e) => {
      queue = queue
        .then(() => handle(e.data))
        .catch(() => {
          setState("error");
          setErrorMsg("Transfer error");
          ws.close();
        });
    };

    attachWsLifecycle(ws, stateRef, setState, setErrorMsg);
  }, [code, secret]);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  return (
    <div className="p-6 space-y-4">
      {state === "entering" && (
        <>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--color-text-secondary)]">
              Enter 6-digit code
            </label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              className="text-center text-2xl font-mono tracking-[0.3em]"
              maxLength={6}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleConnect();
              }}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--color-text-secondary)]">
              Pairing key (skip if you scanned the QR code)
            </label>
            <Input
              value={formatPairingSecret(secret)}
              onChange={(e) => setSecret(normalizePairingSecret(e.target.value))}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              className="text-center font-mono tracking-wider"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <Button
            onClick={handleConnect}
            disabled={code.length !== 6 || !isCompletePairingSecret(secret)}
            className="w-full"
          >
            <Download className="h-4 w-4 mr-2" /> Connect
          </Button>
          <button
            onClick={onBack}
            className="w-full text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors py-1"
          >
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
          {confirm && <ConfirmCode value={confirm} />}
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
          {confirm && <ConfirmCode value={confirm} />}
          <ProgressBar stage={progress.stage} percent={progress.percent} />
        </div>
      )}

      {state === "done" && (
        <ToolSuccessState
          title="Transfer Complete"
          message={<>{fileInfo?.name} received and saved</>}
          actionLabel="Receive Another"
          onAction={onBack}
        />
      )}

      {state === "error" && (
        <ToolErrorState title="Connection Failed" message={errorMsg} onAction={onBack} />
      )}
    </div>
  );
}
