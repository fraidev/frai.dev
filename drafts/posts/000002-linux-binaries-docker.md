+++
title = "Executing linux binaries with docker on windows or mac"
tags = ["docker"]
date = "2021-09-18"
+++


## Motivation

Recently at work, I needed to run a Linux binary on my MacBook. The first idea that came to mind was to install a virtual machine. So, I started downloading VirtualBox along with my favorite Linux distribution, Arch Linux. Meanwhile, I asked [Eduardo](https://twitter.com/TheEduardoRFS) for a good virtual machine software recommendation for macOS, since all I wanted was to run a simple Linux binary. He replied, *“Why not use Docker?”* It’s much simpler, and I already had Docker installed.

## Executing Linux binaries with docker using a Dockerfile

Let's say the binary is called `linuxbinary`.

Creating a Dockerfile is simple, just create a file named `Dockerfile` and fill it with:

``` dockerfile
FROM alpine:3.14
COPY linuxbinary /bin/
ENTRYPOINT ["linuxbinary"]
```

If any arguments are needed, you can define them like this:

``` dockerfile
FROM alpine:3.14
COPY linuxbinary /bin/
ENTRYPOINT ["linuxbinary", "args1", "args2", "args3"]
```

Let’s assume the tag for this image is also `linuxbinary`.

To build and run the image:

``` bash
docker build . -t linuxbinary
docker run linuxbinary
```
