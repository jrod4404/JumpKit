# Workflow Auto

This file outlines the default workflow that the system should follow after startup.

## Steps

1. Read all startup files to restore context.
2. Perform health check to ensure system integrity.
3. Load memory entries for the current day.
4. Initialize any required sub-agents or sessions.
5. Begin listening for user input.

If any of these steps fail, please consult the relevant documentation or ask the user for clarification.