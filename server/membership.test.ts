import { describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

function publicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("membership pricing and entitlement", () => {
  it("publishes a clear Free, Plus, and Max pricing ladder", async () => {
    const caller = appRouter.createCaller(publicContext());
    const plans = await caller.membership.plans();
    expect(plans.map((plan) => plan.id)).toEqual(["free", "plus", "max"]);
    expect(plans.find((plan) => plan.id === "plus")).toMatchObject({ monthlyUsd: 8.99, quality: "Full HD 1080p", trialDays: 30 });
    expect(plans.find((plan) => plan.id === "max")).toMatchObject({ monthlyUsd: 14.99, devices: 4 });
  });

  it("caps anonymous viewing at SD without fabricating a membership", async () => {
    const caller = appRouter.createCaller(publicContext());
    await expect(caller.membership.current()).resolves.toMatchObject({ membership: null, effectivePlan: "free", maxQuality: "SD 360p", trialActive: false });
  });
});
