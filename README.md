# Battlefield Church — Shared Data Reference

Working on the code (or asking an AI to)? Start with [CLAUDE.md](CLAUDE.md): a map of which file holds what, and how to run the tests.

This project keeps every large shared data table (mission briefs, enemy stats, HUD text, etc.) in its own `Battlechurch*` module to keep the runtime lean.

Whenever you add another shared helper, update [SHARED_MODULES.md](SHARED_MODULES.md) so contributors know where to touch that data. 
