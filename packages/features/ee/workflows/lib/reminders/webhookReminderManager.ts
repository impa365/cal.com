import dayjs from "@calcom/dayjs";
import logger from "@calcom/lib/logger";
import prisma from "@calcom/prisma";
import { WorkflowMethods, WorkflowTriggerEvents } from "@calcom/prisma/enums";

import { IMMEDIATE_WORKFLOW_TRIGGER_EVENTS } from "../constants";
import type { BookingInfo } from "../types";
import type { VariablesType } from "./templates/customTemplate";
import customTemplate from "./templates/customTemplate";

const log = logger.getSubLogger({ prefix: ["[webhookReminderManager]"] });

export type ScheduleWebhookReminderArgs = {
  evt: BookingInfo;
  triggerEvent: WorkflowTriggerEvents;
  action: "WEBHOOK";
  timeSpan: {
    time: number | null;
    timeUnit: string | null;
  };
  webhookUrl: string;
  message?: string; // JSON template or empty for default payload
  workflowStepId: number;
  seatReferenceUid?: string;
  userId?: number | null;
  teamId?: number | null;
};

interface WebhookPayload {
  triggerEvent: string;
  createdAt: string;
  payload: {
    bookingId?: number;
    uid: string;
    title: string;
    type: string;
    startTime: string;
    endTime: string;
    organizer: {
      name: string;
      email: string;
      timeZone: string;
    };
    attendees: Array<{
      name: string;
      email: string;
      timeZone: string;
    }>;
    location?: string | null;
    additionalNotes?: string | null;
    customInputs?: Record<string, unknown>;
    responses?: Record<string, unknown>;
    meetingUrl?: string;
    cancelUrl?: string;
    rescheduleUrl?: string;
    [key: string]: unknown;
  };
}

/**
 * Build the default webhook payload similar to BOOKING_CREATED webhook
 */
function buildDefaultWebhookPayload(evt: BookingInfo, triggerEvent: WorkflowTriggerEvents): WebhookPayload {
  const metadata = evt.metadata as Record<string, unknown> | undefined;
  const videoCallUrl = (metadata?.videoCallUrl as string) || evt.videoCallData?.url;

  return {
    triggerEvent: triggerEvent,
    createdAt: new Date().toISOString(),
    payload: {
      uid: evt.uid || "",
      title: evt.title || "",
      type: evt.eventType?.slug || evt.title || "",
      startTime: evt.startTime || "",
      endTime: evt.endTime || "",
      organizer: {
        name: evt.organizer?.name || "",
        email: evt.organizer?.email || "",
        timeZone: evt.organizer?.timeZone || "",
      },
      attendees:
        evt.attendees?.map((a) => ({
          name: a.name || "",
          email: a.email || "",
          timeZone: a.timeZone || "",
        })) || [],
      location: evt.location,
      additionalNotes: evt.additionalNotes,
      responses: (evt.responses as Record<string, unknown>) || undefined,
      meetingUrl: videoCallUrl || undefined,
    },
  };
}

/**
 * Build custom webhook payload from template with variable substitution
 */
async function buildCustomWebhookPayload(
  template: string,
  evt: BookingInfo,
  triggerEvent: WorkflowTriggerEvents
): Promise<Record<string, unknown>> {
  const attendee = evt.attendees?.[0];
  const startTime = dayjs(evt.startTime);
  const endTime = dayjs(evt.endTime);
  const timeZone = evt.organizer?.timeZone || "UTC";
  const metadata = evt.metadata as Record<string, unknown> | undefined;
  const videoCallUrl = (metadata?.videoCallUrl as string) || evt.videoCallData?.url;

  const variables: VariablesType = {
    eventName: evt.title,
    organizerName: evt.organizer?.name,
    attendeeName: attendee?.name,
    attendeeEmail: attendee?.email,
    eventDate: startTime.tz(timeZone),
    eventEndTime: endTime.tz(timeZone),
    timeZone: timeZone,
    location: evt.location,
    additionalNotes: evt.additionalNotes,
    meetingUrl: videoCallUrl,
    attendeeTimezone: attendee?.timeZone,
  };

  // Process the template with variable substitution
  const { text } = customTemplate(template, variables, attendee?.language?.locale || "en");

  try {
    return JSON.parse(text);
  } catch {
    // If parsing fails, wrap in a simple object
    return { message: text, triggerEvent };
  }
}

/**
 * Send webhook immediately
 */
export async function sendWebhook(args: {
  webhookUrl: string;
  payload: WebhookPayload | Record<string, unknown>;
  workflowStepId: number;
}): Promise<{ ok: boolean; status: number; message?: string }> {
  const { webhookUrl, payload, workflowStepId } = args;

  try {
    log.debug(`Sending webhook to ${webhookUrl}`, { workflowStepId });

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Cal.com-Workflow-Webhook/1.0",
      },
      body: JSON.stringify(payload),
    });

    const ok = response.ok;
    const status = response.status;

    if (!ok) {
      log.error(`Webhook failed with status ${status}`, { webhookUrl, workflowStepId });
    } else {
      log.debug(`Webhook sent successfully`, { webhookUrl, status, workflowStepId });
    }

    return { ok, status };
  } catch (error) {
    log.error(`Webhook error`, { webhookUrl, error, workflowStepId });
    return { ok: false, status: 0, message: String(error) };
  }
}

/**
 * Schedule or send webhook reminder
 */
export async function scheduleWebhookReminder(args: ScheduleWebhookReminderArgs): Promise<void> {
  const {
    evt,
    triggerEvent,
    timeSpan,
    webhookUrl,
    message,
    workflowStepId,
  } = args;

  if (!webhookUrl) {
    log.warn(`No webhook URL provided for workflow step ${workflowStepId}`);
    return;
  }

  const { startTime, endTime } = evt;
  const uid = evt.uid as string;
  const currentDate = dayjs();
  const timeUnit = timeSpan.timeUnit?.toLowerCase() as "day" | "hour" | "minute" | undefined;

  // Build the payload
  const payload: WebhookPayload | Record<string, unknown> = message
    ? await buildCustomWebhookPayload(message, evt, triggerEvent)
    : buildDefaultWebhookPayload(evt, triggerEvent);

  // For immediate triggers, send right away
  if (IMMEDIATE_WORKFLOW_TRIGGER_EVENTS.includes(triggerEvent)) {
    await sendWebhook({ webhookUrl, payload, workflowStepId });
    return;
  }

  // Calculate scheduled date for BEFORE_EVENT or AFTER_EVENT
  let scheduledDate: Date | null = null;

  if (triggerEvent === WorkflowTriggerEvents.BEFORE_EVENT && timeUnit && timeSpan.time) {
    scheduledDate = dayjs(startTime).subtract(timeSpan.time, timeUnit).toDate();
  } else if (triggerEvent === WorkflowTriggerEvents.AFTER_EVENT && timeUnit && timeSpan.time) {
    scheduledDate = dayjs(endTime).add(timeSpan.time, timeUnit).toDate();
  }

  // If scheduled date is in the past or immediate, send now
  if (!scheduledDate || dayjs(scheduledDate).isBefore(currentDate)) {
    await sendWebhook({ webhookUrl, payload, workflowStepId });
    return;
  }

  // Create workflow reminder for scheduled sending
  // The reminder will be picked up by the cron job
  await prisma.workflowReminder.create({
    data: {
      bookingUid: uid,
      workflowStepId,
      method: WorkflowMethods.WEBHOOK,
      scheduledDate,
      scheduled: true,
    },
  });

  log.debug(`Webhook reminder scheduled for ${scheduledDate.toISOString()}`, {
    workflowStepId,
  });
}
