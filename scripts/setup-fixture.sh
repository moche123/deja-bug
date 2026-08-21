#!/usr/bin/env bash
set -euo pipefail

FIXTURE_DIR="${HOME}/.dejabug-fixture"

if [ ! -d "${FIXTURE_DIR}/.git" ]; then
  rm -rf "${FIXTURE_DIR}"
  mkdir -p "${FIXTURE_DIR}"
  cd "${FIXTURE_DIR}"
  git init -q
  git config user.email "dejabug-fixture@local"
  git config user.name "DejaBug Fixture"
  cat > sample.js <<'EOF'
function add(a, b) {
  return a + b;
}

module.exports = { add };
EOF
  git add .
  git commit -q -m "chore: initial fixture commit"
  echo "Fixture created at ${FIXTURE_DIR}"
else
  echo "Fixture already present at ${FIXTURE_DIR}"
fi
