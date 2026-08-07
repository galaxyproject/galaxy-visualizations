SHELL := /bin/bash

.DEFAULT_GOAL := help

.PHONY: help fetch-upstream build test check

help:
	@printf "%s\n" \
		"vaRRI Galaxy visualization package targets" \
		"" \
		"Targets:" \
		"  make fetch-upstream  Fetch latest vaRRI-js upstream assets into static/" \
		"  make build           Alias for fetch-upstream" \
		"  make test            Build and run tests" \
		"  make check           Build and run tests" \
		"" \
		"Variables:" \
		"  VARRI_UPSTREAM_REF  Upstream branch or commit (default: main)"

fetch-upstream:
	npm run fetch-upstream

build:
	npm run build

test:
	npm test

check:
	$(MAKE) test
