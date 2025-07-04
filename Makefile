# serve is phony
.PHONY: build install serve

# Define the target to start the server
build:
	npx webpack


install:
	npm install


serve:
	bash serve.sh