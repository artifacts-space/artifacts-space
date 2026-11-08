"use client";

import { toast } from "sonner";

import { setNotificationPreferenceAction } from "@/app/(workspace)/app/notification-actions";
import { Switch } from "@/components/ui/switch";
import { changePreference, emailAvailable, type NotificationPreferences } from "@/lib/notifications/preference-rules";
import { notificationEvents, type NotificationChannel, type NotificationEvent } from "@/lib/notifications/types";

const eventCopy: Record<NotificationEvent, { title: string; description: string }> = {
  mention: { title: "Mentions", description: "Someone @mentions you in a comment." },
  reply: { title: "Replies", description: "Someone replies to your comment." },
  comment: { title: "Comments on your artifacts", description: "Someone comments on an artifact you or your agents wrote." },
  share_request: { title: "Requests to approve", description: "A teammate or agent asks to share, and you are an owner or admin." },
  share_decision: { title: "Your requests", description: "An owner or admin approves or declines your request." },
};

const channelLabels: Record<NotificationChannel, string> = { inApp: "In app", browser: "Browser", email: "Email" };

interface NotificationSettingsProps {
  preferences: NotificationPreferences;
  onPreferences: (preferences: NotificationPreferences) => void;
  /** The channels to offer. Browser shows only when browser notifications are set up. */
  channels?: readonly NotificationChannel[];
}

function ChoiceCell({ event, channel, preferences, onChange }: { event: NotificationEvent; channel: NotificationChannel; preferences: NotificationPreferences; onChange: (event: NotificationEvent, channel: NotificationChannel, on: boolean) => void }) {
  if (channel === "email" && !emailAvailable(event)) {
    return <span className="text-sm text-muted-foreground" title="No email for this">–</span>;
  }
  return (
    <Switch
      checked={preferences[event][channel]}
      onCheckedChange={(on) => { onChange(event, channel, on); }}
      aria-label={`${channelLabels[channel]}: ${eventCopy[event].title}`}
    />
  );
}

/**
 * Per event, where it reaches the person: in the app (the bell), in the
 * browser, and by email (mentions only). Each switch saves at once.
 */
export function NotificationSettings({ preferences, onPreferences: setPreferences, channels = ["inApp", "email"] }: NotificationSettingsProps) {
  const columns = { gridTemplateColumns: `minmax(0, 1fr) repeat(${String(channels.length)}, 4.5rem)` };

  async function change(event: NotificationEvent, channel: NotificationChannel, on: boolean) {
    const before = preferences;
    setPreferences(changePreference(preferences, event, channel, on));
    try {
      const result = await setNotificationPreferenceAction({ event, channel, on });
      if (result.success) {
        setPreferences(result.data);
        return;
      }
      setPreferences(before);
      toast.error(result.error);
    } catch {
      setPreferences(before);
      toast.error("Something went wrong. Check your connection and try again.");
    }
  }

  return (
    <div role="table" aria-label="Notification settings">
      <div role="row" className="grid items-center gap-3 border-b px-5 py-2 text-xs text-muted-foreground" style={columns}>
        <span role="columnheader">Event</span>
        {channels.map((channel) => <span key={channel} role="columnheader" className="text-center">{channelLabels[channel]}</span>)}
      </div>
      {notificationEvents.map((event) => (
        <div key={event} role="row" className="grid items-center gap-3 border-b px-5 py-3 last:border-b-0" style={columns}>
          <div role="rowheader" className="min-w-0">
            <p className="text-md">{eventCopy[event].title}</p>
            <p className="text-sm text-muted-foreground">{eventCopy[event].description}</p>
          </div>
          {channels.map((channel) => (
            <div key={channel} role="cell" className="flex justify-center">
              <ChoiceCell event={event} channel={channel} preferences={preferences} onChange={(...args) => void change(...args)} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
