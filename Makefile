# serve is phony
.PHONY: build install

# Define the port you want to serve on (default is 8000)
PORT=8000

# Define the target to start the server
build:
	tsc


install:
	npm install

