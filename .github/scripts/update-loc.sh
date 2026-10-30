#!/usr/bin/env bash
# Writes the lines of code per language, counted by scc (https://github.com/boyter/scc), into README.md between
# the LOC markers. Run from anywhere in the repository; needs scc and jq.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# Prose and data files aren't code.
table=$(scc --format json --no-cocomo --exclude-ext md,txt,json --exclude-file LICENSE,package-lock.json . | jq -r '
  def fmt: if . >= 1000 then "\(. / 1000 | floor | fmt),\("00\(. % 1000)" | .[-3:])" else tostring end;
  sort_by(-.Code) as $langs
  | "| Language | Files | Code | Comments | Blanks |",
    "| --- | ---: | ---: | ---: | ---: |",
    ($langs[] | "| \(.Name) | \(.Count | fmt) | \(.Code | fmt) | \(.Comment | fmt) | \(.Blank | fmt) |"),
    "| **Total** | **\(map(.Count) | add | fmt)** | **\(map(.Code) | add | fmt)** | **\(map(.Comment) | add | fmt)** | **\(map(.Blank) | add | fmt)** |"
')

TABLE="$table" perl -0pi -e 's/(<!-- LOC:START -->\n).*?(<!-- LOC:END -->)/$1$ENV{TABLE}\n$2/s' README.md
