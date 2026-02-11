# ContextBridge

ContextBridge is a VS Code extension that synchronizes design intent and
repository context between browser-based and IDE-based LLMs using
deterministic, incremental context snapshots.

It is designed for developers who think through problems in browser LLMs
but implement and debug code inside an IDE.

## Status
MVP (actively evolving).

Try ContextBridge at: https://marketplace.visualstudio.com/items?itemName=vivek-hipparkar.contextbridge

## How to Use

ContextBridge exposes two explicit actions:

### Sync Repo → Chat
- Click **Context** in the VS Code **status bar**
- Copies a structured snapshot of the entire repository to the clipboard
- First sync sends a project primer; subsequent syncs are incremental

### Deep Sync Current File → Chat
- Click **Deep Sync** in the editor title area (top-right of the file tab)
- Copies the full content of the currently open file, including diagnostics
- Intended for focused debugging or reasoning on a specific file

## Core Principles
- No internal LLMs
- No API calls
- Deterministic logic
- Clipboard-based context transfer
- Incremental, repo-aware syncs

## Scope
ContextBridge focuses on **context transportability**, not automation,
agent behavior, or model intelligence.
