# frai.dev

Personal site. A static Hugo site dressed up as a terminal.

## Run locally

```sh
hugo server
```

## Content

- `content/about.md`, `content/contributions.md`, `content/projects/*.md`, `content/posts/*.md`
- `drafts/posts/` holds posts that are not published. Move a file into `content/posts/` to publish it.
- `data/contributions.json` lists merged pull requests. Regenerate with `scripts/contributions.sh`.

## Easter eggs

- `!` opens a shell. Try `help`, `neofetch`, `party`.
- `:` opens a vim command line. Try `:help`, `:set bg=light`, `:q`.
- `j` `k` `gg` `G` scroll, `h` `l` move between posts, `~` or `gh` goes home, `/` searches.
- Type `ffxii` anywhere, or click the avatar.
- `Ctrl-b` is the tmux prefix: `o` next pane, `z` zoom, `%` or `"` split (opens a shell in a pane), `x` kill, `q` pane numbers, `t` clock, `n` `p` `0-5` switch window.
- `:vsplit projects` opens any page in a pane. `tmux split-window` works from the shell.
