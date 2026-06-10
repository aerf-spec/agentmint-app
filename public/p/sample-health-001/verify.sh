#!/usr/bin/env bash
set -euo pipefail
EXPECTED="246c20c50cad18d40c2f2fdbb70e1bf8c9d8ba435f44b8f7e7bc2561f9da7f2c"
URL="https://agentmint.run/p/sample-health-001/packet.json"
ACTUAL=$(curl -s "$URL" | sha256sum | cut -d' ' -f1)
if [ "$ACTUAL" = "$EXPECTED" ]; then echo "OK  packet matches attested hash $EXPECTED";
else echo "FAIL  expected $EXPECTED"; echo "      got      $ACTUAL"; exit 1; fi
