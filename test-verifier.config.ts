import { defineConfig } from "./src/config";

export default defineConfig({
  llm: {
    provider: "ollama",
    model: "gemma4:31b-cloud",
  },
});
