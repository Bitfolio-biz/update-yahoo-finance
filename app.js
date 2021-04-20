var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const { performance } = require('perf_hooks');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');

var influxClient = require("@influxdata/influxdb-client");
var yahooFinance = require('yahoo-finance');
var os = require('os');
var url = "http://mon-influxdb.monitoring:8086";
var host = 'mon-influxdb.monitoring';
//var url = "http://localhost:8086";
//var host = 'localhost';
var port = 8086;
var tcpPortUsed = require('tcp-port-used');

// metrics
global.pMetrics = {codes: 400, payload: 0, timer: 0, influxAlive: 0};
var setCodes = function (newVal) { pMetrics.codes = newVal; }
var setPayload = function (newVal) { pMetrics.payload = newVal; }
var setTimer = function (newVal) { pMetrics.timer = newVal; }
var setInfluxAlive = function (newVal) { pMetrics.influxAlive = newVal; }
var getCodes = function() { return pMetrics.codes; }
var getPayload = function() { return pMetrics.payload; }
var getTimer = function() { return pMetrics.timer; }
var getInfluxAlive = function() { return pMetrics.influxAlive; }

// run every 20 seconds
setInterval(() => {
  // Start timer
  const t0 = performance.now();
  // Get yahoo finance api quote
  yahooFinance.quote({
    symbol: 'GBTC',
    modules: ['price']
  }, function(err, quote) {
    if (err) {
      console.log(err) 
    } else {
      if (quote.price.regularMarketPrice) {
        setCodes(200)
        setPayload(Buffer.byteLength(JSON.stringify(quote)))
      }
      var price = quote.price.regularMarketPrice || 0.0
      var open = quote.price.regularMarketOpen || 0.0
      var volume = quote.price.regularMarketVolume || 0
      var close = quote.price.regularMarketPreviousClose || 0.0
      var symbol = quote.price.symbol || "GBTC"
      var marketCap = quote.price.marketCap || 0
      var tradeTime = quote.price.regularMarketTime || ""
      // End timer
      const t1 = performance.now();
      setTimer(t1 - t0)
      // Write to influxDB
      const writeApi = new influxClient.InfluxDB({ url }).getWriteApi('bitfolio', 'stocks', 's')
      writeApi.useDefaultTags({location: os.hostname()})
      const point1 = new influxClient.Point('gbtc')
          .tag('symbol', symbol)
          .floatField('open', open)
          .floatField('close', close)
          .floatField('price', price)
          .intField('volume', volume)
          .stringField('tradeTime', tradeTime)
          .intField('marketCap', marketCap)
      writeApi.writePoint(point1)
      writeApi.close()
      
      console.log("Wrote gbtc price: " + price + ", volume: " 
      + volume + ", tradeTime: " + tradeTime)
    }
  });

  // Get a price quote
  yahooFinance.quote({
    symbol: 'ETHE',
    modules: ['price']
  }, function(err, quote) {
    if (err) {
      console.log(err) 
    } else {
      var price = quote.price.regularMarketPrice || 0.0
      var open = quote.price.regularMarketOpen || 0.0
      var volume = quote.price.regularMarketVolume || 0
      var close = quote.price.regularMarketPreviousClose || 0.0
      var symbol = quote.price.symbol || "ETHE"
      var marketCap = quote.price.marketCap || 0
      var tradeTime = quote.price.regularMarketTime || ""
      
      // Write to influxDB
      const writeApi = new influxClient.InfluxDB({ url }).getWriteApi('bitfolio', 'stocks', 's')
      writeApi.useDefaultTags({location: os.hostname()})
      const point1 = new influxClient.Point('ethe')
          .tag('symbol', symbol)
          .floatField('open', open)
          .floatField('close', close)
          .floatField('price', price)
          .intField('volume', volume)
          .stringField('tradeTime', tradeTime)
          .intField('marketCap', marketCap)
      writeApi.writePoint(point1)
      writeApi.close()

      console.log("Wrote ethe price: " + price + ", volume: " 
      + volume + ", tradeTime: " + tradeTime)
    }
  });

}, 20000)

const health = require('@cloudnative/health-connect');
let healthCheck = new health.HealthChecker();

const livePromise = () => new Promise((resolve, _reject) => {
  tcpPortUsed.check(port, host)
    .then(function(inUse){
    // console.log('Port ' + port + ' usage : ' + inUse);
    setInfluxAlive(0)
    resolve();
  }, function(err){
    console.log('Error on check : ', err.message);
    _reject(new Error("App is not functioning correctly"));
  });
});

let liveCheck = new health.LivenessCheck("LivenessCheck", livePromise);
healthCheck.registerLivenessCheck(liveCheck);

let readyCheck = new health.ReadinessCheck('ReadyCheck', livePromise) 
healthCheck.registerReadinessCheck(readyCheck);

// metrics for prometheus: codes, payload, timer, influxAlive
// format response for metrics, example:
// http_requests_total{method="post",code="200"} 1027 1395066363000
function createMetrics() {
  const timestamp = Date.now();
  return "update_yahoo_finance_code " + getCodes() + " " + timestamp + "\n"
  + "update_yahoo_finance_payload " + getPayload() + " " + timestamp + "\n"
  + "update_yahoo_finance_timer " + getTimer() + " " + timestamp + "\n"
  + "update_yahoo_finance_influx_alive " + getInfluxAlive() + " " + timestamp + "\n";
}

var metricsRouter = express.Router();
metricsRouter.get('/', (req, res, next) => {
  res.send(createMetrics());
});

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);

// metrics
app.use('/metrics', metricsRouter);

// health checks
app.use('/live', health.LivenessEndpoint(healthCheck));
app.use('/ready', health.ReadinessEndpoint(healthCheck));
app.use('/healthy', health.HealthEndpoint(healthCheck));

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
