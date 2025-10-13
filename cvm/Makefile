SHELL := /bin/bash

# Usage:
#   make docker-run
#   make docker-run cache=--no-cache
cache ?=

.PHONY: docker-run

docker-run:
	@chmod +x ./docker/docker_run.sh
	@bash ./docker/docker_run.sh $(cache)
