import { useEffect } from "react";
import { data, isRouteErrorResponse, Link, useFetcher } from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import { AlertTriangle, Receipt } from "lucide-react";
import type { Route } from "./+types/admin.refunds";
import { db } from "~/db";
import { requireAdmin } from "~/lib/access.server";
import {
  approveRefundRequest,
  declineRefundRequest,
  listOpenRefundRequests,
} from "~/lib/refund-review.server";
import { parseFormData } from "~/lib/validation";
import { formatPrice } from "~/lib/utils";
import { Card, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";

const refundReviewActionSchema = z.object({
  intent: z.enum(["approve", "decline"]),
  refundId: z.coerce.number().int(),
});

export function meta() {
  return [
    { title: "Refund Requests — Cadence" },
    { name: "description", content: "Review refund requests" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);

  return { requests: listOpenRefundRequests(db) };
}

export async function action({ request }: Route.ActionArgs) {
  const { userId } = await requireAdmin(request);

  const formData = await request.formData();
  const parsed = parseFormData(formData, refundReviewActionSchema);

  if (!parsed.success) {
    return data({ error: "Invalid input." }, { status: 400 });
  }

  const { intent, refundId } = parsed.data;

  const result =
    intent === "approve"
      ? await approveRefundRequest(db, refundId, userId)
      : declineRefundRequest(db, refundId, userId);

  if (!result.ok) {
    return data({ error: result.message }, { status: result.status });
  }

  return { success: true, message: result.message };
}

type OpenRequest = Route.ComponentProps["loaderData"]["requests"][number];

function RequestCard({ request }: { request: OpenRequest }) {
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";
  const hasSeats = request.seatCount > 0;

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if ("success" in fetcher.data) toast.success(fetcher.data.message);
    if ("error" in fetcher.data) toast.error(fetcher.data.error);
  }, [fetcher.state, fetcher.data]);

  function submit(intent: "approve" | "decline") {
    fetcher.submit(
      { intent, refundId: String(request.id) },
      { method: "post" }
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link
              to={`/courses/${request.courseSlug}`}
              className="font-medium hover:underline"
            >
              {request.courseTitle}
            </Link>
            <p className="text-sm text-muted-foreground">
              {request.learnerName} · {request.learnerEmail}
            </p>
          </div>
          <div className="text-right">
            <p className="font-medium">{formatPrice(request.amountPaid)}</p>
            <p className="text-xs text-muted-foreground">
              bought {new Date(request.purchasedAt).toLocaleDateString()} ·
              requested {new Date(request.requestedAt).toLocaleDateString()}
            </p>
          </div>
        </div>

        <p className="rounded-md bg-muted/50 p-3 text-sm">{request.reason}</p>

        {hasSeats && (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            This purchase includes team seats, so it can only be declined here.
          </p>
        )}

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => submit("approve")}
            disabled={busy || hasSeats}
          >
            Approve and refund {formatPrice(request.amountPaid)}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => submit("decline")}
            disabled={busy}
          >
            Decline
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminRefunds({ loaderData }: Route.ComponentProps) {
  const { requests } = loaderData;

  return (
    <div className="mx-auto max-w-4xl p-6 lg:p-8">
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Refund Requests</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">Refund Requests</h1>
        <p className="mt-1 text-muted-foreground">
          Approving sends the full amount paid back and ends the learner's
          access. Their progress is kept. Declining changes nothing for them.
        </p>
      </div>

      <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Receipt className="size-4" />
        <span>
          {requests.length} {requests.length === 1 ? "request" : "requests"}{" "}
          under review
        </span>
      </div>

      {requests.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Receipt className="mx-auto mb-3 size-8 text-muted-foreground/50" />
            <p className="text-muted-foreground">
              No refund requests are waiting.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => (
            <RequestCard key={request.id} request={request} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred while loading refund requests.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 401) {
      title = "Sign in required";
      message =
        typeof error.data === "string"
          ? error.data
          : "Please select a user from the DevUI panel.";
    } else if (error.status === 403) {
      title = "Access denied";
      message =
        typeof error.data === "string"
          ? error.data
          : "Only admins can access this page.";
    } else {
      title = `Error ${error.status}`;
      message =
        typeof error.data === "string" ? error.data : error.statusText;
    }
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <Link to="/">
          <Button>Go Home</Button>
        </Link>
      </div>
    </div>
  );
}
