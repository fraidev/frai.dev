+++
title = "Executing linux binaries with docker on windows or mac"
tags = ["docker"]
date = "2021-09-18"
+++


## Motivation

These days at work I had the necessity to run a Linux binary on my MacBook, the first thing that came to my mind is install a virtual machine. So, I started to download the Virtual Box and my favorite Linux distribution, Arch Linux. And meanwhile, I asked [Eduardo](https://twitter.com/TheEduardoRFS) a good virtual machine software for macOS because I want to run a simple Linux binary on my MacBook, and he says "why no use docker?". It's much simpler and I already have the Docker installed.

## Executing Linux binaries with docker using Dockerfile

Let's say the binary is called `linuxbinary`.

Creating a Dockerfile is simple, just create a file called `Dockerfile` and fill it in with:

``` dockerfile
FROM alpine:3.14
COPY linuxbinary /bin/
ENTRYPOINT ["linuxbinary"]
```

If any arguments are needed, use them like this:

``` dockerfile
FROM alpine:3.14
COPY linuxbinary /bin/
ENTRYPOINT ["linuxbinary", "args1", "args2", "args3"]
```

Let's say the tag for this image is called `linuxbinary` too.

For building and run the image: 

``` bash
docker build . -t linuxbinary
docker run linuxbinary
```
