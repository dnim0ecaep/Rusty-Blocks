# AI Integration

## Modes

- text/content
- image/icon
- recommendation
- explanation

## Providers

- Local default text: Ollama (`WARPFORGE_OLLAMA_URL`, `WARPFORGE_OLLAMA_MODEL`)
- Local default image: ComfyUI (`WARPFORGE_COMFYUI_URL`)
- Optional cloud: OpenAI (`OPENAI_API_KEY`, `WARPFORGE_OPENAI_MODEL`)

All AI results are serializable and stored with mode/provider/timestamp.
