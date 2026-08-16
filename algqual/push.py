#!/usr/bin/env python3
"""Push tool for the algqual site.

Usage:
    python3 push.py              # audit, then cache-bust
    python3 push.py --check-only # audit and report, do not touch any files

The audit catches drift between the five qual sub-pages and
qual_solutions_data.js:

  - missing data load or initDotTriggers() in any qual sub-page
  - SOLUTIONS slot vs dot-target count mismatch
  - dot-targets without a matching solution slot, or vice-versa
  - Object.assign targeting the wrong slug

If the audit finds anything fatal it stops without touching the
pages. Missing-but-null solution slots (the data file does not yet
contain that id) are reported as warnings, not failures, so the
"Solution not yet available" placeholder is allowed.

If the audit passes, we compute SHA-1(qual_solutions_data.js)[:8]
and update the <script src="qual_solutions_data.js"> tag on every
qual sub-page to carry that hash as ?v=, so users get the new file
without a hard refresh. Re-running on the same data is a no-op.

After the run, use `git diff` to inspect, then commit when ready.
"""
import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent

# slug -> (qual sub-page filename, expected number of qual problems)
SUBPAGES = {
    "groups":  ("groups-8.html",  12),
    "rings":   ("rings-5.html",   13),
    "modules": ("modules-6.html", 10),
    "linalg":  ("linalg-4.html",   5),
    "fields":  ("fields-7.html",  10),
}
DATA = "qual_solutions_data.js"

# Small colour helpers. They degrade harmlessly when stdout is not a tty.
def _c(code, s):
    return f"\x1b[{code}m{s}\x1b[0m" if sys.stdout.isatty() else s
def red(s):
    return _c("31", s)
def green(s):
    return _c("32", s)
def yellow(s):
    return _c("33", s)
def gray(s):
    return _c("90", s)

def fail(msg):
    print(f"  {red('FAIL')} {msg}")
def ok(msg):
    print(f"  {green('ok')} {msg}")
def warn(msg):
    print(f"  {yellow('!')} {msg}")
def info(msg):
    print(f"    {gray(msg)}")

def parse_data_ids():
    """Return {slug: set(ids)} from qual_solutions_data.js."""
    text = (ROOT / DATA).read_text()
    have = {}
    for slug in SUBPAGES:
        body = text[text.find(f'"{slug}":'):]
        end = body.find("\n },")
        if end >= 0:
            body = body[: end + 1]
        have[slug] = set(re.findall(r'^\s*"(\d+)":', body, re.M))
    return have

def audit():
    """Run all checks. Return number of fatal issues."""
    print("[1/2] audit")
    fatal = 0
    if not (ROOT / DATA).exists():
        fail(f"{DATA} not found")
        return 1
    have = parse_data_ids()

    for slug, (page, expected) in SUBPAGES.items():
        path = ROOT / page
        if not path.exists():
            fail(f"{page} not found")
            fatal += 1
            continue
        text = path.read_text()
        page_ok = True

        if DATA not in text:
            fail(f"{page} does not load {DATA}")
            fatal += 1
            page_ok = False
        if "initDotTriggers" not in text:
            fail(f"{page} does not call initDotTriggers()")
            fatal += 1
            page_ok = False

        # Find the Object.assign(SOLUTIONS, ...) line and check the slug is on it.
        # Nested parens make a single-line regex match awkward, so scan by hand.
        assign_line = next(
            (ln for ln in text.splitlines()
             if "Object.assign" in ln and "SOLUTIONS" in ln),
            None,
        )
        if assign_line is None:
            fail(f"{page} has no Object.assign(SOLUTIONS, ...) line")
            fatal += 1
            page_ok = False
        elif f'"{slug}"' not in assign_line and f"'{slug}'" not in assign_line:
            fail(f"{page} Object.assign does not target slug '{slug}'")
            fatal += 1
            page_ok = False

        want_ids = set(re.findall(r'data-prob="(\d+)"', text))
        slot_ids = set(re.findall(r'SOLUTIONS\["(\d+)"\]\s*=', text))

        if len(want_ids) != expected:
            fail(f"{page} dot-targets={len(want_ids)} expected={expected}")
            fatal += 1
            page_ok = False
        if want_ids != slot_ids:
            extra = want_ids - slot_ids
            missing = slot_ids - want_ids
            if extra:
                fail(f"{page} dot-targets without slot init: {sorted(extra, key=int)}")
                fatal += 1
                page_ok = False
            if missing:
                fail(f"{page} slot init without dot-target: {sorted(missing, key=int)}")
                fatal += 1
                page_ok = False

        unfilled = want_ids - have.get(slug, set())
        unreferenced = have.get(slug, set()) - want_ids

        if page_ok:
            ok(f"{page}  slug={slug}  dot-targets={len(want_ids)}  solutions-filled={len(want_ids - unfilled)}/{expected}")
        if unfilled:
            warn(f"  {slug}: {len(unfilled)} unfilled (placeholder will show), ids {sorted(unfilled, key=int)}")
        if unreferenced:
            warn(f"  {slug}: data file has ids with no matching dot-target: {sorted(unreferenced, key=int)}")

    return fatal

def short_hash():
    return hashlib.sha1((ROOT / DATA).read_bytes()).hexdigest()[:8]

def cache_bust():
    print("\n[2/2] cache-bust")
    v = short_hash()
    pat = re.compile(r'<script src="qual_solutions_data\.js(?:\?v=[a-f0-9]+)?"></script>')
    new_tag = f'<script src="qual_solutions_data.js?v={v}"></script>'
    bumped = 0
    for slug, (page, _) in SUBPAGES.items():
        path = ROOT / page
        t = path.read_text()
        if not pat.search(t):
            warn(f"{page} has no qual_solutions_data.js tag to bump")
            continue
        nt = pat.sub(new_tag, t, count=1)
        if nt == t:
            info(f"{page} already at v={v}")
        else:
            path.write_text(nt)
            bumped += 1
            ok(f"{page}  ->  ?v={v}")
    return v, bumped

def main():
    check_only = "--check-only" in sys.argv[1:]
    fatal = audit()
    if fatal:
        print(f"\n{red(str(fatal) + ' fatal issue(s).')}  fix and re-run, nothing was written.")
        sys.exit(1)
    if check_only:
        print(f"\n{green('audit clean.')}  --check-only: not bumping versions.")
        return
    v, bumped = cache_bust()
    print(f"\n{green('done.')}  v={v}, {bumped} page(s) updated.")
    print("inspect:  git diff -- algqual/*-{1..9}.html algqual/qual_solutions_data.js")
    print("publish:  git add -A algqual/ && git commit -m 'algqual: push solutions'")

if __name__ == "__main__":
    main()
