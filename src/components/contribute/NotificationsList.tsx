import React from 'react';
import { Bell, Circle } from 'lucide-react';
import { Notification } from '../../types';
import { notificationService } from '../../services/notificationService';

interface NotificationsListProps {
  notifications: Notification[];
  onMarkedRead: () => void;
}

/** Simple in-app read/unread list -- per the brief, no push notifications or anything more elaborate for this stage. Created only by the admin review action (server.ts's review route); this component only ever reads and marks-read, never creates one. */
export default function NotificationsList({ notifications, onMarkedRead }: NotificationsListProps) {
  if (notifications.length === 0) {
    return <p className="text-xs text-zinc-600">No notifications yet.</p>;
  }

  const handleClick = async (n: Notification) => {
    if (n.read) return;
    try {
      await notificationService.markAsRead(n.id);
      onMarkedRead();
    } catch {
      // Non-fatal -- the notification stays unread and can be retried; no need to surface an error for a read-state toggle.
    }
  };

  return (
    <div className="space-y-2">
      {notifications.map((n) => (
        <button
          key={n.id}
          onClick={() => handleClick(n)}
          className={`w-full text-left flex items-start gap-3 p-4 border transition-colors ${
            n.read ? 'border-white/5 bg-transparent text-zinc-500' : 'border-reserve-accent/20 bg-reserve-accent/5 text-white'
          }`}
        >
          {n.read ? <Bell size={14} className="mt-0.5 shrink-0" /> : <Circle size={8} className="mt-1.5 shrink-0 fill-reserve-accent text-reserve-accent" />}
          <div>
            <p className="text-xs leading-relaxed">{n.message}</p>
            <p className="text-[9px] uppercase tracking-widest text-zinc-600 mt-1">{new Date(n.createdAt).toLocaleString()}</p>
          </div>
        </button>
      ))}
    </div>
  );
}
