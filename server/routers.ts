import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { addRoomMember, addRoomMessage, addRoomSignal, createWatchRoom, getRoomByCode, getRoomMember, getRoomSignals, getRoomSnapshot, setRoomMemberRole, setRoomPlayback } from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";

const roomCode = z.string().trim().min(4).max(12).transform((code) => code.toUpperCase());

async function requireRoomMember(code: string, userId: number) {
  const room = await getRoomByCode(code);
  if (!room) throw new TRPCError({ code: "NOT_FOUND", message: "Watch room not found" });
  const member = await getRoomMember(room.id, userId);
  if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Join this room before using it" });
  return { room, member };
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  watchRooms: router({
    create: protectedProcedure.input(z.object({ name: z.string().trim().min(2).max(120).default("NOVA watch party") })).mutation(async ({ ctx, input }) => {
      const room = await createWatchRoom(ctx.user.id, input.name);
      return { room, snapshot: await getRoomSnapshot(room.id) };
    }),
    get: protectedProcedure.input(z.object({ code: roomCode })).query(async ({ ctx, input }) => {
      const { room } = await requireRoomMember(input.code, ctx.user.id);
      return getRoomSnapshot(room.id);
    }),
    join: protectedProcedure.input(z.object({ code: roomCode })).mutation(async ({ ctx, input }) => {
      const room = await getRoomByCode(input.code);
      if (!room) throw new TRPCError({ code: "NOT_FOUND", message: "That room code is not active" });
      await addRoomMember(room.id, ctx.user.id);
      return getRoomSnapshot(room.id);
    }),
    message: protectedProcedure.input(z.object({ code: roomCode, body: z.string().trim().min(1).max(600) })).mutation(async ({ ctx, input }) => {
      const { room } = await requireRoomMember(input.code, ctx.user.id);
      await addRoomMessage(room.id, ctx.user.id, input.body);
      return getRoomSnapshot(room.id);
    }),
    signals: protectedProcedure.input(z.object({ code: roomCode, afterId: z.number().int().min(0).default(0) })).query(async ({ ctx, input }) => {
      const { room } = await requireRoomMember(input.code, ctx.user.id);
      return getRoomSignals(room.id, ctx.user.id, input.afterId);
    }),
    signal: protectedProcedure.input(z.object({ code: roomCode, toUserId: z.number().int().positive(), kind: z.enum(["hello", "offer", "answer", "ice"]), payload: z.string().max(20000) })).mutation(async ({ ctx, input }) => {
      const { room } = await requireRoomMember(input.code, ctx.user.id);
      const recipient = await getRoomMember(room.id, input.toUserId);
      if (!recipient) throw new TRPCError({ code: "BAD_REQUEST", message: "That participant is no longer in the room" });
      return { id: await addRoomSignal(room.id, ctx.user.id, input.toUserId, input.kind, input.payload) };
    }),
    playback: protectedProcedure.input(z.object({ code: roomCode, channelId: z.string().min(1).max(320), channelName: z.string().min(1).max(240), streamUrl: z.string().url(), isPlaying: z.boolean(), positionMs: z.number().int().min(0).max(86400000) })).mutation(async ({ ctx, input }) => {
      const { room, member } = await requireRoomMember(input.code, ctx.user.id);
      if (member.role !== "host" && member.role !== "co-host") throw new TRPCError({ code: "FORBIDDEN", message: "Only the host or a co-host can control playback" });
      await setRoomPlayback(room.id, ctx.user.id, input);
      return getRoomSnapshot(room.id);
    }),
    setMemberRole: protectedProcedure.input(z.object({ code: roomCode, userId: z.number().int().positive(), role: z.enum(["member", "co-host"]) })).mutation(async ({ ctx, input }) => {
      const { room, member } = await requireRoomMember(input.code, ctx.user.id);
      if (member.role !== "host") throw new TRPCError({ code: "FORBIDDEN", message: "Only the host can promote co-hosts" });
      await setRoomMemberRole(room.id, input.userId, input.role);
      return getRoomSnapshot(room.id);
    }),
  }),
});

export type AppRouter = typeof appRouter;
