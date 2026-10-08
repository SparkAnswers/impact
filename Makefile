# Impact - all targets run inside Docker. Nothing here calls npm on the host.
#
#   make build        production build -> ./dist
#   make up           Grafana 13 at http://localhost:3000 with demo dashboards (builds first)
#   make dev          webpack watch + livereload (use in a second terminal next to `make up`)
#   make check        typecheck + lint + unit tests
#   make validate     Grafana plugin-validator against a zip of ./dist
#   make package      ./sparkanswers-impact-app-<version>.zip
#   make image        one-image demo: docker build --target runtime -t impact-grafana .
#   make screenshots  capture README screenshots from the running stack (needs `make up`)

.RECIPEPREFIX = >
SHELL := /bin/sh

PLUGIN_ID := sparkanswers-impact-app
IMAGE_TAG ?= impact-grafana
COMPOSE   ?= docker compose
RUN       := $(COMPOSE) run --rm --no-deps
HOST_UID  := $(shell id -u)
HOST_GID  := $(shell id -g)
# Files written by root inside the node containers that should belong to you.
OWNED     := dist coverage .eslintcache .cache package-lock.json out *.zip

.PHONY: help install build test typecheck lint check dev up down logs validate package \
        image run-image dist-export screenshots fix-perms clean distclean

help:
> @grep -E '^#   make' $(MAKEFILE_LIST) | sed 's/^#   //'

install:
> $(RUN) install
> @$(MAKE) --no-print-directory fix-perms

build:
> $(RUN) build
> @$(MAKE) --no-print-directory fix-perms

test:
> $(RUN) test
> @$(MAKE) --no-print-directory fix-perms

typecheck:
> $(RUN) typecheck

lint:
> $(RUN) lint
> @$(MAKE) --no-print-directory fix-perms

check: typecheck lint test

dev:
> $(COMPOSE) run --rm --no-deps --service-ports dev

up:
> $(COMPOSE) up --build grafana
> @$(MAKE) --no-print-directory fix-perms

down:
> $(COMPOSE) down --remove-orphans

logs:
> $(COMPOSE) logs -f grafana

package: build
> $(RUN) package
> @$(MAKE) --no-print-directory fix-perms

validate: package
> $(RUN) validate

image:
> docker build --target runtime -t $(IMAGE_TAG) .

run-image: image
> docker run --rm -p 3000:3000 $(IMAGE_TAG)

dist-export:
> docker build --target dist --output type=local,dest=./out .

screenshots:
> node scripts/screenshots.mjs

fix-perms:
> @for f in $(OWNED); do [ -e "$$f" ] && chown -R $(HOST_UID):$(HOST_GID) "$$f" 2>/dev/null || true; done

clean:
> rm -rf dist coverage .eslintcache out *.zip work

distclean: clean
> rm -rf node_modules
