import { ResearchWorkspace } from "@/components/research-workspace";

// The home route is intentionally thin: all interactive product state lives in the
// client-side workspace, while network work stays behind server route handlers.
export default function Home() {
  return <ResearchWorkspace />;
}
