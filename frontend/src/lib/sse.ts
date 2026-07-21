export interface SseDeltaCallback {
  (content: string): void;
}

export async function readSseStream(
  response: Response,
  onDelta: SseDeltaCallback,
  signal?: AbortSignal,
): Promise<void> {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || `Chat request failed with status ${response.status}`);
  }

  if (!response.body) {
    throw new Error('Streaming response has no body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const processEvent = (eventText: string): boolean => {
    const dataLines = eventText
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart());

    const data = dataLines.join('\n');
    if (!data) return false;
    if (data === '[DONE]') return true;

    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      return false; // Skip malformed events
    }

    const parsed2 = parsed as Record<string, unknown>;
    const choices = parsed2['choices'] as Array<Record<string, unknown>> | undefined;
    const delta = choices?.[0]?.['delta'] as Record<string, unknown> | undefined;
    const content = delta?.['content'];
    if (typeof content === 'string' && content.length > 0) {
      onDelta(content);
    }

    return false;
  };

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel();
        throw new Error('Request cancelled');
      }

      const { value, done } = await reader.read();

      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? '';

      for (const event of events) {
        if (processEvent(event)) {
          await reader.cancel();
          return;
        }
      }

      if (done) break;
    }

    if (buffer.trim()) {
      processEvent(buffer);
    }
  } finally {
    reader.releaseLock();
  }
}
