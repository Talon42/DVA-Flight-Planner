import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const releaseScript = resolve("release.ps1");
const tempParent = resolve("tmp");
const temporaryRepositories = [];

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", timeout: 30_000 });
  if (result.error) throw result.error;
  expect(result.status, `${command}: ${result.stdout}\n${result.stderr}`).toBe(0);
  return result.stdout.trim();
}

// Exercise the real release script with local-only Git remotes and dependency-free offline Cargo inputs.
function createReleaseRepository({ brokenCargo = false } = {}) {
  mkdirSync(tempParent, { recursive: true });
  const root = mkdtempSync(join(tempParent, "release-test-"));
  temporaryRepositories.push(root);
  const repository = join(root, "project");
  const remote = join(root, "remote.git");
  mkdirSync(join(repository, "src-tauri", "src"), { recursive: true });
  const packageInfo = { name: "release-test", version: "0.8.5-beta", private: true };
  writeFileSync(join(repository, "package.json"), JSON.stringify(packageInfo));
  writeFileSync(join(repository, "package-lock.json"), JSON.stringify({
    ...packageInfo, lockfileVersion: 3, requires: true, packages: { "": packageInfo }
  }));
  writeFileSync(join(repository, "src-tauri", "tauri.conf.json"), JSON.stringify({ version: packageInfo.version }));
  const cargoManifest = '[package]\nname = "flight-planner-app"\nversion = "0.8.5-beta"\nedition = "2021"\n';
  writeFileSync(join(repository, "src-tauri", "Cargo.toml"), cargoManifest);
  writeFileSync(join(repository, "src-tauri", "src", "main.rs"), "fn main() {}\n");
  run("cargo", ["generate-lockfile", "--manifest-path", "src-tauri/Cargo.toml", "--offline"], repository);
  const originalLock = readFileSync(join(repository, "src-tauri", "Cargo.lock"), "utf8");
  if (brokenCargo) {
    writeFileSync(join(repository, "src-tauri", "Cargo.toml"), `${cargoManifest}\n[dependencies]\nmissing-fixture = { path = "missing" }\n`);
  }
  run("git", ["init", "--quiet", "--initial-branch=main"], repository);
  run("git", ["config", "user.name", "Release regression test"], repository);
  run("git", ["config", "user.email", "release-test@example.invalid"], repository);
  run("git", ["config", "commit.gpgsign", "false"], repository);
  run("git", ["config", "tag.gpgsign", "false"], repository);
  run("git", ["config", "core.hooksPath", join(root, "no-hooks")], repository);
  run("git", ["add", "."], repository);
  run("git", ["commit", "--quiet", "-m", "Initial fixture"], repository);
  const initialCommit = run("git", ["rev-parse", "HEAD"], repository);
  run("git", ["init", "--quiet", "--bare", remote], root);
  run("git", ["remote", "add", "origin", remote], repository);
  run("git", ["push", "--quiet", "--set-upstream", "origin", "main"], repository);
  return { repository, remote, originalLock, initialCommit };
}

function release(repository) {
  return spawnSync("powershell.exe", [
    "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", releaseScript,
    "-version", "0.9.0-beta"
  ], { cwd: repository, encoding: "utf8", timeout: 45_000 });
}

afterEach(() => {
  for (const root of temporaryRepositories.splice(0)) {
    // Only remove directories created by this test inside the repository's ignored temporary folder.
    expect(dirname(resolve(root))).toBe(tempParent);
    expect(basename(root).startsWith("release-test-")).toBe(true);
    rmSync(root, { recursive: true, force: true });
  }
});

describe.skipIf(process.platform !== "win32")("Windows release version synchronization", () => {
  it("pushes a synchronized Cargo.lock in the release commit and tag", () => {
    const { repository, remote, originalLock } = createReleaseRepository();
    const result = release(repository);
    if (result.error) throw result.error;
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    const npmLock = JSON.parse(readFileSync(join(repository, "package-lock.json"), "utf8"));
    expect(npmLock.version).toBe("0.9.0-beta");
    expect(npmLock.packages[""].version).toBe("0.9.0-beta");
    const expectedLock = originalLock.replace('version = "0.8.5-beta"', 'version = "0.9.0-beta"');
    expect(readFileSync(join(repository, "src-tauri", "Cargo.lock"), "utf8")).toBe(expectedLock);
    expect(run("git", ["--git-dir", remote, "show", "v0.9.0-beta:src-tauri/Cargo.lock"], repository)).toBe(expectedLock.trim());
    expect(run("git", ["--git-dir", remote, "rev-parse", "refs/heads/main"], repository))
      .toBe(run("git", ["rev-parse", "v0.9.0-beta"], repository));
    expect(run("git", ["status", "--porcelain"], repository)).toBe("");
    run("cargo", ["metadata", "--manifest-path", "src-tauri/Cargo.toml", "--no-deps", "--format-version", "1", "--locked", "--offline"], repository);
  }, 60_000);

  it("stops before committing, pushing, or tagging when Cargo cannot update the lockfile", () => {
    const { repository, remote, initialCommit } = createReleaseRepository({ brokenCargo: true });
    const result = release(repository);
    if (result.error) throw result.error;
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("Updating Cargo.lock... failed.");
    expect(run("git", ["rev-parse", "HEAD"], repository)).toBe(initialCommit);
    expect(run("git", ["--git-dir", remote, "rev-parse", "refs/heads/main"], repository)).toBe(initialCommit);
    expect(run("git", ["tag", "--list"], repository)).toBe("");
    expect(run("git", ["--git-dir", remote, "tag", "--list"], repository)).toBe("");
  }, 60_000);
});
