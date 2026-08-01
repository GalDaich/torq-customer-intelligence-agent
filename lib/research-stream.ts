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
