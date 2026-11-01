FROM rocker/r-ver:4.6.0

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libbz2-dev \
        libcurl4-openssl-dev \
        libglpk-dev \
        libgsl-dev \
        libhdf5-dev \
        liblzma-dev \
        libpng-dev \
        libssl-dev \
        libxml2-dev \
        zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*
