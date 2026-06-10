import { access, mkdtemp } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  logBuildPacketError,
  runBuildPacket,
  runBuildPacketFromCli,
  shouldRunBuildPacketFromCli,
} from "@/scripts/build-packet";

const execFileAsync = promisify(execFile);
const SCRIPT_PATH = "/Users/aniketh/agentmint-app/scripts/build-packet.ts";
const SCRIPT_URL = `file://${SCRIPT_PATH}`;

describe("build-packet script", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs error instances directly", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    logBuildPacketError(new Error("boom"));

    expect(spy).toHaveBeenCalledWith("boom");
  });

  it("logs a generic message for unknown errors", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    logBuildPacketError("boom");

    expect(spy).toHaveBeenCalledWith("Unknown packet build failure.");
  });

  it("runs the packet build without throwing when imported", async () => {
    await expect(runBuildPacket()).resolves.toBeUndefined();
  });

  it("detects whether the script should run from the cli", async () => {
    expect(shouldRunBuildPacketFromCli(undefined, SCRIPT_URL)).toBe(false);
    expect(shouldRunBuildPacketFromCli("/tmp/elsewhere.ts", SCRIPT_URL)).toBe(false);
    expect(shouldRunBuildPacketFromCli(SCRIPT_PATH, SCRIPT_URL)).toBe(true);
  });

  it("runs the cli path successfully when directly invoked", async () => {
    const runner = vi.fn().mockResolvedValue(undefined);

    await expect(
      runBuildPacketFromCli({
        currentUrl: SCRIPT_URL,
        invokedPath: SCRIPT_PATH,
        runner,
      }),
    ).resolves.toBe(true);
    expect(runner).toHaveBeenCalled();
  });

  it("supports the cli path and exits on runner failure", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentmint-script-"));

    await execFileAsync(
      "/Users/aniketh/agentmint-app/node_modules/.bin/tsx",
      [SCRIPT_PATH],
      { cwd },
    );

    await access(join(cwd, "public/p/sample-health-001/packet.json"));
    await access(join(cwd, "public/p/sample-health-001/verify.sh"));
    await access(join(cwd, "lib/packet-hash.ts"));

    const onError = vi.fn();
    const exit = vi.fn(() => {
      throw new Error("exit");
    }) as unknown as (code?: number) => never;
    const runner = vi.fn().mockRejectedValue(new Error("broken"));

    await expect(
      runBuildPacketFromCli({
        currentUrl: SCRIPT_URL,
        invokedPath: SCRIPT_PATH,
        onError,
        exit,
        runner,
      }),
    ).rejects.toThrow("exit");
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(exit).toHaveBeenCalledWith(1);
  });
});
