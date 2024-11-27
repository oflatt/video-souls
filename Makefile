# serve is phony
.PHONY: build install

# Define the target to start the server
build:
	tsc


install:
	npm install

