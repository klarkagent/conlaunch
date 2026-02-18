#!/bin/bash
BASE="http://localhost:3000"
KEY="cc8c761df671c3ac7802f7d768ebdc97cedd88d17708117e94b613559f868ce7"

echo "=== 1. Health check ==="
curl -s "$BASE/health"
echo ""

echo "=== 2. Root ==="
curl -s "$BASE/"
echo ""

echo "=== 3. Stats ==="
curl -s "$BASE/stats"
echo ""

echo "=== 4. Deploy WITHOUT API key (expect 401) ==="
curl -s -X POST "$BASE/deploy" -H "Content-Type: application/json" -d '{"name":"Test","symbol":"TST","clientWallet":"0x1234567890abcdef1234567890abcdef12345678"}'
echo ""

echo "=== 5. Deploy WITH key but bad symbol (expect 400) ==="
curl -s -X POST "$BASE/deploy" -H "Content-Type: application/json" -H "Authorization: Bearer $KEY" -d '{"name":"Test","symbol":"T","clientWallet":"0x1234567890abcdef1234567890abcdef12345678"}'
echo ""

echo "=== 6. Preview (public, no auth) ==="
curl -s -X POST "$BASE/preview" -H "Content-Type: application/json" -d '{"name":"Conway AI","symbol":"CAI","clientWallet":"0x1234567890abcdef1234567890abcdef12345678"}'
echo ""

echo "=== 7. 404 ==="
curl -s "$BASE/nonexistent"
echo ""

echo "=== 8. Invalid wallet ==="
curl -s "$BASE/rate-limit/notawallet"
echo ""

echo "=== 9. Tokens (empty, with pagination) ==="
curl -s "$BASE/tokens?page=1&limit=10"
echo ""

echo "=== DONE ==="
