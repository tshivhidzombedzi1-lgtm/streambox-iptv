import { int, mysqlEnum, mysqlTable, primaryKey, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const rooms = mysqlTable("watch_rooms", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 12 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  hostUserId: int("hostUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const roomMembers = mysqlTable("watch_room_members", {
  roomId: int("roomId").notNull(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["host", "co-host", "member"]).default("member").notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.roomId, table.userId] }),
}));

export const roomMessages = mysqlTable("watch_room_messages", {
  id: int("id").autoincrement().primaryKey(),
  roomId: int("roomId").notNull(),
  userId: int("userId").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const roomSignals = mysqlTable("watch_room_signals", {
  id: int("id").autoincrement().primaryKey(),
  roomId: int("roomId").notNull(),
  fromUserId: int("fromUserId").notNull(),
  toUserId: int("toUserId").notNull(),
  kind: mysqlEnum("kind", ["hello", "offer", "answer", "ice"]).notNull(),
  payload: text("payload").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const roomPlayback = mysqlTable("watch_room_playback", {
  roomId: int("roomId").primaryKey(),
  channelId: varchar("channelId", { length: 320 }).notNull(),
  channelName: varchar("channelName", { length: 240 }).notNull(),
  streamUrl: text("streamUrl").notNull(),
  isPlaying: int("isPlaying").default(0).notNull(),
  positionMs: int("positionMs").default(0).notNull(),
  updatedBy: int("updatedBy").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Room = typeof rooms.$inferSelect;
export type RoomMember = typeof roomMembers.$inferSelect;
export type RoomMessage = typeof roomMessages.$inferSelect;
export type RoomSignal = typeof roomSignals.$inferSelect;
export type RoomPlayback = typeof roomPlayback.$inferSelect;
