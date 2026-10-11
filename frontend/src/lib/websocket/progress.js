// In-flight message progress, keyed by the upgrade request ID. Each
// connection holds at most one record: the latest ws-progress event.
import { formatSize } from "./presentation.js";

/**
 * Returns progressByRequestId with record as its connection's progress.
 * ws-progress can arrive after the message it describes, or after the
 * connection closed, so record is ignored when messages already holds its
 * message, held (Checkpoint's queue) holds it, or connection is no longer
 * open.
 */
export function applyProgress(progressByRequestId, record, { messages = [], held = [], connection = null } = {}) {
  if (connection && connection.State !== "open") return progressByRequestId;
  const known = (message) => message.ID === record.MessageID;
  if (messages.some(known) || held.some(known)) return progressByRequestId;
  return { ...progressByRequestId, [record.RequestID]: record };
}

/**
 * Returns progressByRequestId without the record for message, once message
 * has arrived. Progress for another message on the connection stays.
 */
export function finishMessage(progressByRequestId, message) {
  if (progressByRequestId[message.RequestID]?.MessageID !== message.ID) {
    return progressByRequestId;
  }
  return clearProgress(progressByRequestId, message.RequestID);
}

/**
 * Returns progressByRequestId without the record for message, once
 * Checkpoint holds it: a held message has been received in full.
 */
export function holdMessage(progressByRequestId, message) {
  return finishMessage(progressByRequestId, message);
}

/**
 * Returns the header chip for record: an arrow for the direction the message
 * travels and "receiving <size> · <n> frames".
 */
export function progressChip(record) {
  const frames = record.Frames === 1 ? "1 frame" : `${record.Frames} frames`;
  return {
    arrow: record.Direction === "client" ? "↑" : "↓",
    label: `receiving ${formatSize(record.Bytes)} · ${frames}`,
  };
}

/**
 * Returns progressByRequestId without the record for requestId.
 */
export function clearProgress(progressByRequestId, requestId) {
  if (!(requestId in progressByRequestId)) return progressByRequestId;
  const { [requestId]: _cleared, ...rest } = progressByRequestId;
  return rest;
}
