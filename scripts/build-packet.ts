import { pathToFileURL } from "node:url";

import { writePacketArtifacts } from "../lib/packet-build";
import sampleHealthPacket from "../lib/packet-data";

export async function runBuildPacket() {
  await writePacketArtifacts(sampleHealthPacket);
}

export function logBuildPacketError(error: unknown) {
  if (error instanceof Error) {
    console.error(error.message);
    return;
  }

  console.error("Unknown packet build failure.");
}

export function shouldRunBuildPacketFromCli(
  invokedPath: string | undefined,
  currentUrl = import.meta.url,
) {
  return typeof invokedPath === "string" && currentUrl === pathToFileURL(invokedPath).href;
}

type RunBuildPacketFromCliOptions = {
  currentUrl?: string;
  exit?: (code?: number) => never;
  invokedPath?: string;
  onError?: (error: unknown) => void;
  runner?: () => Promise<void>;
};

export async function runBuildPacketFromCli({
  currentUrl = import.meta.url,
  exit = process.exit,
  invokedPath = process.argv[1],
  onError = logBuildPacketError,
  runner = runBuildPacket,
}: RunBuildPacketFromCliOptions = {}) {
  if (!shouldRunBuildPacketFromCli(invokedPath, currentUrl)) {
    return false;
  }

  try {
    await runner();
    return true;
  } catch (error) {
    onError(error);
    exit(1);
    return true;
  }
}

void runBuildPacketFromCli();
