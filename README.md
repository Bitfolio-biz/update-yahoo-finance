# update-yahoo-finance
Update influxdb using yahoo finance API

## Create express app
```
npx express-generator
npm install
npm audit
npm audit fix --force
npm start
```

## Install dependencies
```
npm install @cloudnative/health-connect
npm install yahoo-finance
npm install tcp-port-used
```

yahoo-finance has security vulnerabilities. tcp-port-used is used the check for an open tpc port. heath-connect has a builtin ping function to do an HTTP check. I could have used the ping function to check the health of influxdb.

All code lives in app.js.

## Build docker tag and push
```
docker built -t bitfolio/update-yahoo-finance:0.0.0 .
docker login --username bitfolio
docker push bitfolio/update-yahoo-finance:0.0.0
```

