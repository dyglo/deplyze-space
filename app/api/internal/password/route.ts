import { derivePasswordRequest } from "@/lib/password-kdf";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function POST(request: Request) {
  return derivePasswordRequest(request, process.env.PASSWORD_KDF_SECRET);
}
