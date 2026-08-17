#!/usr/bin/env bash
# Commit + push sam-manifest.json in each catalog game repo under ~/dev/sampot/<id>.
set -euo pipefail

ROOT="${GAMES_ROOT:-$HOME/dev/sampot}"
PLAY="${PLAYGROUNDS_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
MSG="${COMMIT_MSG:-chore: add sam-manifest.json for go download list}"
JOBS="${JOBS:-6}"

ids=()
while IFS= read -r id; do
  ids+=("$id")
done < <(
  for f in "$PLAY"/catalog/entries/*.yaml; do
    base=$(basename "$f" .yaml)
    if grep -qE '^kind:[[:space:]]*game[[:space:]]*$' "$f"; then
      echo "$base"
    fi
  done | sort
)

ok=0
fail=0
skip=0
fail_ids=()

commit_one() {
  local id="$1"
  local dir="$ROOT/$id"
  if [[ ! -f "$dir/sam-manifest.json" ]]; then
    echo "SKIP $id (no manifest)"
    return 2
  fi
  local st
  st=$(git -C "$dir" status --porcelain -- sam-manifest.json || true)
  if [[ -z "$st" ]]; then
    echo "SKIP $id (clean)"
    return 2
  fi
  git -C "$dir" add -- sam-manifest.json
  git -C "$dir" commit -m "$MSG"
  git -C "$dir" push -u origin HEAD
  echo "OK $id"
  return 0
}

export -f commit_one
export ROOT MSG

# Sequential is safer for SSH rate limits; JOBS>1 uses xargs -P
if [[ "$JOBS" -le 1 ]]; then
  for id in "${ids[@]}"; do
    if commit_one "$id"; then
      ok=$((ok + 1))
    else
      rc=$?
      if [[ $rc -eq 2 ]]; then
        skip=$((skip + 1))
      else
        fail=$((fail + 1))
        fail_ids+=("$id")
        echo "FAIL $id" >&2
      fi
    fi
  done
else
  tmp=$(mktemp)
  printf '%s\n' "${ids[@]}" | xargs -P "$JOBS" -I{} bash -c '
    id="$1"
    if commit_one "$id"; then
      echo OK
    else
      rc=$?
      if [[ $rc -eq 2 ]]; then echo SKIP
      else echo FAIL:"$id"; exit 0
      fi
    fi
  ' _ {} | tee "$tmp"
  ok=$(grep -c '^OK$' "$tmp" || true)
  skip=$(grep -c '^SKIP$' "$tmp" || true)
  fail=$(grep -c '^FAIL:' "$tmp" || true)
  while IFS= read -r line; do
    [[ "$line" == FAIL:* ]] && fail_ids+=("${line#FAIL:}")
  done < "$tmp"
  rm -f "$tmp"
fi

echo "---"
echo "total=${#ids[@]} ok=$ok skip=$skip fail=$fail"
if [[ ${#fail_ids[@]} -gt 0 ]]; then
  echo "failed: ${fail_ids[*]}"
  exit 1
fi
