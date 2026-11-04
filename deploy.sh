#!/usr/bin/env bash
# Manual deploy for the Corruption System stage (mirrors .github/workflows/deploy.yml).
# Run from a connection NOT geo-blocked by Chub (the US datacenter egress on the
# dev box is rejected with "This service is not available in your country").
set -euo pipefail
cd "$(dirname "$0")"

CHUB_AUTH_TOKEN="$(grep '^CHUB_AUTH_TOKEN' tokens.ini | cut -d= -f2)"
if [ -z "$CHUB_AUTH_TOKEN" ]; then echo "CHUB_AUTH_TOKEN not found in tokens.ini"; exit 1; fi

# 1. Resolve or create the stage extension id.
if grep -q '^extension_id:' public/chub_meta.yaml; then
  STAGE_ID="$(grep '^extension_id:' public/chub_meta.yaml | cut -d: -f2 | tr -d \" \")"
  echo "Reusing existing extension_id: $STAGE_ID"
else
  echo "Creating new extension..."
  RESP="$(curl -s -H "CH-API-KEY: $CHUB_AUTH_TOKEN" -H "Content-Type: application/json" \
    --request POST --data '{"name":"chub-corrupt-sys"}' https://api.chub.ai/extensions)"
  STAGE_ID="$(printf '%s' "$RESP" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id_v2"])' 2>/dev/null || true)"
  if [ -z "$STAGE_ID" ]; then echo "Failed to create extension. API response: $RESP"; exit 1; fi
  echo "Created extension_id: $STAGE_ID"
  printf "\nextension_id: '%s'\n" "$STAGE_ID" >> public/chub_meta.yaml
fi

# 2. Ensure the character yaml has a stable project_uuid (CI does the same).
CHAR="public/characters/corruption-system.yaml"
if ! grep -q '^project_uuid:' "$CHAR"; then
  U="$(uuidgen)"
  printf "\nproject_uuid: %s\n" "$U" >> "$CHAR"
  echo "Added project_uuid: $U"
fi

# 3. Build.
yarn install --ignore-engines
yarn build

# 4. Zip the dist folder (matches CI: cd dist && zip -r ../build.zip *).
rm -f build.zip
( cd dist && zip -r ../build.zip . >/dev/null )
echo "Built:"; ls -lh build.zip

# 5. Upload.
curl -s -H "CH-API-KEY: $CHUB_AUTH_TOKEN" -F "file=@build.zip" "https://api.chub.ai/extension/${STAGE_ID}/upload"
echo
echo "Deployed to https://api.chub.ai/extension/${STAGE_ID}"
