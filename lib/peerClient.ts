"use client";

import type { DataConnection, Peer as PeerType } from "peerjs";

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
  public id: string | null = null;
  public role: DuelRole | null = null;

  constructor(private readonly handlers: DuelClientHandlers = {}) {}

  /** Host a room. Returns the peer id (room code). */
  async createAsHost(preferredId?: string): Promise<string> {
    const Peer = (await import("peerjs")).default;
    this.role = "host";
    const peer = new Peer(preferredId ?? undefined, { debug: 1 });
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
      peer.on("disconnected", () => this.handlers.onDisconnect?.());
    });
  }

  /** Join a host's room. */
  async joinAsGuest(hostId: string): Promise<void> {
    const Peer = (await import("peerjs")).default;
    this.role = "guest";
    const peer = new Peer(undefined, { debug: 1 });
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
    this.handlers.onConnect?.(c);
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

  close() {
    try { this.conn?.close(); } catch {}
    try { this.peer?.destroy(); } catch {}
    this.conn = null;
    this.peer = null;
  }

  get connected(): boolean {
    return !!this.conn && this.conn.open;
  }
}
