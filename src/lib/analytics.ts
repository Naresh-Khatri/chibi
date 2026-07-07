declare global {
  interface Window {
    umami?: {
      track: (
        eventName: string,
        data?: Record<string, string | number | boolean>,
      ) => void;
    };
  }
}

/** KPI events tracked via Umami — keep this the single source of truth for event names. */
export type AnalyticsEvent =
  | "scene_created"
  | "scene_generated"
  | "scene_generation_failed"
  | "scene_exported"
  | "ai_chat_message_sent";

export function track(
  event: AnalyticsEvent,
  data?: Record<string, string | number | boolean>,
) {
  if (typeof window === "undefined") return;
  window.umami?.track(event, data);
}
