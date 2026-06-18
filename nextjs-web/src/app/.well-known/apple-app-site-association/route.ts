import { createAppleAssociationResponse } from "@/lib/app-association";

export const dynamic = "force-static";

export function GET(): Response {
  return createAppleAssociationResponse();
}
