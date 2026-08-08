#!/usr/bin/env bash
# LinkedIn scrape helper using Bright Data API
# Usage:
#   export BRIGHTDATA_API_KEY="your_api_key"
#   ./scripts/linkedin_scrape.sh urls.json
# or pass comma-separated URLs as first arg

set -euo pipefail

API_KEY=${BRIGHTDATA_API_KEY:-}
if [ -z "$API_KEY" ]; then
  echo "Set BRIGHTDATA_API_KEY environment variable with your API key." >&2
  exit 1
fi

# Input: either a file containing JSON array of url objects, or comma-separated URLs
if [ $# -ge 1 ] && [ -f "$1" ]; then
  INPUT_JSON=$(cat "$1")
else
  if [ $# -ge 1 ]; then
    IFS=',' read -r -a URLS <<< "$1"
  else
    echo "Provide a JSON file or comma-separated list of LinkedIn profile URLs." >&2
    exit 1
  fi
  # build JSON from URLs
  INPUT_JSON='{"input":['
  first=true
  for u in "${URLS[@]}"; do
    if [ "$first" = true ]; then
      first=false
    else
      INPUT_JSON+=","
    fi
    INPUT_JSON+="{\"url\":\"${u}\"}"
  done
  INPUT_JSON+='],"limit_per_input":10}'
fi

# If user provided a JSON file, ensure it matches expected shape
if [ -n "${INPUT_JSON:-}" ]; then
  BODY="$INPUT_JSON"
fi

ENDPOINT="https://api.brightdata.com/datasets/v3/scrape?dataset_id=gd_l1viktl72bvl7bjuj0&notify=false&include_errors=true"

curl -sS -H "Authorization: Bearer ${API_KEY}" -H "Content-Type: application/json" -d "$BODY" "$ENDPOINT"

echo
