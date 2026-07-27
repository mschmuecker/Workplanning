import { getWeekStartIso } from "../plannerData";
import type { DayKey } from "../types";

export interface IcsEvent {
  uid: string;
  title: string;
  start: Date;
  end: Date | null;
  allDay: boolean;
  categories: string[];
}

export interface ImportCandidate {
  uid: string;
  title: string;
  day: DayKey;
  estimateHours: number;
  categories: string[];
}

// Map JS getDay() (0=Sun..6=Sat) to our weekday keys. Weekend days have no key.
const weekdayKeys: Record<number, DayKey> = {
  1: "mon",
  2: "tue",
  3: "wed",
  4: "thu",
  5: "fri",
};

// RFC5545 line unfolding: a line beginning with a space or tab is a continuation
// of the previous logical line. We join those before doing any parsing.
function unfoldLines(text: string): string[] {
  const rawLines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const lines: string[] = [];
  for (const raw of rawLines) {
    if ((raw.startsWith(" ") || raw.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += raw.slice(1);
    } else {
      lines.push(raw);
    }
  }
  return lines;
}

// Unescape RFC5545 TEXT values (used for SUMMARY): \, \; \n \\
function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

// Split a content line into its property name (before any ; params or the :)
// and its value (everything after the first unparameterized colon). Property
// params may carry a value after ";", e.g. `DTSTART;TZID=...:20260101T090000`.
function splitLine(line: string): { name: string; value: string } | null {
  const colonIndex = line.indexOf(":");
  if (colonIndex === -1) return null;
  const namePart = line.slice(0, colonIndex);
  const value = line.slice(colonIndex + 1);
  const name = namePart.split(";")[0].toUpperCase();
  return { name, value };
}

// Parse an ICS date/date-time value into a Date.
//
// Approximation note: full TZID offset math is out of scope. We handle the three
// common shapes pragmatically:
//   - VALUE=DATE or a bare 8-digit YYYYMMDD -> all-day, local midnight.
//   - trailing "Z" (e.g. 20260721T130000Z) -> parsed as UTC.
//   - otherwise (YYYYMMDDTHHMMSS, naive or carrying a TZID param) -> parsed as
//     LOCAL time; any TZID offset is intentionally ignored.
function parseIcsDate(
  value: string,
  isDateParam: boolean,
): { date: Date; allDay: boolean } | null {
  const raw = value.trim();

  // All-day: explicit VALUE=DATE param, or a bare 8-digit date.
  if (isDateParam || /^\d{8}$/.test(raw)) {
    const match = /^(\d{4})(\d{2})(\d{2})/.exec(raw);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    return { date: new Date(year, month - 1, day, 0, 0, 0), allDay: true };
  }

  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(raw);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const isUtc = match[7] === "Z";

  const date = isUtc
    ? new Date(Date.UTC(year, month - 1, day, hour, minute, second))
    : new Date(year, month - 1, day, hour, minute, second);
  return { date, allDay: false };
}

export function parseIcs(text: string): IcsEvent[] {
  const lines = unfoldLines(text);
  const events: IcsEvent[] = [];

  let inEvent = false;
  let uid = "";
  let summary = "";
  let categories: string[] = [];
  let start: { date: Date; allDay: boolean } | null = null;
  let end: { date: Date; allDay: boolean } | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "BEGIN:VEVENT") {
      inEvent = true;
      uid = "";
      summary = "";
      categories = [];
      start = null;
      end = null;
      continue;
    }
    if (trimmed === "END:VEVENT") {
      if (inEvent && start) {
        const title = summary.trim() || "(untitled)";
        const resolvedUid =
          uid.trim() || `synthetic-${title}-${start.date.toISOString()}`;
        events.push({
          uid: resolvedUid,
          title,
          start: start.date,
          end: end ? end.date : null,
          allDay: start.allDay,
          categories,
        });
      }
      inEvent = false;
      continue;
    }
    if (!inEvent) continue;

    const parsed = splitLine(line);
    if (!parsed) continue;
    const { name, value } = parsed;

    if (name === "UID") {
      uid = value;
    } else if (name === "SUMMARY") {
      summary = unescapeText(value);
    } else if (name === "CATEGORIES") {
      // Comma-separated list; commas inside a category are escaped as "\,".
      categories = value
        .split(/(?<!\\),/)
        .map((part) => unescapeText(part).trim())
        .filter(Boolean);
    } else if (name === "DTSTART") {
      const isDate = /;VALUE=DATE(?=[;:]|$)/i.test(line);
      start = parseIcsDate(value, isDate);
    } else if (name === "DTEND") {
      const isDate = /;VALUE=DATE(?=[;:]|$)/i.test(line);
      end = parseIcsDate(value, isDate);
    }
  }

  return events;
}

// Round a duration in hours to the nearest 0.25, floored at 0.25.
function roundEstimate(hours: number): number {
  const rounded = Math.round(hours * 4) / 4;
  return Math.max(0.25, rounded);
}

export function mapEventsToWeek(
  events: IcsEvent[],
  weekStart: string,
): ImportCandidate[] {
  const candidates: ImportCandidate[] = [];

  for (const event of events) {
    // v1 limitation: all-day events are skipped (no time-of-day / duration to
    // schedule against a single weekday).
    if (event.allDay) continue;

    // Keep only events that fall inside the currently active week.
    if (getWeekStartIso(event.start) !== weekStart) continue;

    // Map to a weekday; skip weekend events (v1 is Mon-Fri only).
    const day = weekdayKeys[event.start.getDay()];
    if (!day) continue;

    let estimateHours = 1;
    if (event.end && !Number.isNaN(event.end.getTime())) {
      const durationHours =
        (event.end.getTime() - event.start.getTime()) / (1000 * 60 * 60);
      estimateHours =
        durationHours > 0 ? roundEstimate(durationHours) : 1;
    }

    candidates.push({
      uid: event.uid,
      title: event.title,
      day,
      estimateHours,
      categories: event.categories,
    });
  }

  return candidates;
}
