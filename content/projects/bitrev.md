+++
title = "bitrev"
description = "A BitTorrent client written entirely in Rust."
repo = "https://github.com/fraidev/bitrev"
lang = "Rust"
license = "Apache-2.0"
weight = 1
date = "2023-10-25"
+++

BitRev is a BitTorrent client written entirely in Rust. It is a rewrite of tornado, my earlier OCaml client, with the same goal: hand it a `.torrent` file and get the file back, piece by piece, verified.

## try it

```bash
git clone https://github.com/fraidev/bitrev && cd bitrev
cargo run --release -- samples/debian-12.10.0-amd64-netinst.iso.torrent
```

Then check that what came down is what you asked for:

```bash
openssl dgst -sha256 debian-12.10.0-amd64-netinst.iso
```

The hash should match the one in Debian's [SHA256SUMS](https://cdimage.debian.org/debian-cd/current/amd64/bt-cd/SHA256SUMS). Tests run with `cargo test`.

Source and issues at [github.com/fraidev/bitrev](https://github.com/fraidev/bitrev).
