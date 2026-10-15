import type { Metadata } from "next";
import Download from "./transfer";
export const metadata: Metadata = {
  title: "Download — Deplyze Space",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <Download id={id} />;
}
