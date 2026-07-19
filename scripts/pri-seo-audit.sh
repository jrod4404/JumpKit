#!/bin/zsh
# Primus (Pri) — JumpKit SEO Audit
# Runs daily at 5am, saves report to JumpKit folder

export PATH="/usr/local/bin:/opt/homebrew/bin:/Users/jeffroder/.local/bin:/usr/bin:/bin:$PATH"
export HOME="/Users/jeffroder"

DATE=$(date +%Y-%m-%d)
REPORT_PATH="$HOME/.openclaw/workspace/Topics/JumpKit/seo-audit-$DATE.md"

echo "[$(date)] Starting Pri SEO audit for www.jumpkit.app..." 

hermes profile use seo 2>&1

seo chat --no-tui -p "You are Primus, JumpKit's dedicated SEO agent. Run a full SEO audit on www.jumpkit.app using your seo-audit and seo-aeo-audit skills. Cover: technical SEO, on-page SEO, page speed, meta tags, schema markup, mobile friendliness, and keyword opportunities. Identify the top 10 highest-impact issues and opportunities. For each item include: severity, what to fix, and expected impact. End with a prioritized action plan. Format as clean markdown and save to: $REPORT_PATH" 2>&1

echo "[$(date)] Pri audit complete. Report: $REPORT_PATH"
