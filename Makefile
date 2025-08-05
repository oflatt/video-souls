# serve is phony
.PHONY: build install serve level-schedules

# Define the target to start the server
build:
	npx webpack


install:
	npm install


level-schedules:
	ts-node src/levelSchedules.ts


serve:
	bash serve.sh