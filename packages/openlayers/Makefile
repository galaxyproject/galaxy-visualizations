SHELL := /bin/bash

.DEFAULT_GOAL := help

HOST ?= 127.0.0.1
PORT ?= 4173
GALAXY_ROOT ?= http://127.0.0.1:8080
GALAXY_DATASET_ID ?=
GALAXY_KEY ?=

.PHONY: help deps deps-update test build check dev

help:
	@printf "%s\n" \
		"OpenLayers package targets" \
		"" \
		"Targets:" \
		"  make deps         Install package dependencies with npm" \
		"  make deps-update  Bump package dependencies to latest releases" \
		"  make test         Run the OpenLayers unit tests" \
		"  make build        Build the production bundle" \
		"  make check        Run tests and then build" \
		"  make dev          Start the Vite dev server" \
		"" \
		"Variables:" \
		"  HOST              Dev server host (default: $(HOST))" \
		"  PORT              Dev server port (default: $(PORT))" \
		"  GALAXY_ROOT       Galaxy root URL (default: $(GALAXY_ROOT))" \
		"  GALAXY_DATASET_ID Optional Galaxy dataset ID; falls back to a sample GeoJSON if unset" \
		"  GALAXY_KEY        Optional Galaxy API key"

deps:
	npm install

deps-update:
	npm update

test:
	npm test

build:
	npm run build

check:
	$(MAKE) test
	$(MAKE) build

dev:
	GALAXY_ROOT="$(GALAXY_ROOT)" GALAXY_DATASET_ID="$(GALAXY_DATASET_ID)" GALAXY_KEY="$(GALAXY_KEY)" npm run dev -- --host "$(HOST)" --port "$(PORT)"
