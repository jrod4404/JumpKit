# Custom NSIS include for test builds
# Overrides the running-app check so the installer never blocks on a ghost process
!macro customCheckAppRunning
  # Intentionally empty - skip all app-running checks
  DetailPrint "Skipping app-running check (test build)"
!macroend
