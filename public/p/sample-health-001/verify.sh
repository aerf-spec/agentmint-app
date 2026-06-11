#!/usr/bin/env bash
set -euo pipefail
EXPECTED="a34ab8d8d5f508f8cebd63820582eeff62a01481143cb2f5abb696c53b4618c5"
URL="https://agentmint.run/p/sample-health-001/packet.json"
ACTUAL=$(curl -s "$URL" | sha256sum | cut -d' ' -f1)
if [ "$ACTUAL" = "$EXPECTED" ]; then echo "OK  packet matches attested hash $EXPECTED";
else echo "FAIL  expected $EXPECTED"; echo "      got      $ACTUAL"; exit 1; fi
