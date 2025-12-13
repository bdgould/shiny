.PHONY: build lint test run

build: lint test
	npm run build

lint:
	npm run lint

test: 
	npm run test

run:
	npm run dev
