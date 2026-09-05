#!/usr/bin/env sh
# Regenerates data/contributions.json for a GitHub user:
#   - merged pull requests in repositories they do not own, grouped by repo
#   - repositories listed in contributions.commits, counted by commits instead
# Repositories in contributions.exclude are skipped (the PR total still counts them).
# Set GITHUB_TOKEN to avoid rate limits.
set -eu
USER="${1:-fraidev}"
OUT="data/contributions.json"
HERE="$(dirname "$0")"
TMP="$(mktemp -d)"
if [ -n "${GITHUB_TOKEN:-}" ]; then AUTH="Authorization: Bearer $GITHUB_TOKEN"; else AUTH="X-Anon: 1"; fi
for p in 1 2 3 4 5 6 7 8 9 10; do
  curl -sS -H "$AUTH" \
    "https://api.github.com/search/issues?q=author:$USER+type:pr+is:merged+-user:$USER&per_page=100&page=$p&sort=created&order=desc" \
    -o "$TMP/prs-$p.json"
  python3 -c "import json,sys; sys.exit(0 if json.load(open('$TMP/prs-$p.json')).get('items') else 1)" || break
done
if [ -f "$HERE/contributions.commits" ]; then
  grep -v '^#' "$HERE/contributions.commits" | grep . | while read -r repo; do
    curl -sS -H "$AUTH" "https://api.github.com/repos/$repo/commits?author=$USER&per_page=100" -o "$TMP/commits-$(echo "$repo" | tr / _).json"
  done
fi
python3 - "$TMP" "$OUT" "$HERE" <<'PY'
import json, sys, glob, collections, datetime, os
tmp, out, here = sys.argv[1], sys.argv[2], sys.argv[3]
def listing(name):
    p = os.path.join(here, name)
    return [l.strip() for l in open(p) if l.strip() and not l.startswith('#')] if os.path.exists(p) else []
exclude = set(listing('contributions.exclude'))
items = []
for f in sorted(glob.glob(f'{tmp}/prs-*.json')):
    items += json.load(open(f)).get('items', [])
seen, prs = set(), []
for i in items:
    if i['html_url'] in seen: continue
    seen.add(i['html_url'])
    prs.append({'repo': i['repository_url'].split('/repos/')[1], 'number': i['number'], 'title': i['title'].strip(),
                'url': i['html_url'], 'merged': (i.get('pull_request', {}).get('merged_at') or i['closed_at'] or '')[:10]})
prs.sort(key=lambda p: p['merged'], reverse=True)
by = collections.defaultdict(list)
for p in prs:
    if p['repo'] not in exclude: by[p['repo']].append(p)
repos = [{'name': r, 'url': f'https://github.com/{r}', 'kind': 'prs', 'count': len(ps),
          'first': min(p['merged'] for p in ps), 'last': max(p['merged'] for p in ps),
          'prs': [{k: p[k] for k in ('number', 'title', 'url', 'merged')} for p in ps]} for r, ps in by.items()]
for repo in listing('contributions.commits'):
    f = f"{tmp}/commits-{repo.replace('/', '_')}.json"
    if not os.path.exists(f): continue
    commits = json.load(open(f))
    if not isinstance(commits, list) or not commits: continue
    dates = sorted(c['commit']['author']['date'][:10] for c in commits)
    repos.append({'name': repo, 'url': f'https://github.com/{repo}', 'kind': 'commits', 'count': len(commits),
                  'first': dates[0], 'last': dates[-1], 'prs': []})
repos.sort(key=lambda r: (-r['count'], r['name']))
data = {'generated': datetime.date.today().isoformat(), 'total': len(prs), 'repos': repos}
json.dump(data, open(out, 'w'), indent=1, ensure_ascii=False)
print(f"{len(prs)} merged PRs total, {len(repos)} repositories listed -> {out}")
PY
