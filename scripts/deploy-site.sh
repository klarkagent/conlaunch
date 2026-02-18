#!/bin/bash
# Deploy ConLaunch site to Cloudflare Pages with auto token refresh
set -e

CONFIG="$HOME/Library/Preferences/.wrangler/config/default.toml"
CLIENT_ID="54d11594-84e4-41aa-b438-e81b8fa78ee7"

# Read current tokens
REFRESH_TOKEN=$(grep refresh_token "$CONFIG" | head -1 | sed 's/.*= "//;s/"//')

if [ -z "$REFRESH_TOKEN" ]; then
  echo "No refresh token found. Run: wrangler login"
  exit 1
fi

# Always refresh to get a fresh token
echo "Refreshing Cloudflare token..."
RESPONSE=$(curl -s -X POST "https://dash.cloudflare.com/oauth2/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=refresh_token&refresh_token=$REFRESH_TOKEN&client_id=$CLIENT_ID")

NEW_TOKEN=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])" 2>/dev/null)
NEW_REFRESH=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['refresh_token'])" 2>/dev/null)
EXPIRES_IN=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['expires_in'])" 2>/dev/null)

if [ -z "$NEW_TOKEN" ]; then
  echo "Token refresh failed. Run: wrangler login"
  echo "$RESPONSE"
  exit 1
fi

# Calculate expiration
EXPIRY=$(date -u -v+${EXPIRES_IN}S +"%Y-%m-%dT%H:%M:%S.000Z" 2>/dev/null || date -u -d "+${EXPIRES_IN} seconds" +"%Y-%m-%dT%H:%M:%S.000Z")

# Update config
cat > "$CONFIG" << EOF
oauth_token = "$NEW_TOKEN"
expiration_time = "$EXPIRY"
refresh_token = "$NEW_REFRESH"
scopes = [ "account:read", "user:read", "workers:write", "workers_kv:write", "workers_routes:write", "workers_scripts:write", "workers_tail:read", "d1:write", "pages:write", "zone:read", "ssl_certs:write", "ai:write", "ai-search:write", "ai-search:run", "queues:write", "pipelines:write", "secrets_store:write", "containers:write", "cloudchamber:write", "connectivity:admin", "offline_access" ]
EOF

echo "Token refreshed (expires: $EXPIRY)"

# Deploy
echo "Deploying to Cloudflare Pages..."
CLOUDFLARE_API_TOKEN="$NEW_TOKEN" npx wrangler pages deploy "$(dirname "$0")/../public" --project-name conlaunch

echo "Done!"
