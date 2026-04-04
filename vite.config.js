import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { execSync } from "node:child_process";

function readBuildGitTag() {
  const ciTag = process.env.GITHUB_REF_NAME?.trim();
  if (ciTag) {
    return ciTag;
  }

  try {
    return execSync("git describe --tags --exact-match", {
      stdio: ["ignore", "pipe", "ignore"]
    })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

export default defineConfig({
  plugins: [tailwindcss(), react()],
  define: {
    "import.meta.env.VITE_BUILD_GIT_TAG": JSON.stringify(readBuildGitTag())
  },
  server: {
    port: 1420,
    strictPort: true
  },
  clearScreen: false
});
