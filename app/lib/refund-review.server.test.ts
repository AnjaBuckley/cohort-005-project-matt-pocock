import { describe, it, expect, beforeEach, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import {
  approveRefundRequest,
  declineRefundRequest,
  listOpenRefundRequests,
} from "./refund-review.server";

// The helpers take the app's db type; the in-memory test db is the same shape.
type Db = Parameters<typeof listOpenRefundRequests>[0];

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;
let admin: typeof schema.users.$inferSelect;
let purchase: typeof schema.purchases.$inferSelect;
let refund: typeof schema.refunds.$inferSelect;

function asDb() {
  return testDb as unknown as Db;
}

function seedRefundRequest() {
  base = seedBaseData(testDb);

  admin = testDb
    .insert(schema.users)
    .values({
      name: "Admin",
      email: "admin@example.com",
      role: schema.UserRole.Admin,
    })
    .returning()
    .get();

  testDb
    .insert(schema.enrollments)
    .values({ userId: base.user.id, courseId: base.course.id })
    .run();

  purchase = testDb
    .insert(schema.purchases)
    .values({
      userId: base.user.id,
      courseId: base.course.id,
      amountPaid: 4900,
    })
    .returning()
    .get();

  refund = testDb
    .insert(schema.refunds)
    .values({ purchaseId: purchase.id, reason: "It was not what I expected." })
    .returning()
    .get();
}

function enrollmentCount() {
  return testDb
    .select()
    .from(schema.enrollments)
    .where(
      and(
        eq(schema.enrollments.userId, base.user.id),
        eq(schema.enrollments.courseId, base.course.id)
      )
    )
    .all().length;
}

function getRefund() {
  return testDb
    .select()
    .from(schema.refunds)
    .where(eq(schema.refunds.id, refund.id))
    .get()!;
}

describe("refund review", () => {
  beforeEach(() => {
    testDb = createTestDb();
    seedRefundRequest();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  describe("listOpenRefundRequests", () => {
    it("lists a request that is under review, with what the admin needs", () => {
      const [row] = listOpenRefundRequests(asDb());

      expect(row).toMatchObject({
        id: refund.id,
        amountPaid: 4900,
        learnerName: "Test User",
        courseTitle: "Test Course",
        reason: "It was not what I expected.",
        seatCount: 0,
      });
    });

    it("leaves out requests that have been decided", () => {
      declineRefundRequest(asDb(), refund.id, admin.id);

      expect(listOpenRefundRequests(asDb())).toEqual([]);
    });
  });

  describe("approveRefundRequest", () => {
    it("sends the full amount paid back, records it, and ends access", async () => {
      const pay = vi.fn(async () => ({ ok: true as const }));

      const result = await approveRefundRequest(asDb(), refund.id, admin.id, pay);

      expect(result.ok).toBe(true);
      expect(pay).toHaveBeenCalledWith(
        expect.objectContaining({ id: purchase.id }),
        4900
      );
      expect(getRefund()).toMatchObject({
        status: schema.RefundStatus.Approved,
        amountRefunded: 4900,
        resolvedByUserId: admin.id,
      });
      expect(getRefund().resolvedAt).not.toBeNull();
      expect(enrollmentCount()).toBe(0);
    });

    it("keeps the learner's progress", async () => {
      const lesson = seedLesson();
      testDb
        .insert(schema.lessonProgress)
        .values({
          userId: base.user.id,
          lessonId: lesson.id,
          status: schema.LessonProgressStatus.Completed,
        })
        .run();

      await approveRefundRequest(asDb(), refund.id, admin.id, async () => ({
        ok: true,
      }));

      expect(testDb.select().from(schema.lessonProgress).all()).toHaveLength(1);
    });

    it("leaves the request open and access intact when the payment fails", async () => {
      const result = await approveRefundRequest(
        asDb(),
        refund.id,
        admin.id,
        async () => ({ ok: false, message: "card network down" })
      );

      expect(result).toMatchObject({ ok: false, status: 502 });
      expect(getRefund().status).toBe(schema.RefundStatus.Requested);
      expect(getRefund().amountRefunded).toBeNull();
      expect(enrollmentCount()).toBe(1);
    });

    it("refuses a purchase that has team seats, without moving any money", async () => {
      const team = testDb.insert(schema.teams).values({}).returning().get();
      testDb
        .insert(schema.coupons)
        .values({
          teamId: team.id,
          courseId: base.course.id,
          code: "SEAT-1",
          purchaseId: purchase.id,
        })
        .run();
      const pay = vi.fn(async () => ({ ok: true as const }));

      const result = await approveRefundRequest(asDb(), refund.id, admin.id, pay);

      expect(result).toMatchObject({ ok: false, status: 409 });
      expect(pay).not.toHaveBeenCalled();
      expect(getRefund().status).toBe(schema.RefundStatus.Requested);
    });

    it("refuses a request that was already decided, without paying twice", async () => {
      const pay = vi.fn(async () => ({ ok: true as const }));
      await approveRefundRequest(asDb(), refund.id, admin.id, pay);

      const again = await approveRefundRequest(asDb(), refund.id, admin.id, pay);

      expect(again).toMatchObject({ ok: false, status: 409 });
      expect(pay).toHaveBeenCalledTimes(1);
    });

    it("reports a request that does not exist", async () => {
      const result = await approveRefundRequest(asDb(), 9999, admin.id);

      expect(result).toMatchObject({ ok: false, status: 404 });
    });
  });

  describe("declineRefundRequest", () => {
    it("marks it declined, refunds nothing, and leaves access alone", () => {
      const result = declineRefundRequest(asDb(), refund.id, admin.id);

      expect(result.ok).toBe(true);
      expect(getRefund()).toMatchObject({
        status: schema.RefundStatus.Declined,
        amountRefunded: null,
        resolvedByUserId: admin.id,
      });
      expect(enrollmentCount()).toBe(1);
    });

    it("refuses a request that was already decided", () => {
      declineRefundRequest(asDb(), refund.id, admin.id);

      expect(declineRefundRequest(asDb(), refund.id, admin.id)).toMatchObject({
        ok: false,
        status: 409,
      });
    });
  });
});

function seedLesson() {
  const mod = testDb
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Intro", position: 1 })
    .returning()
    .get();

  return testDb
    .insert(schema.lessons)
    .values({ moduleId: mod.id, title: "Hello", position: 1 })
    .returning()
    .get();
}
