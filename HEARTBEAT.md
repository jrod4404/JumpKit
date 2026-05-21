# HEARTBEAT.md

## Context Size Alert
Run `session_status` and check the Context token count.
If context is >= 200k tokens, alert Jeff immediately: "⚠️ Context at [X]k — approaching limit, consider compacting."
Otherwise stay silent on this check.
