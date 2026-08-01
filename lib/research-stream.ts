import {
  ResearchStreamEventSchema,
  type ResearchProgressEvent,
  type ResearchResponse,
} from "./schemas";

async function responseError(response: Response): Promise<string> {
  const payload: unknown = await response.json().catch(() => ({}));
  return typeof payload === "object" &&
    payload &&
    "error" in payload &&
    typeof payload.error === "string"
    ? payload.error
    : "The research request failed at a protected server boundary.";
}

export async function readResearchStream(
  response: Response,
  onProgress: (event: ResearchProgressEvent) => void,
): Promise<ResearchResponse> {
  if (!response.ok) throw new Error(await responseError(response));
  if (!response.body) throw new Error("The research response did not include a progress stream.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completedResponse: ResearchResponse | undefined;

  const consumeLine = (line: string) => {
    // Each newline is one schema-checked event. The final `complete` event carries the
    // batch result; earlier events exist only to drive live progress.
    if (!line.trim()) return;
    const event = ResearchStreamEventSchema.parse(JSON.parse(line));
    if (event.type === "progress") onProgress(event);
    else if (event.type === "complete") completedResponse = event.response;
    else throw new Error(event.message);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // A network chunk can end halfway through a JSON line, so the unfinished tail stays
    // buffered until the next chunk arrives.
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    lines.forEach(consumeLine);
  }
  buffer += decoder.decode();
  consumeLine(buffer);

  if (!completedResponse) {
    throw new Error("The research progress stream ended before completion.");
  }
  return completedResponse;
}
