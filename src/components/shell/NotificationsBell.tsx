import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Bell, Check, CheckCheck, AlertCircle, CheckCircle2, Info, Sparkles, Trash2, X } from "lucide-react";
import { useMemo } from "react";
import { useAppStore, type Notification, type NotificationKind } from "@/store/appStore";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn, timeAgo } from "@/lib/utils";

export default function NotificationsBell() {
  const notifications = useAppStore((s) => s.notifications);
  const navigate = useAppStore((s) => s.navigate);
  const markRead = useAppStore((s) => s.markNotificationRead);
  const markAllRead = useAppStore((s) => s.markAllNotificationsRead);
  const remove = useAppStore((s) => s.removeNotification);
  const clearAll = useAppStore((s) => s.clearNotifications);

  const unread = useMemo(() => notifications.filter((n) => !n.readAt).length, [notifications]);
  const grouped = useMemo(() => groupByDay(notifications), [notifications]);

  function onActivate(n: Notification) {
    if (!n.readAt) markRead(n.id);
    if (n.route) navigate(n.route);
  }

  return (
    <DropdownMenu.Root>
      <Tooltip content={unread > 0 ? `${unread} unread` : "Notifications"} side="bottom">
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label="Notifications"
            className={cn(
              "no-drag relative h-8 w-8 rounded-lg inline-flex items-center justify-center transition outline-none",
              "text-text-secondary hover:text-text-primary hover:bg-white/[0.06]",
              "data-[state=open]:bg-white/[0.08] data-[state=open]:text-text-primary",
              "focus-visible:ring-2 focus-visible:ring-accent-blue/50",
            )}
          >
            <Bell size={15} />
            {unread > 0 && (
              <span className="absolute top-1 right-1 min-w-[14px] h-[14px] px-1 rounded-full bg-accent-red text-white text-[9px] font-semibold flex items-center justify-center border border-bg-panel leading-none">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>
        </DropdownMenu.Trigger>
      </Tooltip>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="bottom"
          align="end"
          sideOffset={8}
          className={cn(
            "z-[150] w-[360px] rounded-xl border border-border bg-bg-panel/95 backdrop-blur-xl",
            "shadow-elev outline-none overflow-hidden",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          )}
        >
          {/* header */}
          <div className="flex items-center justify-between gap-2 px-3 h-11 border-b border-border">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[13px] font-semibold text-text-primary whitespace-nowrap">Notifications</span>
              {unread > 0 && (
                <span className="shrink-0 text-[10px] font-semibold text-accent-blue bg-accent-blue/10 border border-accent-blue/25 rounded-full px-1.5 leading-[18px] h-[18px] inline-flex items-center">
                  {unread}
                </span>
              )}
            </div>
            {notifications.length > 0 && (
              <div className="flex items-center gap-0.5 shrink-0">
                {unread > 0 && (
                  <HeaderAction
                    icon={<CheckCheck size={13} />}
                    label="Mark all as read"
                    onClick={markAllRead}
                  />
                )}
                <HeaderAction
                  icon={<Trash2 size={13} />}
                  label="Clear all"
                  onClick={clearAll}
                  tone="danger"
                />
              </div>
            )}
          </div>

          {/* body */}
          <div className="max-h-[420px] overflow-y-auto">
            {notifications.length === 0 ? (
              <EmptyState />
            ) : (
              grouped.map(({ label, items }) => (
                <div key={label} className="py-1">
                  <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                    {label}
                  </div>
                  {items.map((n) => (
                    <NotificationRow
                      key={n.id}
                      notification={n}
                      onActivate={() => onActivate(n)}
                      onDismiss={() => remove(n.id)}
                    />
                  ))}
                </div>
              ))
            )}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function NotificationRow({
  notification, onActivate, onDismiss,
}: {
  notification: Notification;
  onActivate: () => void;
  onDismiss: () => void;
}) {
  const unread = !notification.readAt;
  return (
    <DropdownMenu.Item
      onSelect={(e) => { e.preventDefault(); onActivate(); }}
      className={cn(
        "group relative px-3 py-2.5 flex items-start gap-3 cursor-default outline-none transition",
        "data-[highlighted]:bg-white/[0.04]",
      )}
    >
      <KindIcon kind={notification.kind} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn("text-[12.5px] truncate", unread ? "font-semibold text-text-primary" : "text-text-secondary")}>
            {notification.title}
          </span>
          {unread && <span className="w-1.5 h-1.5 rounded-full bg-accent-blue shrink-0" />}
        </div>
        {notification.body && (
          <div className="text-[11px] text-text-secondary mt-0.5 line-clamp-2">{notification.body}</div>
        )}
        <div className="text-[10px] text-text-muted mt-1">{timeAgo(notification.createdAt)}</div>
      </div>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        className="opacity-0 group-hover:opacity-100 group-data-[highlighted]:opacity-100 shrink-0 -mr-1 mt-0.5 text-text-muted hover:text-text-primary transition"
        aria-label="Dismiss notification"
      >
        <X size={12} />
      </button>
    </DropdownMenu.Item>
  );
}

function KindIcon({ kind }: { kind: NotificationKind }) {
  const map: Record<NotificationKind, { icon: React.ReactNode; cls: string }> = {
    success: { icon: <CheckCircle2 size={14} />, cls: "bg-accent-green/15 text-accent-green border-accent-green/30" },
    error:   { icon: <AlertCircle size={14} />,  cls: "bg-accent-red/15 text-accent-red border-accent-red/30" },
    info:    { icon: <Info size={14} />,         cls: "bg-accent-blue/15 text-accent-blue border-accent-blue/30" },
    update:  { icon: <Sparkles size={14} />,     cls: "bg-accent-violet/15 text-accent-violet border-accent-violet/30" },
  };
  const { icon, cls } = map[kind];
  return (
    <div className={cn("w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 mt-0.5", cls)}>
      {icon}
    </div>
  );
}

function HeaderAction({
  icon, label, onClick, tone,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  tone?: "danger";
}) {
  return (
    <Tooltip content={label} side="bottom">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={cn(
          "h-7 w-7 rounded-md inline-flex items-center justify-center transition shrink-0",
          tone === "danger"
            ? "text-text-muted hover:text-accent-red hover:bg-accent-red/10"
            : "text-text-secondary hover:text-text-primary hover:bg-white/[0.06]",
        )}
      >
        {icon}
      </button>
    </Tooltip>
  );
}

function EmptyState() {
  return (
    <div className="px-6 py-10 text-center">
      <div className="w-10 h-10 mx-auto rounded-xl bg-white/[0.04] border border-border flex items-center justify-center text-text-muted mb-2.5">
        <Check size={16} />
      </div>
      <div className="text-[12.5px] text-text-primary">You're all caught up</div>
      <div className="text-[11px] text-text-secondary mt-1">
        Build results and app updates will show up here.
      </div>
    </div>
  );
}

interface DayBucket { label: string; items: Notification[] }

/** Group by Today / Yesterday / older date string while preserving the
 *  newest-first order within each bucket. */
function groupByDay(list: Notification[]): DayBucket[] {
  const buckets = new Map<string, Notification[]>();
  for (const n of list) {
    const label = dayLabel(n.createdAt);
    const existing = buckets.get(label) ?? [];
    existing.push(n);
    buckets.set(label, existing);
  }
  return Array.from(buckets.entries()).map(([label, items]) => ({ label, items }));
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
}
