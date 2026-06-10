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
    const scriptPath = "/Users/aniketh/agentmint-app/scripts/build-packet.ts";
    const currentUrl = `file://${scriptPath}`;

    expect(shouldRunBuildPacketFromCli(undefined, currentUrl)).toBe(false);
    expect(shouldRunBuildPacketFromCli("/tmp/elsewhere.ts", currentUrl)).toBe(false);
    expect(shouldRunBuildPacketFromCli(scriptPath, currentUrl)).toBe(true);
  });

  it("runs the cli path successfully when directly invoked", async () => {
    const scriptPath = "/Users/aniketh/agentmint-app/scripts/build-packet.ts";
    const currentUrl = `file://${scriptPath}`;
    const runner = vi.fn().mockResolvedValue(undefined);

    await expect(
      runBuildPacketFromCli({
        currentUrl,
        invokedPath: scriptPath,
        runner,
      }),
    ).resolves.toBe(true);
    expect(runner).toHaveBeenCalled();
  });

  it("supports the cli path and exits on runner failure", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentmint-script-"));
    const scriptPath = "/Users/aniketh/agentmint-app/scripts/build-packet.ts";
    const currentUrl = `file://${scriptPath}`;

    await execFileAsync(
      "/Users/aniketh/agentmint-app/node_modules/.bin/tsx",
      ["/Users/aniketh/agentmint-app/scripts/build-packet.ts"],
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
        currentUrl,
        invokedPath: scriptPath,
        onError,
        exit,
        runner,
      }),
    ).rejects.toThrow("exit");
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(exit).toHaveBeenCalledWith(1);
  });
});
