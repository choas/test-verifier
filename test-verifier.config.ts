import { defineConfig } from "./src/config";

export default defineConfig({
  llm: {
    provider: "ollama",
    model: "qwen3.6:35b",
  },
});
