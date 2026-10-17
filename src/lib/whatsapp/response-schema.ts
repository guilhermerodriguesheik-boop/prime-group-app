import { z } from "zod";

export const whatsAppResponseSchema = z.object({
  answer: z.string().max(1500),
  actions: z.array(z.object({
    kind: z.enum(["transaction","trip","note","debt"]),
    workspace: z.enum(["prime","personal","interest"]).nullable(),
    certainty: z.enum(["confirmed","unconfirmed"]),
    description: z.string().max(500),
    direction: z.enum(["income","expense"]).nullable(),
    amount: z.number().nonnegative().nullable(),
    date: z.string().nullable(),
    recurrence: z.enum(["none","monthly"]).nullable(),
    origin: z.string().nullable(),
    destination: z.string().nullable(),
    customer: z.string().nullable(),
    driver: z.string().nullable(),
    driverCost: z.number().nonnegative().nullable(),
    freightValue: z.number().nonnegative().nullable(),
    distanceKm: z.number().nonnegative().nullable(),
    reference: z.string().nullable(),
  })).max(3),
});
