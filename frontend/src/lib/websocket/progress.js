// In-flight message progress, keyed by the upgrade request ID. Each
// connection holds at most one record: the latest ws-progress event.

/**
 * Returns progressByRequestId with record as its connection's progress.
 * ws-progress can arrive after the message it describes, or after the
 * connection closed, so record is ignored when messages already holds its
 * message or connection is no longer open.
 */
export function applyProgress(progressByRequestId, record, { messages = [], connection = null } = {}) {
  if (connection && connection.State !== "open") return progressByRequestId;
  if (messages.some((message) => message.ID === record.MessageID)) {
    return progressByRequestId;
  }
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
 * Returns the header chip for record: an arrow for the direction the message
 * travels and "receiving <size> · <n> frames".
 */
export function progressChip(record) {
  const frames = record.Frames === 1 ? "1 frame" : `${record.Frames} frames`;
  return {
    arrow: record.Direction === "client" ? "↑" : "↓",
    label: `receiving ${formatBytes(record.Bytes)} · ${frames}`,
  };
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Returns progressByRequestId without the record for requestId.
 */
export function clearProgress(progressByRequestId, requestId) {
  if (!(requestId in progressByRequestId)) return progressByRequestId;
  const { [requestId]: _cleared, ...rest } = progressByRequestId;
  return rest;
}
