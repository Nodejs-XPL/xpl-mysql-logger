/*jslint node: true, vars: true, nomen: true */
'use strict';

var express = require('express');
var Http = require('http');
var debug = require('debug')('xpl-db:server');
var async = require('async');
var noCache = require('connect-nocache')();
var bodyParser = require('body-parser');

class Server {
  constructor(configuration, store) {
    this.configuration = configuration || {};
    this.store = store;

    this.app = this.configuration.express || express();

    if (this.configuration.compression !== false) {
      try {
        var compression = require('compression');
        this.app.use(compression())
      } catch (x) {
        console.error("No compression module !");
      }
    }
  }

  listen(callback) {
    var app = this.app;

    app.use(bodyParser.json());
    app.use(noCache);

    app.get(/^\/last\/(.*)$/, this.getLast.bind(this));
    app.get(/^\/history\/(.*)$/, this.getHistory.bind(this));
    app.get(/^\/minMaxAvgSum\/(.*)$/, this.getMinMaxAvgSum.bind(this));

    app.post('/last', this.getLastSet.bind(this));
    app.post('/history', this.getHistorySet.bind(this));
    app.post('/minMaxAvgSum', this.getMinMaxAvgSumSet.bind(this));

    app.listen(this.configuration.httpPort || 8480, (error) => {
      debug("Server is listening", error);

      callback(error);
    });
  };

  _set(name, request, response, func) {
    var keys = request.body;
    debug(name, " set keys=", keys);

    var options = formatOptions(request);

    var results = {};

    async.eachLimit(keys, 8, (key, callback) => {

      func.call(this.store, key, options, (error, value) => {
        debug(name, " set key=", key, "value=", value, "error=", error);
        if (error) {
          return callback(error);
        }

        results[key] = value;

        callback();
      });

    }, (error) => {
      if (error) {
        // send 500
        if (error.code === 'NOT_FOUND') {
          response.send(404).body("Key '" + error.key + "' not found");
          return;
        }

        response.send(500).body(String(error));
        return;
      }

      response.json(results);
    });
  };

  _get(name, request, response, func) {
    var key = request.params[0];
    debug(name, "key=", key);

    var options = formatOptions(request);

    func.call(this.store, key, options, (error, values) => {
      debug(name, "key=", key, "values=", values);
      if (error) {
        // send 500
        if (error.code === 'NOT_FOUND') {
          response.status(404).send('Key not found');
          return;
        }

        response.status(500).send(String(error));
        return;
      }

      response.json(values);
    });
  }

  getLast(request, response) {
    this._get("Last", request, response, this.store.getLast);
  }

  getHistory(request, response) {
    this._get("History", request, response, this.store.getHistory);
  }

  getMinMaxAvgSum(request, response) {
    this._get("MinMaxAvgSum", request, response, this.store.getMinMaxAvgSum);
  }

  getLastSet(request, response) {
    this._set("Last", request, response, this.store.getLast);
  }

  getHistorySet(request, response) {
    this._set("History", request, response, this.store.getHistory);
  }

  getMinMaxAvgSumSet(request, response) {
    this._set("MinMaxAvgSum", request, response, this.store.getMinMaxAvgSum);
  }
}


function formatOptions(request) {
  var ret = {};

  var query = request.query;
  if (query.limit) {
    ret.limit = parseInt(query.limit, 10);
  }

  if (query.minDate) {
    ret.minDate = new Date(query.minDate);
  }

  if (query.maxDate) {
    ret.maxDate = new Date(query.maxDate);
  }

  if (query.averageMs) {
    ret.averageMs = parseInt(query.averageMs, 10);
  }

  if (query.step) {
    ret.stepMs = parseInt(query.step, 10) * 1000;
  }

  return ret;
}

module.exports = Server;