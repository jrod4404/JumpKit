# MEMORY.md - Long-Term Memory

## Local Model Setup (2026-06-30)
Mac mini M4 48GB running Ollama with these models available:
- `ollama/qwen3.6:27b-mlx` → alias `qwen` — 20GB, 256k context, MLX-optimized, best for OpenClaw agentic use
- `ollama/nemotron-3-nano:latest` → alias `nemotron` — 24GB, 1M context, hybrid Mamba-Transformer MoE
- `ollama/gemma4:26b` — 17GB
- `ollama/gemma4:e4b` → alias `gem-ollama` — 9.6GB
- `ollama/qwen3.5:27b` — 17GB
- `ollama/qwen3.5:35b` — 23GB

Switch models with `/model qwen`, `/model nemotron`, etc.

## Agent Roster
- **Maximus (Max)** — Main OpenClaw agent. Jeff's primary co-pilot.
- **Primus (Pri)** — Hermes SEO agent. Dedicated to ranking JumpKit (www.jumpkit.app).
  - Profile: `hermes profile use seo` / alias `seo`
  - Skills installed: seo-audit, seo-aeo-audit, schema, programmatic-seo, competitors
  - SOUL.md written at `~/.hermes/profiles/seo/SOUL.md`
  - 47 marketingskills also installed globally via npx to workspace `.agents/skills/`

## Config Notes
- `agents.defaults.compaction.reserveTokensFloor` set to 20000 (prevents context limit errors)
- Ollama permissions issue on blobs dir — may need `sudo chown -R $(whoami) ~/.ollama/models/` if pull fails
