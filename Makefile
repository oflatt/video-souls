# Define the port you want to serve on (default is 8000)
PORT=8000

# Define the target to start the server
serve:
	python -m http.server $(PORT)
