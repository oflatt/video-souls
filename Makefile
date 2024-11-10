# serve is phony
.PHONY: serve compile

# Define the port you want to serve on (default is 8000)
PORT=8000

# Define the target to start the server
serve: compile
	python -m http.server $(PORT)


# compile with tsc
compile:
	npm install
	tsc

