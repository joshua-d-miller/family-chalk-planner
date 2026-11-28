# Notes for Claude

## Commits: credit the maintainer
Every commit made in this repository is authored by the maintainer, with Claude as co-author — the same
pattern as the rest of `main`:

- Author: `Joshua Miller <6114581+joshua-d-miller@users.noreply.github.com>` (his GitHub no-reply address,
  so the commit links to his account without showing a personal email). Set it before the first commit of a
  session: `git config user.name "Joshua Miller"` and
  `git config user.email "6114581+joshua-d-miller@users.noreply.github.com"`.
- Keep Claude as co-author with a `Co-Authored-By:` trailer in the message.
- File headers credit both too (`Author:` lists Joshua D. Miller; changelog rows list `joshua` then
  `claude`), as CONTRIBUTING.md describes.
- A pull request's description credits both ("By Joshua D. Miller and Claude.").

## Everything else
Follow [CONTRIBUTING.md](CONTRIBUTING.md): file headers and comment style, a `CHANGELOG.md` line in plain
words, and the checks CI runs.
