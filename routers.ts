import { eq } from "drizzle-orm";
import { z } from "zod";
import { categories } from "../drizzle/schema";
import * as db from "./db";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { systemRouter } from "./_core/systemRouter";

const statusSchema = z.enum(["pending", "paid", "processing", "delivered", "cancelled"]);

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie("webdev_app_session", { maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  catalog: router({
    categories: publicProcedure.query(async () => {
      const database = await db.getDb();
      if (!database) return [];
      await db.ensureSeeded();
      return database.select().from(categories).where(eq(categories.active, true));
    }),
    products: publicProcedure.input(z.object({ categoryId: z.number().optional(), search: z.string().optional() }).optional()).query(({ input }) => db.listCatalog(input?.categoryId, input?.search)),
  }),
  orders: router({
    create: publicProcedure.input(z.object({
      customerName: z.string().min(2).max(160),
      customerContact: z.string().min(5).max(160),
      notes: z.string().max(1000).optional(),
      items: z.array(z.object({ productId: z.number().int().positive(), quantity: z.number().int().min(1).max(20) })).min(1).max(20),
    })).mutation(async ({ ctx, input }) => db.createOrder({ ...input, userId: ctx.user?.id })),
    mine: protectedProcedure.query(({ ctx }) => db.listOrders(ctx.user.id)),
    items: protectedProcedure.input(z.object({ orderId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const orders = await db.listOrders(ctx.user.id);
      if (!orders.some(order => order.id === input.orderId)) return [];
      return db.listOrderItems(input.orderId);
    }),
  }),
  admin: router({
    dashboard: adminProcedure.query(() => db.getDashboardData()),
    products: adminProcedure.query(() => db.listAdminProducts()),
    categories: adminProcedure.query(async () => {
      const database = await db.getDb();
      if (!database) return [];
      await db.ensureSeeded();
      return database.select().from(categories).orderBy(categories.name);
    }),
    orders: adminProcedure.query(() => db.listOrders()),
    orderItems: adminProcedure.input(z.object({ orderId: z.number().int().positive() })).query(({ input }) => db.listOrderItems(input.orderId)),
    addProduct: adminProcedure.input(z.object({ categoryId: z.number().int().positive(), name: z.string().min(2).max(180), description: z.string().min(2).max(1000), price: z.string().regex(/^\d+(\.\d{1,2})?$/), badge: z.string().max(60).optional(), accent: z.string().max(20).optional(), featured: z.boolean().optional() })).mutation(({ input }) => db.addProduct(input)),
    deleteProduct: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ input }) => db.deleteProduct(input.id)),
    addCodes: adminProcedure.input(z.object({ productId: z.number().int().positive(), codes: z.string().min(1) })).mutation(({ input }) => db.addCodes(input.productId, input.codes.split(/\r?\n|,/))),
    updateOrderStatus: adminProcedure.input(z.object({ id: z.number().int().positive(), status: statusSchema })).mutation(({ input }) => db.updateOrderStatus(input.id, input.status)),
    settings: adminProcedure.query(() => db.listSettings()),
    updateSetting: adminProcedure.input(z.object({ key: z.string().min(1).max(80), value: z.string().max(500) })).mutation(({ input }) => db.updateSetting(input.key, input.value)),
  }),
});

export type AppRouter = typeof appRouter;
