// PROTOTYPE: throwaway. Answers wayfinder ticket "What does the Notification Feed look like in Cadence?".
// Three variants of the Notification Feed, hosted in the existing app layout, switched via `?variant=`.
// All data is fake and in memory; nothing is persisted or read from the DB. Delete me after the ticket resolves.
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Check,
  Receipt,
  UserPlus,
  MessageSquare,
  Reply,
  GraduationCap,
  X,
} from "lucide-react";
import { cn } from "~/lib/utils";

type Category =
  | "refund-decided"
  | "refund-opened"
  | "seat-claimed"
  | "enrollment"
  | "question"
  | "reply";

interface FakeNotification {
  id: number;
  category: Category;
  text: string;
  detail: string;
  ago: string;
  day: "Today" | "Earlier";
  to: string;
}

const NOTIFICATIONS: FakeNotification[] = [
  { id: 1, category: "refund-decided", text: "Your refund request was approved", detail: "Introduction to TypeScript · $79", ago: "4m", day: "Today", to: "/dashboard" },
  { id: 2, category: "reply", text: "Maya replied to your question", detail: "“Why does the generic default fail?” · Advanced Types", ago: "22m", day: "Today", to: "/courses" },
  { id: 3, category: "refund-opened", text: "New refund request to review", detail: "Liam · React Fundamentals · $30", ago: "1h", day: "Today", to: "/admin/refunds" },
  { id: 4, category: "enrollment", text: "Sam enrolled in your course", detail: "Node.js Deep Dive", ago: "3h", day: "Today", to: "/instructor/analytics" },
  { id: 5, category: "question", text: "New question on a lesson", detail: "“Is the loader typed?” · Lesson 4, Routing", ago: "5h", day: "Today", to: "/instructor/questions" },
  { id: 6, category: "seat-claimed", text: "A seat on your team was claimed", detail: "priya@acme.dev · 4 of 10 seats used", ago: "Mon", day: "Earlier", to: "/team" },
  { id: 7, category: "refund-decided", text: "Your refund request was declined", detail: "Design Systems 101 · $59", ago: "Sun", day: "Earlier", to: "/dashboard" },
  { id: 8, category: "enrollment", text: "Ana enrolled in your course", detail: "Node.js Deep Dive", ago: "Sat", day: "Earlier", to: "/instructor/analytics" },
];

const ICONS: Record<Category, React.ReactNode> = {
  "refund-decided": <Receipt className="size-4" />,
  "refund-opened": <Receipt className="size-4" />,
  "seat-claimed": <UserPlus className="size-4" />,
  enrollment: <GraduationCap className="size-4" />,
  question: <MessageSquare className="size-4" />,
  reply: <Reply className="size-4" />,
};

// Shared fake state: `seen` clears the count, `read` clears the row emphasis.
function useFakeFeed() {
  const [seen, setSeen] = useState<Set<number>>(new Set());
  const [read, setRead] = useState<Set<number>>(new Set([7, 8]));
  const unseen = NOTIFICATIONS.filter((n) => !seen.has(n.id) && !read.has(n.id)).length;
  const unread = NOTIFICATIONS.filter((n) => !read.has(n.id)).length;
  return {
    seen,
    read,
    unseen,
    unread,
    markAllSeen: () => setSeen(new Set(NOTIFICATIONS.map((n) => n.id))),
    markRead: (id: number) => setRead((r) => new Set(r).add(id)),
    markAllRead: () => setRead(new Set(NOTIFICATIONS.map((n) => n.id))),
    reset: () => {
      setSeen(new Set());
      setRead(new Set([7, 8]));
    },
  };
}

type Feed = ReturnType<typeof useFakeFeed>;

function Badge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
      {count > 9 ? "9+" : count}
    </span>
  );
}

function Row({ n, feed, compact }: { n: FakeNotification; feed: Feed; compact?: boolean }) {
  const navigate = useNavigate();
  const isRead = feed.read.has(n.id);
  return (
    <button
      onClick={() => {
        feed.markRead(n.id);
        navigate(n.to);
      }}
      className={cn(
        "flex w-full items-start gap-3 rounded-md px-3 text-left transition-colors hover:bg-accent",
        compact ? "py-2" : "py-3"
      )}
    >
      <span className={cn("mt-0.5 shrink-0", isRead ? "text-muted-foreground" : "text-primary")}>
        {ICONS[n.category]}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-sm", isRead ? "text-muted-foreground" : "font-semibold")}>
          {n.text}
        </span>
        <span className="block truncate text-xs text-muted-foreground">{n.detail}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-xs text-muted-foreground">{n.ago}</span>
        {!isRead && <span className="size-2 rounded-full bg-primary" />}
      </span>
    </button>
  );
}

// Variant A: bell in a top bar above the page; popover with the latest items, no dedicated page.
function VariantA({ feed, children }: { feed: Feed; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="relative flex h-14 items-center justify-end border-b px-6">
        <button
          onClick={() => {
            setOpen((o) => !o);
            feed.markAllSeen();
          }}
          className="relative rounded-md p-2 hover:bg-accent"
          title="Notifications"
        >
          <Bell className="size-5" />
          <Badge count={feed.unseen} />
        </button>
        {open && (
          <div className="absolute right-6 top-12 z-40 w-96 rounded-lg border bg-popover text-popover-foreground shadow-lg">
            <div className="flex items-center justify-between border-b px-4 py-2">
              <span className="text-sm font-semibold">Notifications</span>
              <button onClick={feed.markAllRead} className="text-xs text-primary hover:underline">
                Mark all as read
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto p-1">
              {NOTIFICATIONS.slice(0, 6).map((n) => (
                <Row key={n.id} n={n} feed={feed} compact />
              ))}
            </div>
            <div className="border-t px-4 py-2 text-center text-xs text-muted-foreground">
              Latest 6 only. No history page.
            </div>
          </div>
        )}
      </div>
      {children}
    </>
  );
}

// Variant B: dedicated page only. A "Notifications" page replaces the content; unseen count lives on a sidebar-style link.
function VariantB({ feed }: { feed: Feed }) {
  const [tab, setTab] = useState<"all" | "unread">("all");
  useEffect(() => {
    feed.markAllSeen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const items = NOTIFICATIONS.filter((n) => tab === "all" || !feed.read.has(n.id));
  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            {feed.unread} unread · the unseen count on the sidebar link cleared when you opened this page
          </p>
        </div>
        <button onClick={feed.markAllRead} className="text-sm text-primary hover:underline">
          Mark all as read
        </button>
      </div>
      <div className="mb-4 flex gap-1 border-b">
        {(["all", "unread"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium capitalize",
              tab === t ? "border-primary" : "border-transparent text-muted-foreground"
            )}
          >
            {t}
          </button>
        ))}
      </div>
      {items.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">You're all caught up.</p>
      )}
      {(["Today", "Earlier"] as const).map((day) => {
        const group = items.filter((n) => n.day === day);
        if (group.length === 0) return null;
        return (
          <section key={day} className="mb-4">
            <h2 className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {day}
            </h2>
            <div className="rounded-lg border">
              {group.map((n) => (
                <Row key={n.id} n={n} feed={feed} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// Variant C: both. Bell opens a right-hand drawer over the page; the drawer footer links to the full history page.
function VariantC({ feed, children }: { feed: Feed; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          feed.markAllSeen();
        }}
        className="fixed right-6 top-4 z-30 rounded-full border bg-background p-2 shadow-sm hover:bg-accent"
        title="Notifications"
      >
        <Bell className="size-5" />
        <Badge count={feed.unseen} />
      </button>
      {children}
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setOpen(false)} />
          <aside className="fixed inset-y-0 right-0 z-50 flex w-96 flex-col border-l bg-background shadow-xl">
            <div className="flex h-14 items-center justify-between border-b px-4">
              <span className="font-semibold">Notifications</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={feed.markAllRead}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Check className="size-3" /> Mark all read
                </button>
                <button onClick={() => setOpen(false)} className="rounded p-1 hover:bg-accent">
                  <X className="size-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {NOTIFICATIONS.map((n) => (
                <Row key={n.id} n={n} feed={feed} compact />
              ))}
            </div>
            <div className="border-t p-3 text-center text-xs text-muted-foreground">
              Drawer shows everything, newest first. No separate page.
            </div>
          </aside>
        </>
      )}
    </>
  );
}

const VARIANTS = [
  { key: "A", name: "Bell popover, latest only" },
  { key: "B", name: "Dedicated page" },
  { key: "C", name: "Bell opens a drawer" },
];

function PrototypeSwitcher({ current, onReset }: { current: string; onReset: () => void }) {
  const [params, setParams] = useSearchParams();
  const index = Math.max(0, VARIANTS.findIndex((v) => v.key === current));

  function go(delta: number) {
    const next = VARIANTS[(index + delta + VARIANTS.length) % VARIANTS.length];
    setParams({ variant: next.key }, { replace: true });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  void params;
  return (
    <div className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-full bg-zinc-900 px-4 py-2 text-sm text-white shadow-xl">
      <button onClick={() => go(-1)} aria-label="Previous variant">
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-52 text-center">
        {VARIANTS[index].key} ({VARIANTS[index].name})
      </span>
      <button onClick={() => go(1)} aria-label="Next variant">
        <ChevronRight className="size-4" />
      </button>
      <button onClick={onReset} className="ml-2 border-l border-white/30 pl-3 text-xs text-white/70 hover:text-white">
        reset
      </button>
    </div>
  );
}

// Wraps the app's <Outlet/>; hidden in production builds.
export function PrototypeNotificationFeed({ children }: { children: React.ReactNode }) {
  const [params] = useSearchParams();
  const feed = useFakeFeed();
  if (process.env.NODE_ENV === "production") return <>{children}</>;

  const variant = params.get("variant") ?? "A";
  return (
    <>
      {variant === "A" && <VariantA feed={feed}>{children}</VariantA>}
      {variant === "B" && (
        <>
          <div className="flex h-14 items-center justify-end gap-2 border-b px-6 text-sm">
            <span className="relative rounded-md px-3 py-1.5 font-medium">
              Notifications
              <Badge count={feed.unseen} />
            </span>
            <span className="text-xs text-muted-foreground">(a sidebar link in the real app)</span>
          </div>
          <VariantB feed={feed} />
        </>
      )}
      {variant === "C" && <VariantC feed={feed}>{children}</VariantC>}
      <PrototypeSwitcher current={variant} onReset={feed.reset} />
    </>
  );
}
