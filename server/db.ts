import { and, count, desc, eq, gt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { channelComments, channelReactions, channelShares, InsertUser, memberships, roomMembers, roomMessages, roomPlayback, roomSignals, rooms, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try { _db = drizzle(process.env.DATABASE_URL); } catch (error) { console.warn("[Database] Failed to connect:", error); _db = null; }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) { if (user[field] !== undefined) { values[field] = user[field] ?? null; updateSet[field] = user[field] ?? null; } }
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
  else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (!Object.keys(updateSet).length) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function createWatchRoom(hostUserId: number, name: string) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    try {
      const result = await db.insert(rooms).values({ code, name, hostUserId });
      const roomId = Number(result[0].insertId);
      await db.insert(roomMembers).values({ roomId, userId: hostUserId, role: "host" });
      return (await db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1))[0];
    } catch (error) { if (attempt === 4) throw error; }
  }
  throw new Error("Could not allocate room code");
}

export async function getRoomByCode(code: string) {
  const db = await getDb(); if (!db) return undefined;
  return (await db.select().from(rooms).where(eq(rooms.code, code.toUpperCase())).limit(1))[0];
}

export async function getRoomMember(roomId: number, userId: number) {
  const db = await getDb(); if (!db) return undefined;
  return (await db.select().from(roomMembers).where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId))).limit(1))[0];
}

export async function addRoomMember(roomId: number, userId: number, role: "member" | "co-host" = "member") {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  await db.insert(roomMembers).values({ roomId, userId, role }).onDuplicateKeyUpdate({ set: { roomId } });
  return getRoomMember(roomId, userId);
}

export async function setRoomMemberRole(roomId: number, userId: number, role: "member" | "co-host") {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  await db.update(roomMembers).set({ role }).where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));
  return getRoomMember(roomId, userId);
}

export async function getRoomSnapshot(roomId: number) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const room = (await db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1))[0];
  const members = await db.select({ userId: roomMembers.userId, role: roomMembers.role, joinedAt: roomMembers.joinedAt, name: users.name, email: users.email }).from(roomMembers).leftJoin(users, eq(roomMembers.userId, users.id)).where(eq(roomMembers.roomId, roomId));
  const messages = await db.select({ id: roomMessages.id, userId: roomMessages.userId, body: roomMessages.body, createdAt: roomMessages.createdAt, name: users.name }).from(roomMessages).leftJoin(users, eq(roomMessages.userId, users.id)).where(eq(roomMessages.roomId, roomId)).orderBy(desc(roomMessages.createdAt)).limit(80);
  const playback = (await db.select().from(roomPlayback).where(eq(roomPlayback.roomId, roomId)).limit(1))[0] ?? null;
  return { room, members, messages: messages.reverse(), playback };
}

export async function addRoomMessage(roomId: number, userId: number, body: string) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  await db.insert(roomMessages).values({ roomId, userId, body });
}

export async function addRoomSignal(roomId: number, fromUserId: number, toUserId: number, kind: "hello" | "offer" | "answer" | "ice", payload: string) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const result = await db.insert(roomSignals).values({ roomId, fromUserId, toUserId, kind, payload });
  return Number(result[0].insertId);
}

export async function getRoomSignals(roomId: number, userId: number, afterId: number) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  return db.select().from(roomSignals).where(and(eq(roomSignals.roomId, roomId), eq(roomSignals.toUserId, userId), gt(roomSignals.id, afterId))).orderBy(roomSignals.id).limit(80);
}

export async function setRoomPlayback(roomId: number, userId: number, data: { channelId: string; channelName: string; streamUrl: string; isPlaying: boolean; positionMs: number }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  await db.insert(roomPlayback).values({ roomId, updatedBy: userId, ...data, isPlaying: data.isPlaying ? 1 : 0 }).onDuplicateKeyUpdate({ set: { ...data, isPlaying: data.isPlaying ? 1 : 0, updatedBy: userId, updatedAt: new Date() } });
  return (await db.select().from(roomPlayback).where(eq(roomPlayback.roomId, roomId)).limit(1))[0];
}

export async function getChannelEngagement(channelId: string, userId?: number) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const reactionCounts = await db.select({ reaction: channelReactions.reaction, total: count() }).from(channelReactions).where(eq(channelReactions.channelId, channelId)).groupBy(channelReactions.reaction);
  const viewerReaction = userId ? (await db.select({ reaction: channelReactions.reaction }).from(channelReactions).where(and(eq(channelReactions.channelId, channelId), eq(channelReactions.userId, userId))).limit(1))[0]?.reaction ?? null : null;
  const comments = await db.select({ id: channelComments.id, body: channelComments.body, createdAt: channelComments.createdAt, userId: channelComments.userId, name: users.name }).from(channelComments).leftJoin(users, eq(channelComments.userId, users.id)).where(eq(channelComments.channelId, channelId)).orderBy(desc(channelComments.createdAt)).limit(100);
  const likes = reactionCounts.find((item) => item.reaction === "like")?.total ?? 0;
  const dislikes = reactionCounts.find((item) => item.reaction === "dislike")?.total ?? 0;
  return { likes, dislikes, viewerReaction, comments: comments.reverse() };
}

export async function setChannelReaction(channelId: string, userId: number, reaction: "like" | "dislike" | null) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  if (!reaction) await db.delete(channelReactions).where(and(eq(channelReactions.channelId, channelId), eq(channelReactions.userId, userId)));
  else await db.insert(channelReactions).values({ channelId, userId, reaction }).onDuplicateKeyUpdate({ set: { reaction, updatedAt: new Date() } });
  return getChannelEngagement(channelId, userId);
}

export async function addChannelComment(channelId: string, userId: number, body: string) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  await db.insert(channelComments).values({ channelId, userId, body });
  return getChannelEngagement(channelId, userId);
}

export async function recordChannelShare(data: { channelId: string; channelName: string; userId: number; recipient: string; method: "copy" | "email" | "whatsapp" | "direct" }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const result = await db.insert(channelShares).values(data);
  return { id: Number(result[0].insertId) };
}

export async function listChannelShares(limit = 100) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  return db.select({ id: channelShares.id, channelId: channelShares.channelId, channelName: channelShares.channelName, recipient: channelShares.recipient, method: channelShares.method, createdAt: channelShares.createdAt, userId: channelShares.userId, userName: users.name, userEmail: users.email }).from(channelShares).leftJoin(users, eq(channelShares.userId, users.id)).orderBy(desc(channelShares.createdAt)).limit(limit);
}

export async function getOrCreateMembership(userId: number) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const existing = (await db.select().from(memberships).where(eq(memberships.userId, userId)).limit(1))[0];
  if (existing) return existing;
  const trialEndsAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
  await db.insert(memberships).values({ userId, plan: "plus", status: "trial", trialEndsAt });
  return (await db.select().from(memberships).where(eq(memberships.userId, userId)).limit(1))[0];
}

export async function getMembershipEntitlement(userId: number) {
  const membership = await getOrCreateMembership(userId);
  const now = Date.now();
  const trialActive = membership.status === "trial" && membership.trialEndsAt > now;
  const paidActive = membership.status === "active" && (!membership.currentPeriodEndsAt || membership.currentPeriodEndsAt > now);
  const effectivePlan = trialActive || paidActive ? membership.plan : "free";
  return {
    membership,
    effectivePlan,
    trialActive,
    trialDaysRemaining: trialActive ? Math.max(1, Math.ceil((membership.trialEndsAt - now) / 86400000)) : 0,
    maxQuality: effectivePlan === "max" ? "4K" : effectivePlan === "plus" ? "Full HD" : "SD 360p",
  } as const;
}
