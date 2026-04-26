"use client";

import type { DataConnection, MediaConnection, Peer as PeerType } from "peerjs";

export type DuelRole = "host" | "guest";

export type DuelMessage =
  | { type: "hello"; name: string }
  | { type: "ready" }
  | { type: "start"; startAt: number /* epoch ms */; durationMs: number }
  | { type: "score"; reps: number; combo: number }
  | { type: "final"; reps: number }
  | { type: "rematch" };

export interface DuelClientHandlers {
  onOpen?: (role: DuelRole, id: string) => void;
  onConnect?: (conn: DataConnection) => void;
  onMessage?: (msg: DuelMessage) => void;
  onDisconnect?: () => void;
  onError?: (err: Error) => void;
  onRemoteStream?: (stream: MediaStream) => void;
}

/**
 * Thin wrapper around PeerJS for 1v1 duels.
 *
 *   - createAsHost()  -> returns a short shareable room code (first 6 chars of peer id),
 *                        listens for one incoming connection, then exchanges DuelMessages.
 *   - joinAsGuest(code) -> dials the given peer id prefix.
 *
 * PeerJS runs against its public broker (0.peerjs.com) by default, which is
 * fine for MVP. Swap to a self-hosted broker for production reliability.
 */
export class DuelClient {
  private peer: PeerType | null = null;
  private conn: DataConnection | null = null;
  private mediaConn: MediaConnection | null = null;
  private pendingCall: MediaConnection | null = null;
  private localStream: MediaStream | null = null;
  private remotePeerId: string | null = null;
  public id: string | null = null;
  public role: DuelRole | null = null;

  constructor(private readonly handlers: DuelClientHandlers = {}) {}

  /** Host a room. Returns the peer id (room code). */
  async createAsHost(preferredId?: string): Promise<string> {
    const Peer = (await import("peerjs")).default;
    this.role = "host";
    const peer = preferredId ? new Peer(preferredId, { debug: 1 }) : new Peer({ debug: 1 });
    this.peer = peer;
    return new Promise((resolve, reject) => {
      peer.on("open", (id) => {
        this.id = id;
        this.handlers.onOpen?.("host", id);
        resolve(id);
      });
      peer.on("error", (err: Error) => {
        this.handlers.onError?.(err);
        reject(err);
      });
      peer.on("connection", (c) => this.attach(c));
      peer.on("call", (call) => {
        // Host receives a call from guest. Defer answering until our local
        // stream is ready, so the guest gets our video too (answer() can only
        // be called once per call).
        if (this.localStream) this.acceptCall(call);
        else this.pendingCall = call;
      });
      peer.on("disconnected", () => this.handlers.onDisconnect?.());
    });
  }

  /** Join a host's room. */
  async joinAsGuest(hostId: string): Promise<void> {
    const Peer = (await import("peerjs")).default;
    this.role = "guest";
    const peer = new Peer({ debug: 1 });
    this.peer = peer;
    return new Promise((resolve, reject) => {
      peer.on("open", (id) => {
        this.id = id;
        this.handlers.onOpen?.("guest", id);
        const c = peer.connect(hostId, { reliable: true });
        const timeout = setTimeout(() => {
          reject(new Error("Timed out connecting to host. Check the code."));
        }, 15000);
        c.on("open", () => {
          clearTimeout(timeout);
          this.attach(c);
          resolve();
        });
        c.on("error", (e: Error) => {
          clearTimeout(timeout);
          reject(e);
        });
      });
      peer.on("error", (err: Error) => {
        this.handlers.onError?.(err);
        reject(err);
      });
    });
  }

  private attach(c: DataConnection) {
    this.conn = c;
    this.remotePeerId = c.peer;
    this.handlers.onConnect?.(c);
    // If we already have a local stream when the data conn comes up, dial media now.
    if (this.role === "guest" && this.localStream) this.placeCall();
    c.on("data", (data) => {
      try {
        const msg = data as DuelMessage;
        this.handlers.onMessage?.(msg);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("bad msg", data);
      }
    });
    c.on("close", () => this.handlers.onDisconnect?.());
    c.on("error", (e: Error) => this.handlers.onError?.(e));
  }

  send(msg: DuelMessage) {
    this.conn?.send(msg);
  }

  /** Provide the local camera stream. The guest will dial the host once both
   *  the data connection and stream are available; the host stores it so the
   *  next inbound call can be answered with it. */
  setLocalStream(stream: MediaStream | null) {
    this.localStream = stream;
    if (!stream) return;
    // Guest dials once both data conn and stream are available.
    if (this.role === "guest" && this.conn?.open && !this.mediaConn) {
      this.placeCall();
    }
    // Host may have a call queued from before its camera came online.
    if (this.role === "host" && this.pendingCall) {
      const c = this.pendingCall;
      this.pendingCall = null;
      this.acceptCall(c);
    }
  }

  private placeCall() {
    if (!this.peer || !this.remotePeerId || !this.localStream) return;
    const call = this.peer.call(this.remotePeerId, this.localStream);
    if (!call) return;
    this.mediaConn = call;
    call.on("stream", (s) => this.handlers.onRemoteStream?.(s));
    call.on("close", () => { this.mediaConn = null; });
    call.on("error", () => { this.mediaConn = null; });
  }

  private acceptCall(call: MediaConnection) {
    this.mediaConn = call;
    try { call.answer(this.localStream ?? undefined); } catch {}
    call.on("stream", (s) => this.handlers.onRemoteStream?.(s));
    call.on("close", () => { this.mediaConn = null; });
    call.on("error", () => { this.mediaConn = null; });
  }

  close() {
    try { this.mediaConn?.close(); } catch {}
    try { this.conn?.close(); } catch {}
    try { this.peer?.destroy(); } catch {}
    this.mediaConn = null;
    this.conn = null;
    this.peer = null;
  }

  get connected(): boolean {
    return !!this.conn && this.conn.open;
  }
}
