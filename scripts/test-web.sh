#!/bin/bash
echo "=== HTML (browser) ==="
curl -s http://localhost:3000/ | head -3
echo ""
echo "=== JSON (API client) ==="
curl -s -H "Accept: application/json" http://localhost:3000/
echo ""
echo "=== Logo ==="
curl -s -o /dev/null -w "HTTP %{http_code}, %{content_type}\n" http://localhost:3000/logo.png
echo "=== Stats ==="
curl -s http://localhost:3000/stats
echo ""
