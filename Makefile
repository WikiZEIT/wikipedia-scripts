.PHONY: test start stop setup

.deployed: citation.js
	cd mediawiki && bash deploy.sh
	touch .deployed

deploy: .deployed

test:
	npx vitest run

start:
	cd mediawiki && docker compose up -d

stop:
	cd mediawiki && docker compose down

setup:
	cd mediawiki && bash setup.sh
