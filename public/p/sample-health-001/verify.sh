#!/usr/bin/env bash
set -euo pipefail
EXPECTED="af05d3c005329dc77321813d873d826f1b69cbd66df6fcfde813dacb7ffd6cb2"
URL="https://agentmint.run/p/sample-health-001/packet.json"
ACTUAL=$(curl -s "$URL" | sha256sum | cut -d' ' -f1)
if [ "$ACTUAL" = "$EXPECTED" ]; then echo "OK  packet matches attested hash $EXPECTED";
else echo "FAIL  expected $EXPECTED"; echo "      got      $ACTUAL"; exit 1; fi
