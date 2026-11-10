import { and, asc, eq, sql } from "drizzle-orm";
import type { db as appDb } from "~/db";
import {
  coupons,
  courses,
  enrollments,
  purchases,
  refunds,
  RefundStatus,
  users,
} from "~/db/schema";
import { formatPrice } from "~/lib/utils";

type Db = typeof appDb;

export type PaymentResult = { ok: true } | { ok: false; message: string };

/**
 * Sends the money back to the learner's original payment method. There is no
 * payment provider wired up yet, so this only logs, like the email stub below.
 * Swap the body for the real provider call; the contract stays the same.
 */
export async function refundPayment(
  purchase: { id: number; amountPaid: number },
  amount: number
): Promise<PaymentResult> {
  console.log(
    `[payment] refund purchase=${purchase.id} amount=${formatPrice(amount)}`
  );
  return { ok: true };
}

export type ResolveResult =
  | { ok: true; message: string }
  | { ok: false; status: number; message: string };

/**
 * Open requests, oldest first. `seatCount` is how many team seats hang off the
 * purchase; a purchase with any seats can't be refunded.
 */
export function listOpenRefundRequests(db: Db) {
  return db
    .select({
      id: refunds.id,
      reason: refunds.reason,
      requestedAt: refunds.requestedAt,
      amountPaid: purchases.amountPaid,
      purchasedAt: purchases.createdAt,
      learnerName: users.name,
      learnerEmail: users.email,
      courseTitle: courses.title,
      courseSlug: courses.slug,
      seatCount: sql<number>`(select count(*) from ${coupons} where ${coupons.purchaseId} = ${purchases.id})`,
    })
    .from(refunds)
    .innerJoin(purchases, eq(refunds.purchaseId, purchases.id))
    .innerJoin(users, eq(purchases.userId, users.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(eq(refunds.status, RefundStatus.Requested))
    .orderBy(asc(refunds.requestedAt))
    .all();
}

type LoadedRequest =
  | { row: null; error: Extract<ResolveResult, { ok: false }> }
  | { row: NonNullable<ReturnType<typeof selectRequest>>; error: null };

function selectRequest(db: Db, refundId: number) {
  return db
    .select({
      refund: refunds,
      purchase: purchases,
      learner: users,
      course: courses,
    })
    .from(refunds)
    .innerJoin(purchases, eq(refunds.purchaseId, purchases.id))
    .innerJoin(users, eq(purchases.userId, users.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(eq(refunds.id, refundId))
    .get();
}

function loadOpenRequest(db: Db, refundId: number): LoadedRequest {
  const row = selectRequest(db, refundId);

  if (!row) {
    return {
      row: null,
      error: { ok: false, status: 404, message: "Refund request not found." },
    } satisfies LoadedRequest;
  }

  if (row.refund.status !== RefundStatus.Requested) {
    return {
      row: null,
      error: {
        ok: false,
        status: 409,
        message: "This request has already been decided.",
      },
    } satisfies LoadedRequest;
  }

  return { row, error: null } satisfies LoadedRequest;
}

function buildOutcomeEmail(input: {
  learnerName: string;
  learnerEmail: string;
  courseTitle: string;
  amount: number;
  approved: boolean;
}) {
  const lines = input.approved
    ? [
        `Your refund request for "${input.courseTitle}" is approved.`,
        `We have sent ${formatPrice(input.amount)}, the amount you paid, back to your original payment method.`,
        "Your access to the course has ended. Your progress is kept if you buy the course again.",
      ]
    : [
        `Your refund request for "${input.courseTitle}" was declined.`,
        "Nothing has been refunded, and you keep your access and your progress.",
      ];

  return {
    to: input.learnerEmail,
    subject: `Refund ${input.approved ? "approved" : "declined"} — ${input.courseTitle}`,
    body: [
      `Hi ${input.learnerName},`,
      "",
      ...lines,
      "",
      "— The Cadence team",
    ].join("\n"),
  };
}

// There is no mail transport yet, so the built message goes to the server log.
function sendEmail(email: { to: string; subject: string; body: string }) {
  console.log(`[email] to=${email.to} subject=${email.subject}\n${email.body}`);
}

/**
 * Approves a request: sends the full amount paid back first, and only if that
 * succeeds records the approval and ends the learner's access. Progress is
 * left alone. If the payment fails the request stays open.
 *
 * Uses positional parameters (project convention).
 */
export async function approveRefundRequest(
  db: Db,
  refundId: number,
  reviewerId: number,
  pay: typeof refundPayment = refundPayment
): Promise<ResolveResult> {
  const loaded = loadOpenRequest(db, refundId);
  if (loaded.error) return loaded.error;
  const { refund, purchase, learner, course } = loaded.row;

  const seat = db
    .select({ id: coupons.id })
    .from(coupons)
    .where(eq(coupons.purchaseId, purchase.id))
    .get();

  if (seat) {
    return {
      ok: false,
      status: 409,
      message: "This purchase includes team seats, so it can't be refunded here.",
    };
  }

  const payment = await pay(purchase, purchase.amountPaid);
  if (!payment.ok) {
    return {
      ok: false,
      status: 502,
      message: `The payment could not be refunded: ${payment.message}`,
    };
  }

  const decided = db.transaction((tx) => {
    const updated = tx
      .update(refunds)
      .set({
        status: RefundStatus.Approved,
        amountRefunded: purchase.amountPaid,
        resolvedAt: new Date().toISOString(),
        resolvedByUserId: reviewerId,
      })
      .where(
        and(
          eq(refunds.id, refund.id),
          eq(refunds.status, RefundStatus.Requested)
        )
      )
      .run();

    if (updated.changes === 0) return false;

    tx.delete(enrollments)
      .where(
        and(
          eq(enrollments.userId, purchase.userId),
          eq(enrollments.courseId, purchase.courseId)
        )
      )
      .run();

    return true;
  });

  if (!decided) {
    return {
      ok: false,
      status: 409,
      message: "This request was decided by someone else while you were working.",
    };
  }

  sendEmail(
    buildOutcomeEmail({
      learnerName: learner.name,
      learnerEmail: learner.email,
      courseTitle: course.title,
      amount: purchase.amountPaid,
      approved: true,
    })
  );

  return {
    ok: true,
    message: `Refunded ${formatPrice(purchase.amountPaid)} to ${learner.name}.`,
  };
}

/**
 * Declines a request. Nothing is refunded and nothing about the learner's
 * access or progress changes.
 */
export function declineRefundRequest(
  db: Db,
  refundId: number,
  reviewerId: number
): ResolveResult {
  const loaded = loadOpenRequest(db, refundId);
  if (loaded.error) return loaded.error;
  const { refund, purchase, learner, course } = loaded.row;

  db.update(refunds)
    .set({
      status: RefundStatus.Declined,
      resolvedAt: new Date().toISOString(),
      resolvedByUserId: reviewerId,
    })
    .where(eq(refunds.id, refund.id))
    .run();

  sendEmail(
    buildOutcomeEmail({
      learnerName: learner.name,
      learnerEmail: learner.email,
      courseTitle: course.title,
      amount: purchase.amountPaid,
      approved: false,
    })
  );

  return { ok: true, message: `Declined the request from ${learner.name}.` };
}
