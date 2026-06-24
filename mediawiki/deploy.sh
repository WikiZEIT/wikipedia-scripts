#!/bin/bash
# Quick redeploy of citation.js to local MediaWiki
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "Deploying citation.js..."
docker compose exec -T mediawiki php maintenance/run.php edit \
  --user Admin \
  --summary "Update citation helper" \
  "Użytkownik:Jcubic/CitationHelper.js" < "$DIR/../citation.js"

echo "Done. Reload the edit page to see changes."
