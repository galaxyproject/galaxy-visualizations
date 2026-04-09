SHELL := /bin/bash

.DEFAULT_GOAL := help

HOST ?= 127.0.0.1
PORT ?= 4173
DATASET_URL ?= http://cdn.jsdelivr.net/gh/galaxyproject/galaxy-test-data/1.geojson
GALAXY_ROOT ?= http://127.0.0.1:8080
GALAXY_DATASET_ID ?=
GALAXY_KEY ?=

.PHONY: help deps deps-update test build check dev dev-galaxy

help:
	@printf "%s\n" \
		"OpenLayers package targets" \
		"" \
		"Targets:" \
		"  make deps         Install package dependencies with Yarn" \
		"  make deps-update  Bump package dependencies to latest releases" \
		"  make test         Run the OpenLayers unit tests" \
		"  make build        Build the production bundle" \
		"  make check        Run tests and then build" \
		"  make dev          Start Vite with a direct GeoJSON URL smoke test" \
		"  make dev-galaxy   Start Vite against a Galaxy dataset" \
		"" \
		"Variables:" \
		"  HOST              Dev server host (default: $(HOST))" \
		"  PORT              Dev server port (default: $(PORT))" \
		"  DATASET_URL       Direct dataset URL for 'make dev' (default: sample GeoJSON)" \
		"  GALAXY_ROOT       Galaxy root URL for 'make dev-galaxy'" \
		"  GALAXY_DATASET_ID Required Galaxy dataset ID for 'make dev-galaxy'" \
		"  GALAXY_KEY        Optional Galaxy API key for 'make dev-galaxy'"

deps:
	yarn install --non-interactive

deps-update:
	yarn upgrade --latest

test:
	yarn test

build:
	yarn build

check:
	$(MAKE) test
	$(MAKE) build

dev:
	GALAXY_DATASET_URL="$(DATASET_URL)" yarn dev --host "$(HOST)" --port "$(PORT)"

dev-galaxy:
	@if [[ -z "$(GALAXY_DATASET_ID)" ]]; then \
		echo "GALAXY_DATASET_ID is required. Usage: make dev-galaxy GALAXY_DATASET_ID=<dataset-id> [GALAXY_ROOT=<url>] [GALAXY_KEY=<api-key>]"; \
		exit 1; \
	fi
	GALAXY_ROOT="$(GALAXY_ROOT)" GALAXY_DATASET_ID="$(GALAXY_DATASET_ID)" GALAXY_KEY="$(GALAXY_KEY)" yarn dev --host "$(HOST)" --port "$(PORT)"
